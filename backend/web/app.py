"""Independent Hearthglance server: HA OAuth, bounded API access, cached snapshots."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from datetime import datetime, timedelta, timezone
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hashlib
import hmac
import json
import mimetypes
import os
from pathlib import Path
import re
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

import websocket


class LoginRequired(Exception):
    pass


class Unavailable(Exception):
    pass


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    with temporary.open('w') as file:
        os.chmod(temporary, 0o600)
        json.dump(value, file)
    temporary.replace(path)


def cache_id(key):
    # Public cache namespace, not a credential or an HA token.
    return hashlib.sha256(('offline:'+key).encode()).hexdigest()[:24]


class Sessions:
    def __init__(self, path, ha_url, client_id):
        self.path, self.ha_url, self.client_id = Path(path), ha_url, client_id
        self.lock = threading.RLock()
        self.records = json.loads(self.path.read_text()) if self.path.exists() else {}
        self.pending = {}

    def token_request(self, values):
        values = dict(values, client_id=self.client_id)
        request = urllib.request.Request(self.ha_url+'/auth/token',
            data=urllib.parse.urlencode(values).encode())
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                body = response.read()
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as error:
            if error.code in (400, 401, 403):
                raise LoginRequired() from None
            raise Unavailable() from None

    def create(self, tokens):
        sid = secrets.token_urlsafe(32)
        key = hashlib.sha256(sid.encode()).hexdigest()
        with self.lock:
            now = time.time()
            self.records = {k:v for k,v in self.records.items() if v['until'] > now}
            self.records[key] = dict(tokens, csrf=secrets.token_urlsafe(32),
                expires=now+tokens['expires_in']-30, until=now+30*86400)
            write_json(self.path, self.records)
        return sid

    def key(self, sid):
        key = hashlib.sha256(sid.encode()).hexdigest()
        with self.lock:
            if key not in self.records or self.records[key]['until'] < time.time():
                raise LoginRequired()
        return key

    def access(self, key):
        with self.lock:
            record = self.records[key]
            if record['expires'] < time.time():
                try:
                    tokens = self.token_request({'grant_type':'refresh_token',
                        'refresh_token':record['refresh_token']})
                except LoginRequired:
                    del self.records[key]
                    write_json(self.path, self.records)
                    raise
                record.update(tokens, expires=time.time()+tokens['expires_in']-30)
                write_json(self.path, self.records)
            return record['access_token']

    def remove(self, key):
        with self.lock:
            record = self.records.pop(key, None)
            write_json(self.path, self.records)
        if record:
            try: self.token_request({'action':'revoke','token':record['refresh_token']})
            except (LoginRequired, Unavailable, OSError): pass


class HomeAssistant:
    def __init__(self, url, token):
        self.url, self.token = url.rstrip('/'), token

    def http(self, path, data=None, binary=False):
        request = urllib.request.Request(self.url+path,
            data=json.dumps(data).encode() if data is not None else None,
            headers={'Authorization':'Bearer '+self.token(), 'Content-Type':'application/json'})
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                body = response.read()
                return (body, response.headers.get_content_type()) if binary else json.loads(body or 'null')
        except urllib.error.HTTPError as error:
            if error.code in (401, 403): raise LoginRequired() from None
            raise Unavailable('Home Assistant could not complete this request.') from None

    def batch(self, commands):
        url = self.url.replace('https://','wss://').replace('http://','ws://')+'/api/websocket'
        with closing(websocket.create_connection(url, timeout=20)) as connection:
            connection.recv()
            connection.send(json.dumps({'type':'auth','access_token':self.token()}))
            if json.loads(connection.recv()).get('type') != 'auth_ok': raise LoginRequired()
            for index, command in enumerate(commands, 1):
                connection.send(json.dumps(dict(command, id=index)))
            results = {}
            while len(results) < len(commands):
                result = json.loads(connection.recv())
                if result.get('type') == 'result':
                    if not result.get('success'):
                        raise Unavailable('Home Assistant rejected the request.')
                    results[result['id']] = result.get('result')
            return [results[index] for index in range(1, len(commands)+1)]

    def ws(self, command):
        return self.batch([command])[0]


class Data:
    def __init__(self, config):
        self.config = config
        self.calendars = {c['entity'] for c in config['calendars']}
        self.todos = {p['todo'] for p in config['people'] if p.get('todo')} | {p['entity'] for p in config.get('lists', [])}
        self.recipes = config.get('recipes')
        self.entities = self.calendars | self.todos | {self.recipes, config.get('weather')}
        for value in config.get('solar', {}).values():
            self.entities.update(value if isinstance(value, list) else [value])
        self.entities.discard(None)
        self.cache, self.lock = {}, threading.RLock()

    @staticmethod
    def dates(start, end):
        try:
            begins = datetime.fromisoformat(start.replace('Z','+00:00'))
            ends = datetime.fromisoformat(end.replace('Z','+00:00'))
            if begins.tzinfo is None or ends.tzinfo is None: raise ValueError()
            if not timedelta(0) < ends-begins <= timedelta(days=100): raise ValueError()
        except (TypeError, AttributeError): raise ValueError('Invalid calendar range') from None
        return start, end

    def snapshot(self, ha, key, start, end, force=False):
        start, end = self.dates(start, end)
        cache_key = (key, start, end)
        with self.lock:
            cached = self.cache.get(cache_key)
            if cached and not force and time.monotonic()-cached[0] < 30:
                return cached[1]
        errors = []
        previous = cached[1] if cached else {}
        def read(label, callback, fallback):
            try: return callback()
            except LoginRequired: raise
            except Exception:
                errors.append(label+' unavailable')
                return fallback
        states = read('States', lambda: {s['entity_id']:{'state':s['state'],'attributes':s['attributes']} for s in ha.ws({'type':'get_states'})
            if s['entity_id'] in self.entities}, previous.get('states', {}))
        query = urllib.parse.urlencode({'start':start,'end':end})
        with ThreadPoolExecutor(max_workers=6) as pool:
            jobs = {entity:pool.submit(read, 'Calendar',
                lambda entity=entity:ha.http('/api/calendars/'+entity+'?'+query),
                previous.get('calendars', {}).get(entity, [])) for entity in self.calendars}
            calendars = {entity:job.result() for entity,job in jobs.items()}
        todos = {entity:read('List', lambda entity=entity:ha.ws({'type':'todo/item/list','entity_id':entity}),
            {'items':previous.get('todos', {}).get(entity, [])}).get('items', []) for entity in self.todos}
        library = read('Recipes', lambda:ha.ws({'type':'hearthglance_recipes/list','entity_id':self.recipes}),
            {'recipes':previous.get('recipes', [])}) if self.recipes else {'recipes':[]}
        recipes = library.get('recipes', [])
        # Signed HA paths never leave the server. Images use the app's authenticated session.
        for recipe in recipes:
            for image in recipe.get('images', []):
                for variant in ('photo','thumb'):
                    image[variant] = './api/hearthglance_recipes/image/'+image['id']+'/'+variant+'?'+urllib.parse.urlencode({'v':recipe.get('revision',1),'cache':cache_id(key)})
        weather = self.config.get('weather')
        forecast = read('Weather', lambda:ha.http('/api/services/weather/get_forecasts?return_response',
            {'entity_id':weather,'type':'daily'})['service_response'][weather]['forecast'],
            previous.get('forecast', [])) if weather else []
        if errors and not states: raise Unavailable('Home Assistant is unavailable. Your saved dashboard is unchanged.')
        result = {'states':states,'calendars':calendars,'todos':todos,'recipes':recipes,
            'forecast':forecast,'errors':sorted(set(errors)),'start':start,'end':end,
            'updated':datetime.now(timezone.utc).isoformat(),'cache_id':cache_id(key)}
        result['hashes'] = {name:hashlib.sha256(json.dumps(result[name],sort_keys=True).encode()).hexdigest()
            for name in ('states','calendars','todos','recipes','forecast')}
        with self.lock:
            if len(self.cache) >= 24: self.cache.pop(next(iter(self.cache)))
            self.cache[cache_key] = (time.monotonic(), result)
        return result

    def command(self, ha, command):
        kind, entity = command.get('type'), command.get('entity_id')
        if kind in ('calendar/event/create','calendar/event/update','calendar/event/delete'):
            if entity not in self.calendars: raise ValueError('Unknown calendar')
            allowed = {'type','entity_id','event','uid','recurrence_id'}
        elif kind in ('hearthglance_recipes/save','hearthglance_recipes/delete'):
            if entity != self.recipes: raise ValueError('Unknown recipe library')
            allowed = {'type','entity_id','recipe','recipe_id','revision'}
        elif kind == 'todo/item/list':
            if entity not in self.todos: raise ValueError('Unknown list')
            allowed = {'type','entity_id'}
        else: raise ValueError('Unsupported action')
        if set(command)-allowed: raise ValueError('Unexpected action fields')
        return ha.ws(command)

    def service(self, ha, body):
        if body.get('domain') != 'todo' or body.get('service') not in ('add_item','update_item','remove_item'):
            raise ValueError('Unsupported list action')
        entity = body.get('target', {}).get('entity_id')
        if entity not in self.todos: raise ValueError('Unknown list')
        data = body.get('data', {})
        if not isinstance(data, dict) or set(data)-{'item','rename','description','status','due_date'}:
            raise ValueError('Unexpected list fields')
        return ha.http('/api/services/todo/'+body['service'], dict(data, entity_id=entity))

    def invalidate(self, key):
        with self.lock:
            self.cache = {k:v for k,v in self.cache.items() if k[0] != key}


def frame_ancestors(value):
    """CSP frame-ancestors: same origin plus explicitly configured HTTPS origins only."""
    origins = []
    label = r'(?!-)[a-z0-9-]{1,63}(?<!-)'
    for item in (value or '').split():
        parts = urllib.parse.urlsplit(item)
        try: port = parts.port
        except ValueError: port = -1
        host = parts.hostname or ''
        if (parts.scheme != 'https' or port == -1 or parts.path not in ('','/') or parts.query or parts.fragment
                or parts.username is not None or not re.fullmatch(rf'{label}(\.{label})*', host)):
            raise ValueError('HG_FRAME_ANCESTORS accepts space-separated exact https:// origins only')
        origins.append(f'https://{host}' + (f':{port}' if port not in (None, 443) else ''))
    return ' '.join(["'self'", *dict.fromkeys(origins)])


class Application:
    def __init__(self, config, ha_url, ha_public, public_url, state, static, wall=None, framing=''):
        self.config, self.ha_url, self.ha_public = config, ha_url.rstrip('/'), ha_public.rstrip('/')
        self.public = public_url.rstrip('/')+'/'
        self.origin = urllib.parse.urlsplit(self.public)._replace(path='',query='',fragment='').geturl().rstrip('/')
        self.prefix = urllib.parse.urlsplit(self.public).path.rstrip('/')
        self.sessions = Sessions(state, self.ha_url, self.public)
        self.data, self.static = Data(config), Path(static)
        self.wall = Path(wall) if wall else Path(static).parent/'wall'
        self.csp = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
            f"connect-src 'self'; frame-ancestors {frame_ancestors(framing)}; object-src 'none'; base-uri 'self'")


class Handler(BaseHTTPRequestHandler):
    def cookie(self, name):
        try: return SimpleCookie(self.headers.get('Cookie',''))[name].value
        except (KeyError, ValueError): return ''

    @property
    def app(self): return self.server.app

    def respond_headers(self, code, content_type, size, extra=None):
        self.send_response(code)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length',str(size))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('Content-Security-Policy',self.app.csp)
        for key,value in (extra or {}).items(): self.send_header(key,value)
        self.end_headers()

    def send_json(self, body, status=200):
        data = json.dumps(body, separators=(',',':')).encode()
        self.respond_headers(status,'application/json',len(data));self.wfile.write(data)

    def redirect(self, target, cookie=None):
        extra = {'Location':target}
        if cookie: extra['Set-Cookie'] = cookie
        self.respond_headers(303,'text/plain',0,extra)

    def set_cookie(self, name, value, seconds):
        secure = '; Secure' if self.app.public.startswith('https:') else ''
        return f'{name}={value}; Path={self.app.prefix or "/"}; HttpOnly; SameSite=Lax; Max-Age={seconds}{secure}'

    def identity(self):
        key = self.app.sessions.key(self.cookie('hg_session'))
        return key, HomeAssistant(self.app.ha_url, lambda:self.app.sessions.access(key))

    def do_GET(self):
        try: self.get()
        except LoginRequired: self.send_json({'error':'Sign in to Hearthglance.'},401)
        except ValueError: self.send_json({'error':'Invalid request.'},400)
        except Exception: self.send_json({'error':'Could not reach Home Assistant. Saved data is still available.'},503)

    def get(self):
        parsed = urllib.parse.urlsplit(self.path)
        if parsed.path == '/health': self.send_json({'ok':True});return
        if parsed.path == self.app.prefix and self.app.prefix:
            self.redirect(self.app.public);return
        if not parsed.path.startswith(self.app.prefix+'/'): self.send_error(404);return
        path = parsed.path[len(self.app.prefix):]
        query = {k:v[-1] for k,v in urllib.parse.parse_qs(parsed.query).items()}
        if path == '/auth/login':
            state, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(48)
            import base64
            challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
            with self.app.sessions.lock:
                self.app.sessions.pending = {k:v for k,v in self.app.sessions.pending.items() if v[0]>time.time()}
                self.app.sessions.pending[state] = (time.time()+600, verifier)
            url = self.app.ha_public+'/auth/authorize?'+urllib.parse.urlencode({
                'client_id':self.app.public,'redirect_uri':self.app.public+'auth/callback',
                'state':state,'code_challenge':challenge,'code_challenge_method':'S256'})
            self.redirect(url,self.set_cookie('hg_oauth',state,600));return
        if path == '/auth/callback':
            state = query.get('state','')
            with self.app.sessions.lock: pending = self.app.sessions.pending.pop(state,None)
            if not state or not hmac.compare_digest(state,self.cookie('hg_oauth')) or not pending or pending[0]<time.time():
                raise ValueError('Invalid sign-in state')
            tokens = self.app.sessions.token_request({'grant_type':'authorization_code',
                'code':query.get('code',''),'code_verifier':pending[1]})
            sid = self.app.sessions.create(tokens)
            self.redirect(self.app.public,self.set_cookie('hg_session',sid,30*86400));return
        if path.startswith('/api/'):
            key, ha = self.identity()
            if path == '/api/session':
                self.send_json({'config':self.app.config,'csrf':self.app.sessions.records[key]['csrf'],'cache_id':cache_id(key)});return
            if path == '/api/snapshot':
                result = self.app.data.snapshot(ha,key,query.get('start'),query.get('end'),query.get('refresh')=='1')
                known = json.loads(query.get('known','{}'))
                if not isinstance(known,dict): raise ValueError('Invalid snapshot hashes')
                self.send_json({k:v for k,v in result.items() if k not in result['hashes'] or known.get(k)!=result['hashes'][k]});return
            if path == '/api/calendar':
                entity = query.get('entity')
                if entity not in self.app.data.calendars: raise ValueError('Unknown calendar')
                start, end = self.app.data.dates(query.get('start'),query.get('end'))
                self.send_json(ha.http('/api/calendars/'+entity+'?'+urllib.parse.urlencode({'start':start,'end':end})));return
            match = re.fullmatch(r'/api/hearthglance_recipes/image/([a-f0-9]{64})/(photo|thumb)',path)
            if match:
                body, content_type = ha.http(path,binary=True)
                self.respond_headers(200,content_type,len(body));self.wfile.write(body);return
            self.send_error(404);return
        if path == '/wall':
            self.redirect(self.app.public+'wall/');return
        if path.startswith('/wall/'):
            # Wall is a separate entry point outside the Sidekick service-worker shell.
            asset = path[len('/wall/'):] or 'index.html'
            if asset not in {'index.html','wall.css','wall.js'}: self.send_error(404);return
            body = (self.app.wall/asset).read_bytes()
            self.respond_headers(200,mimetypes.guess_type(asset)[0] or 'application/octet-stream',len(body))
            self.wfile.write(body);return
        asset = 'index.html' if path == '/' else path.lstrip('/')
        if asset not in {'index.html','app.js','app.css','sw.js','manifest.webmanifest','icon.svg',
                        'icon-192.png','icon-512.png','icon-maskable-512.png','apple-touch-icon.png'}:
            self.send_error(404);return
        file = self.app.static/asset
        body = file.read_bytes()
        self.respond_headers(200,mimetypes.guess_type(file.name)[0] or 'application/octet-stream',len(body))
        self.wfile.write(body)

    def do_POST(self):
        try:
            key, ha = self.identity()
            origin = self.headers.get('Origin')
            if origin and origin != self.app.origin: raise ValueError('Unexpected origin')
            csrf = self.headers.get('X-HG-CSRF','')
            if not hmac.compare_digest(csrf,self.app.sessions.records[key]['csrf']):
                self.send_json({'error':'Reload the app before saving.'},403);return
            if self.headers.get('Sec-Fetch-Site') == 'cross-site':
                self.send_json({'error':'Unexpected request origin.'},403);return
            size = int(self.headers.get('Content-Length','0'))
            if not 0 < size <= 128*1024: raise ValueError('Invalid request size')
            body = json.loads(self.rfile.read(size))
            if not isinstance(body,dict): raise ValueError('Invalid request')
            path = urllib.parse.urlsplit(self.path).path
            if path == self.app.prefix+'/api/logout':
                self.app.sessions.remove(key);self.app.data.invalidate(key)
                self.respond_headers(200,'application/json',2,{'Set-Cookie':self.set_cookie('hg_session','',0)})
                self.wfile.write(b'{}');return
            if path == self.app.prefix+'/api/command': result = self.app.data.command(ha,body)
            elif path == self.app.prefix+'/api/service': result = self.app.data.service(ha,body)
            else: self.send_error(404);return
            self.app.data.invalidate(key)
            self.send_json(result)
        except LoginRequired: self.send_json({'error':'Sign in before saving.'},401)
        except (ValueError, TypeError, KeyError): self.send_json({'error':'Invalid or unsupported action.'},400)
        except Exception: self.send_json({'error':'Could not confirm the save. Refresh before trying again.'},503)

    def log_message(self, *args): pass  # Never log cookies, auth codes, queries, or family data.


def serve(app, host='0.0.0.0', port=8080):
    server = ThreadingHTTPServer((host,port),Handler)
    server.app = app
    return server


def runtime(env, root):
    """Resolve and check runtime mounts before serving. Defaults keep the pre-monorepo layout."""
    config_path = Path(env.get('HG_CONFIG', '/app/config.json'))
    sessions = Path(env.get('HG_SESSIONS', '/state/sessions.json'))
    missing = [name for name in ('HA_URL','HA_PUBLIC_URL','HG_PUBLIC_URL') if not env.get(name)]
    if missing: raise SystemExit('Hearthglance: set '+', '.join(missing))
    if not config_path.is_file(): raise SystemExit(f'Hearthglance: config not found at {config_path}; mount it read-only')
    try: config = json.loads(config_path.read_text())
    except (OSError, ValueError) as error: raise SystemExit(f'Hearthglance: cannot read config {config_path}: {error}') from None
    data_dir = sessions.parent
    if not data_dir.is_dir(): raise SystemExit(f'Hearthglance: data directory {data_dir} is missing; provision it before startup')
    if not os.access(data_dir, os.W_OK): raise SystemExit(f'Hearthglance: data directory {data_dir} is not writable by uid {os.getuid()}')
    try: frame_ancestors(env.get('HG_FRAME_ANCESTORS',''))
    except ValueError as error: raise SystemExit(f'Hearthglance: {error}') from None
    return Application(config, env['HA_URL'], env['HA_PUBLIC_URL'], env['HG_PUBLIC_URL'], sessions,
        Path(env.get('HG_STATIC', root/'static')), Path(env.get('HG_WALL', root/'wall')),
        env.get('HG_FRAME_ANCESTORS',''))


if __name__ == '__main__':
    serve(runtime(os.environ, Path(__file__).resolve().parent)).serve_forever()
