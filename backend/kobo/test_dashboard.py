import base64
import copy
from datetime import datetime
from io import BytesIO
import unittest
from PIL import Image
from dashboard import complete_item, draw_view, offline_pack, PAGES


class HA:
    def __init__(self, item): self.item=item;self.writes=[]
    def api(self,path,data):
        if 'get_items' in path:
            return {'service_response':{data['entity_id']:{'items':[self.item]}}}
        self.writes.append(data)
        self.item['status']=data['status']


class DashboardTest(unittest.TestCase):
    def setUp(self):
        self.config={'timezone':'America/New_York','household':'Test family',
            'chores':[{'entity':'todo.chores','name':'Alex'}],
            'lists':[{'entity':'todo.groceries','name':'Groceries'}]}
        self.item={'uid':'test-uid','summary':'Chore','status':'needs_action',
            'description':'{"hearthglance":{"repeat":"daily"},"other":{"keep":true}}'}
        self.snapshot={'updated':datetime.now().astimezone().isoformat(),'weather':None,'forecast':[],
            'events':[],'meals':[],'errors':[],
            'todos':{'todo.chores':[self.item],'todo.groceries':[self.item]},
            'recipes':[{'id':'recipe-1','title':'Example recipe','ingredients':'Line one\nLine two',
                'instructions':'Step one. '*200,'categories':[]} for _ in range(20)]}

    def test_completion_preserves_recurring_chore_metadata_and_is_idempotent(self):
        import json
        ha=HA(copy.deepcopy(self.item))
        complete_item(ha,self.config,'todo.chores','test-uid',today='2026-10-29')
        result=json.loads(ha.writes[0]['description'])
        self.assertEqual(result['hearthglance'],{'repeat':'daily','completed_on':'2026-10-29'})
        self.assertTrue(result['other']['keep'])
        complete_item(ha,self.config,'todo.chores','test-uid')
        self.assertEqual(len(ha.writes),1)

    def test_other_entities_rejected_before_ha_call(self):
        ha=HA(copy.deepcopy(self.item))
        with self.assertRaises(ValueError):complete_item(ha,self.config,'todo.private','test-uid')
        self.assertEqual(ha.writes,[])

    def test_list_completion_does_not_rewrite_description(self):
        ha=HA(copy.deepcopy(self.item))
        complete_item(ha,self.config,'todo.groceries','test-uid')
        self.assertNotIn('description',ha.writes[0])

    def test_all_tabs_and_hit_regions_match_native_dimensions(self):
        for key,_ in PAGES:
            bundle=draw_view(self.snapshot,self.config,page=key)
            im=Image.open(BytesIO(base64.b64decode(bundle['png'])))
            self.assertEqual(im.size,(1072,1448))
            self.assertEqual(len([h for h in bundle['hits'] if h['rect'][1]==105]),6)
            actions={h['action']['type'] for h in bundle['hits']}
            self.assertTrue({'read','refresh','settings'}<=actions)
            for h in bundle['hits']:
                x,y,w,height=h['rect']
                self.assertTrue(0<=x<x+w<=1072 and 0<=y<y+height<=1448)
            if key in ('calendar','meals','recipes'):
                self.assertFalse(any(h['action']['type']=='complete' for h in bundle['hits']))

    def test_recipe_sections_use_full_local_scroll_content(self):
        bundle=draw_view(self.snapshot,self.config,page='recipes',recipe='recipe-1',section='instructions')
        self.assertEqual(bundle['scroll']['text'],self.snapshot['recipes'][0]['instructions'])
        self.assertEqual(bundle['scroll']['rect'],[64,475,944,680])
        self.assertFalse(any(h['action'].get('offset',0)>0 for h in bundle['hits']))
        self.assertTrue(any(h['action'].get('section')=='ingredients' for h in bundle['hits']))
        with self.assertRaises(ValueError):draw_view(self.snapshot,self.config,page='admin')

    def test_next_up_contains_every_event_without_paging(self):
        event={'title':'Appointment','start':self.snapshot['updated'],'end':self.snapshot['updated'],
               'all_day':False,'person':'Family'}
        self.snapshot['events']=[{**event,'title':'Appointment '+str(i)} for i in range(35)]
        bundle=draw_view(self.snapshot,self.config,page='home',offset=20)
        self.assertIn('Appointment 34',bundle['scroll']['text'])
        self.assertEqual(bundle['scroll']['text'].count('Appointment '),35)
        self.assertEqual(bundle['view']['offset'],0)
        self.assertFalse(any(h['action'].get('offset',0)>0 for h in bundle['hits']))

    def test_offline_pack_covers_navigation_and_shares_recipe_templates(self):
        pack=offline_pack(self.snapshot,self.config)
        for page,_ in PAGES:self.assertIn(page+':0:0',pack['views'])
        self.assertIn('recipes:0:14',pack['views'])
        self.assertIn('chores:1:0',pack['views'])
        for bundle in pack['views'].values():
            for hit in bundle['hits']:
                a=hit['action']
                if a['type']!='view' or a.get('recipe'):continue
                self.assertIn(f"{a['page']}:{a.get('group',0)}:{a.get('offset',0)}",pack['views'])
        self.assertEqual(sum(k.startswith('recipe:') for k in pack['views']),3)
        self.assertEqual(pack['recipes']['recipe-1']['instructions'],self.snapshot['recipes'][0]['instructions'])
        self.assertIsInstance(pack['views']['home:0:0']['updated_epoch'],int)


if __name__=='__main__':unittest.main()
