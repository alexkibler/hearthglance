from copy import deepcopy
import http.client
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.parse import urlsplit, parse_qs

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import app

CONFIG={'household':'Test family','people':[{'id':'family','name':'Family','todo':'todo.home'}],
 'calendars':[{'entity':'calendar.home','kind':'meals','person':'family'}],
 'lists':[],'recipes':'sensor.recipes','weather':'weather.home'}
IMAGE='a'*64
class FakeHA:
    def __init__(self,*args): self.calls=[]
    def ws(self,command):
        self.calls.append(command)
        if command['type']=='get_states':return [
            {'entity_id':'weather.home','state':'sunny','attributes':{'temperature':70}},
            {'entity_id':'sensor.secret','state':'must not reach the browser','attributes':{}}]
        if command['type']=='todo/item/list':return {'items':[{'uid':'task1','summary':'Dishes'}]}
        if command['type']=='hearthglance_recipes/list':return {'recipes':[{'id':'r1','title':'Soup','images':[
            {'id':IMAGE,'photo':'/api/private?authSig=SECRET','thumb':'/api/private?authSig=SECRET'}]}]}
        return {'saved':True}
    def http(self,path,data=None,binary=False):
        self.calls.append((path,data))
        if binary:return b'jpeg','image/jpeg'
        if path.startswith('/api/calendars/'):return [{'uid':'dinner1','summary':'Soup','start':'2026-11-08','end':'2026-11-09'}]
        if path.startswith('/api/services/weather'):return {'service_response':{'weather.home':{'forecast':[]}}}
        return []


class DataTests(unittest.TestCase):
    def setUp(self):self.data=app.Data(deepcopy(CONFIG));self.ha=FakeHA()
    def test_snapshot_filters_entities_removes_ha_signatures_and_caches_by_user(self):
        first=self.data.snapshot(self.ha,'one','2026-11-01T00:00:00Z','2026-12-13T00:00:00Z')
        self.assertNotIn('sensor.secret',first['states'])
        self.assertNotIn('SECRET',json.dumps(first))
        self.assertTrue(first['recipes'][0]['images'][0]['photo'].startswith('./api/'))
        self.assertIn('cache='+first['cache_id'],first['recipes'][0]['images'][0]['photo'])
        calls=len(self.ha.calls)
        self.assertIs(first,self.data.snapshot(self.ha,'one',first['start'],first['end']))
        self.assertEqual(calls,len(self.ha.calls))
        other=self.data.snapshot(self.ha,'other',first['start'],first['end'])
        self.assertIsNot(first,other)
        self.assertNotEqual(first['cache_id'],other['cache_id'])
    def test_allowlist_blocks_arbitrary_commands_and_service_targets(self):
        for command in [{'type':'auth/long_lived_access_token'},
            {'type':'calendar/event/delete','entity_id':'calendar.other'},
            {'type':'hearthglance_recipes/delete','entity_id':'sensor.other'},
            {'type':'todo/item/list','entity_id':'todo.other'}]:
            with self.assertRaises(ValueError):self.data.command(self.ha,command)
        for body in [{'domain':'homeassistant','service':'restart','target':{'entity_id':'todo.home'}},
            {'domain':'todo','service':'update_item','target':{'entity_id':'todo.other'}}]:
            with self.assertRaises(ValueError):self.data.service(self.ha,body)
        self.assertEqual(self.ha.calls,[])
    def test_supported_writes_use_only_configured_resources(self):
        self.data.command(self.ha,{'type':'calendar/event/create','entity_id':'calendar.home','event':{'summary':'Dinner'}})
        self.data.service(self.ha,{'domain':'todo','service':'update_item','target':{'entity_id':'todo.home'},'data':{'item':'task1','status':'completed'}})
        self.assertEqual(self.ha.calls[-1][1]['entity_id'],'todo.home')
    def test_ranges_are_bounded_and_timezone_aware(self):
        for start,end in [('2026-01-01','2026-01-02'),('bad','bad'),('2026-01-01T00:00:00Z','2027-01-01T00:00:00Z')]:
            with self.assertRaises(ValueError):self.data.dates(start,end)


class HTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.app=app.Application(CONFIG,'http://ha.test','https://ha.test','https://app.test/hearthglance/',Path(self.temp.name)/'sessions.json',Path(app.__file__).parent/'static')
        self.sid=self.app.sessions.create({'access_token':'private-token','refresh_token':'private-refresh','expires_in':3600})
        self.key=self.app.sessions.key(self.sid);self.csrf=self.app.sessions.records[self.key]['csrf']
        self.server=app.serve(self.app,'127.0.0.1',0)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        self.mock=patch('app.HomeAssistant',FakeHA);self.mock.start()
    def tearDown(self):
        self.mock.stop();self.server.shutdown();self.server.server_close();self.temp.cleanup()
    def request(self,path,method='GET',body=None,auth=True,headers=None):
        h={'Cookie':'hg_session='+self.sid} if auth else {}
        if body is not None:h.update({'Content-Type':'application/json','X-HG-CSRF':self.csrf,'Origin':'https://app.test'})
        h.update(headers or {})
        conn=http.client.HTTPConnection('127.0.0.1',self.server.server_port)
        conn.request(method,'/hearthglance/'+path,json.dumps(body) if body is not None else None,h)
        response=conn.getresponse();data=response.read();result=(response.status,dict(response.getheaders()),data);conn.close();return result
    def test_public_shell_private_api_and_no_token_in_session_response(self):
        self.assertEqual(self.request('',auth=False)[0],200)
        self.assertEqual(self.request('api/session',auth=False)[0],401)
        status,headers,body=self.request('api/session')
        self.assertEqual(status,200);self.assertNotIn(b'private-token',body)
        self.assertIn("frame-ancestors 'self'",headers['Content-Security-Policy'])
        self.assertEqual(headers['Cache-Control'],'no-store')
        for icon in ['apple-touch-icon.png','icon-192.png','icon-512.png','icon-maskable-512.png']:
            status,headers,body=self.request(icon,auth=False)
            self.assertEqual(status,200);self.assertEqual(headers['Content-Type'],'image/png')
    def test_csrf_origin_and_scope_are_enforced(self):
        body={'type':'calendar/event/delete','entity_id':'calendar.home','uid':'1'}
        self.assertEqual(self.request('api/command','POST',body,headers={'X-HG-CSRF':''})[0],403)
        self.assertEqual(self.request('api/command','POST',body,headers={'Origin':'https://evil.test'})[0],400)
        self.assertEqual(self.request('api/command','POST',body)[0],200)
        self.assertEqual(self.request('api/command','POST',{'type':'auth/long_lived_access_token'})[0],400)
    def test_snapshot_delta_omits_unchanged_recipe_payload(self):
        query='api/snapshot?start=2026-11-01T00%3A00%3A00Z&end=2026-12-13T00%3A00%3A00Z'
        status,_,body=self.request(query);self.assertEqual(status,200);snapshot=json.loads(body)
        from urllib.parse import quote
        status,_,body=self.request(query+'&known='+quote(json.dumps(snapshot['hashes'])))
        self.assertEqual(status,200);self.assertNotIn('recipes',json.loads(body));self.assertLess(len(body),700)
    def test_login_nonce_pkce_and_callback_cookie_binding(self):
        status,headers,_=self.request('auth/login',auth=False)
        self.assertEqual(status,303);self.assertIn('HttpOnly',headers['Set-Cookie'])
        query=parse_qs(urlsplit(headers['Location']).query)
        self.assertEqual(query['code_challenge_method'],['S256'])
        state=query['state'][0]
        with patch.object(self.app.sessions,'token_request',return_value={'access_token':'new','refresh_token':'refresh','expires_in':3600}):
            self.assertEqual(self.request('auth/callback?code=test&state='+state,auth=False)[0],400)
        self.assertEqual(self.request('auth/callback?code=test&state=wrong',auth=False)[0],400)
    def test_oauth_success_and_logout_revoke_only_the_app_session(self):
        _,headers,_=self.request('auth/login',auth=False)
        state=parse_qs(urlsplit(headers['Location']).query)['state'][0]
        with patch.object(self.app.sessions,'token_request',return_value={'access_token':'new','refresh_token':'refresh','expires_in':3600}):
            status,headers,_=self.request('auth/callback?code=test&state='+state,auth=False,headers={'Cookie':'hg_oauth='+state})
            self.assertEqual(status,303);self.assertIn('Secure',headers['Set-Cookie'])
            status,_,_=self.request('api/logout','POST',{})
            self.assertEqual(status,200);self.assertEqual(self.request('api/session')[0],401)
    def test_old_wall_address_opens_the_dashboard_and_keeps_kiosk_options(self):
        status,headers,_=self.request('wall',auth=False)
        self.assertEqual((status,headers['Location']),(303,'https://app.test/hearthglance/'))
        status,headers,_=self.request('wall/?idle=10&debug=1',auth=False)
        self.assertEqual((status,headers['Location']),(303,'https://app.test/hearthglance/?idle=10&debug=1'))
        for path in ('wall/wall.js','wall/index.html','wall/events'):
            self.assertEqual(self.request(path,auth=False)[0],404)
    def test_session_carries_slideshow_settings(self):
        self.app.slideshow_idle=10
        body=json.loads(self.request('api/session')[2])
        self.assertEqual(body['slideshow'],{'interval':12,'idle':10})


class FramingTests(unittest.TestCase):
    def test_frame_ancestors_accepts_only_explicit_https_origins(self):
        self.assertEqual(app.frame_ancestors(''),"'self'")
        self.assertEqual(app.frame_ancestors('https://ha.example.test https://HA.example.test/ https://ha.example.test:443'),"'self' https://ha.example.test")
        self.assertEqual(app.frame_ancestors('https://ha.example.test:8443'),"'self' https://ha.example.test:8443")
        for bad in ('http://ha.test','*','https://*','https://*.example.test','https://ha.example.test:*','https://ha.example.test:0x1',
                    'https://ha.example.test:99999','https://*.test/x','https://ha.test/path','https://u@ha.test','https://:pw@ha.test',
                    'https://ha.test?x','https://-bad.test','https://ha_test.test',"'unsafe-inline'"):
            with self.assertRaises(ValueError,msg=bad):app.frame_ancestors(bad)
    def test_configured_origin_reaches_every_response(self):
        with tempfile.TemporaryDirectory() as folder:
            application=app.Application(CONFIG,'http://ha.test','https://ha.test','https://app.test/hg/',Path(folder)/'s.json',Path(folder),'https://ha.example.test')
            self.assertIn("frame-ancestors 'self' https://ha.example.test;",application.csp)


class RuntimeTests(unittest.TestCase):
    ENV={'HA_URL':'http://ha.test','HA_PUBLIC_URL':'https://ha.test','HG_PUBLIC_URL':'https://app.test/hearthglance/'}
    def env(self,folder,**extra):
        config=Path(folder)/'config.json';config.write_text(json.dumps(CONFIG))
        (Path(folder)/'data').mkdir(exist_ok=True)
        return dict(self.ENV,HG_CONFIG=str(config),HG_SESSIONS=str(Path(folder)/'data'/'sessions.json'),**extra)
    def test_valid_mounts_build_the_application(self):
        with tempfile.TemporaryDirectory() as folder:
            application=app.runtime(self.env(folder),Path(folder))
            self.assertEqual(application.prefix,'/hearthglance');self.assertEqual(application.slideshow_idle,5)
            self.assertEqual(app.runtime(self.env(folder,HG_SLIDESHOW_IDLE_MINUTES='0'),Path(folder)).slideshow_idle,0)
            self.assertEqual(app.runtime(self.env(folder,HG_SLIDESHOW_IDLE_MINUTES='15'),Path(folder)).slideshow_idle,15)
            self.assertEqual(app.runtime(self.env(folder,HG_WALL_IDLE_MINUTES='7'),Path(folder)).slideshow_idle,7)   # earlier name
    def test_missing_or_unusable_mounts_fail_with_a_clear_message(self):
        with tempfile.TemporaryDirectory() as folder:
            env=self.env(folder)
            cases={'config not found':dict(env,HG_CONFIG=str(Path(folder)/'none.json')),
                'data directory':dict(env,HG_SESSIONS=str(Path(folder)/'missing'/'sessions.json')),
                'set HA_URL':{k:v for k,v in env.items() if k!='HA_URL'},
                'https:// origins':dict(env,HG_FRAME_ANCESTORS='*'),
                'HG_SLIDESHOW_IDLE_MINUTES':dict(env,HG_SLIDESHOW_IDLE_MINUTES='soon')}
            for message,value in cases.items():
                with self.assertRaises(SystemExit) as raised:app.runtime(value,Path(folder))
                self.assertIn(message,str(raised.exception))
            Path(env['HG_CONFIG']).write_text('{')
            with self.assertRaises(SystemExit) as raised:app.runtime(env,Path(folder))
            self.assertIn('cannot read config',str(raised.exception))


class SessionTests(unittest.TestCase):
    def test_expired_access_refreshes_and_revoked_refresh_invalidates_the_session(self):
        with tempfile.TemporaryDirectory() as folder:
            sessions=app.Sessions(Path(folder)/'sessions.json','http://ha.test','https://app.test/')
            sid=sessions.create({'access_token':'old','refresh_token':'original-refresh','expires_in':0})
            key=sessions.key(sid)
            with patch.object(sessions,'token_request',return_value={'access_token':'renewed','expires_in':3600}) as request:
                self.assertEqual(sessions.access(key),'renewed')
                self.assertEqual(request.call_args.args[0]['refresh_token'],'original-refresh')
            sessions.records[key]['expires']=0
            with patch.object(sessions,'token_request',side_effect=app.LoginRequired):
                with self.assertRaises(app.LoginRequired):sessions.access(key)
            with self.assertRaises(app.LoginRequired):sessions.key(sid)

if __name__=='__main__':unittest.main()
