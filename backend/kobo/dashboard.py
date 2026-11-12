"""Interactive e-ink pages: PNG plus matching, explicit tap actions."""
import base64
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from html import unescape
from html.parser import HTMLParser
from io import BytesIO
import json
import textwrap
import urllib.parse
from zoneinfo import ZoneInfo
from PIL import Image, ImageDraw
from display import collect, event_time, fit, font, wrap, weather_icon, clock

PAGES = [('home', 'Family'), ('calendar', 'Calendar'), ('chores', 'Chores'),
         ('lists', 'Lists'), ('meals', 'Meals'), ('recipes', 'Recipes')]


def collect_dashboard(ha, config):
    with ThreadPoolExecutor(max_workers=3) as pool:
        base_job = pool.submit(collect, ha.api, config)
        todo_job = pool.submit(ha.api, '/api/services/todo/get_items?return_response',
            {'entity_id': [x['entity'] for x in config['chores'] + config['lists']]})
        recipe_job = pool.submit(ha.ws, {'type': 'hearthglance_recipes/list', 'entity_id': config['recipes']})
        snapshot = base_job.result()
        try:
            result = todo_job.result()['service_response']
            snapshot['todos'] = {entity: data['items'] for entity, data in result.items()}
        except Exception:
            snapshot['errors'].append('Chores and lists unavailable')
            snapshot['todos'] = {}
        try:
            # Do not store signed photo URLs or expose them to the device.
            snapshot['recipes'] = [{k: v for k, v in r.items() if k != 'images'}
                                   for r in recipe_job.result()['recipes']]
        except Exception:
            snapshot['errors'].append('Recipes unavailable')
            snapshot['recipes'] = []
    now = datetime.fromisoformat(snapshot['updated'])
    try:
        query = urllib.parse.urlencode({'start': now.replace(hour=0, minute=0, second=0).isoformat(),
                                        'end': (now + timedelta(days=7)).isoformat()})
        snapshot['meals'] = ha.api('/api/calendars/' + config['meals'] + '?' + query)
    except Exception:
        snapshot['errors'].append('Meals unavailable')
        snapshot['meals'] = []
    return snapshot


def complete_item(ha, config, entity, uid, today=None):
    sources = config['chores'] + config['lists']
    if entity not in {s['entity'] for s in sources} or not isinstance(uid, str) or len(uid) > 200:
        raise ValueError('Item is outside configured lists')
    # Read the current item rather than trusting a stale page's checkbox state.
    data = ha.api('/api/services/todo/get_items?return_response', {'entity_id': entity})
    item = next((i for i in data['service_response'][entity]['items'] if i['uid'] == uid), None)
    if item is None: raise ValueError('Item no longer exists')
    if item['status'] == 'completed': return  # idempotent on retry/double tap
    payload = {'entity_id': entity, 'item': uid, 'status': 'completed'}
    if entity in {s['entity'] for s in config['chores']}:
        try:
            metadata = json.loads(item.get('description') or '{}')
            if not isinstance(metadata, dict): metadata = {'notes': item.get('description', '')}
        except ValueError:
            metadata = {'notes': item.get('description', '')}
        hg = metadata.get('hearthglance')
        if not isinstance(hg, dict): hg = {}
        metadata['hearthglance'] = {**hg, 'completed_on': today or datetime.now(ZoneInfo(config['timezone'])).date().isoformat()}
        payload['description'] = json.dumps(metadata)
    ha.api('/api/services/todo/update_item', payload)


class PlainText(HTMLParser):
    def __init__(self): super().__init__(); self.parts = []
    def handle_data(self, data): self.parts.append(data)
    def handle_starttag(self, tag, attrs):
        if tag in ('br', 'p', 'li', 'div'): self.parts.append('\n')
    def handle_endtag(self, tag):
        if tag in ('p', 'li', 'div'): self.parts.append('\n')


def plain(value):
    parser = PlainText(); parser.feed(str(value or ''))
    return unescape(''.join(parser.parts))


def draw_view(snapshot, config, page='home', offset=0, group=0, recipe='', section='ingredients'):
    if page not in dict(PAGES): raise ValueError('Unknown page')
    offset = min(100000, max(0, int(offset)))
    group = max(0, int(group))
    tz = ZoneInfo(config['timezone'])
    updated = event_time(snapshot['updated'], tz)
    im = Image.new('L', (1072, 1448), 255); d = ImageDraw.Draw(im)
    hits = []
    scroll = None
    def text(x, y, value, size=28, kind='sans', width=940):
        d.text((x, y), fit(d, value, size, width, kind), font=font(size, kind), fill=0, anchor='lt')
    def line(y): d.line((64,y,1008,y), fill=0, width=2)
    def action(rect, value): hits.append({'rect': rect, 'action': value})
    def nav(**changes):
        return {'type':'view', 'page':page, 'offset':offset, 'group':group,
                'recipe':recipe, 'section':section, **changes}
    def button(x, y, w, label, value, selected=False):
        d.rounded_rectangle((x,y,x+w,y+70), radius=8, outline=0, width=2, fill=0 if selected else 255)
        f=font(22,'bold')
        d.text((x+w/2,y+35), fit(d,label,22,w-14,'bold'), font=f, fill=255 if selected else 0, anchor='mm')
        action([x,y,w,70], value)
    text(64, 48, config['household'].upper(), 22, 'bold', 500)
    # Battery and the home clock/date are drawn locally by the Kobo, offline.
    for i, (key, label) in enumerate(PAGES):
        button(64+i*158, 105, 150, label, {'type':'view','page':key,'offset':0,'group':0}, page==key)
    if page!='home': text(64, 213, dict(PAGES)[page], 55, 'serif')
    line(548 if page=='home' else 291)
    entries, total, per_page, start_y = [], 0, 7, 335

    if page == 'home':
        shift=260
        weather = snapshot.get('weather') or {}
        if weather:
            weather_icon(d,(64,326+shift),weather['condition'],1)
            temperature = weather.get('temperature')
            temp = f"{round(temperature)}{weather.get('temperature_unit','°F')}" if isinstance(temperature,(int,float)) else '—'
            text(167,320+shift,temp,55,'serif',300)
            text(167,390+shift,weather['condition'].replace('partlycloudy','Partly cloudy').replace('-',' ').capitalize(),22,width=300)
        for i, forecast in enumerate(snapshot.get('forecast',[])[:3]):
            x=510+i*168; day=event_time(forecast['datetime'],tz)
            text(x,325+shift,'TODAY' if day.date()==updated.date() else day.strftime('%a').upper(),21,'bold',150)
            weather_icon(d,(x+25,352+shift),forecast['condition'],.65)
            text(x,416+shift,f"{round(forecast['temperature'])}° / {round(forecast.get('templow',forecast['temperature']))}°",24,width=160)
        line(735); text(64,765,'Next up',35,'serif')
        agenda=[]
        for entry in snapshot.get('events',[]):
            begins=event_time(entry['start'],tz)
            day=max(begins.date(),updated.date()).strftime('%a, %b %-d')
            when='All day' if entry['all_day'] else clock(begins)
            agenda.append(day+' · '+when+'\n'+entry['title']+'\n'+entry.get('person',''))
        content='\n\n'.join(agenda)
        if not content:
            content='Agenda unavailable.' if any('calendar' in e for e in snapshot.get('errors',[])) else 'Nothing scheduled.'
        scroll={'key':'agenda','rect':[64,835,944,420],'text':content,'font_pixels':30}
        offset=0
    elif page == 'calendar': entries = snapshot.get('events',[])
    elif page == 'meals':
        entries = [{'title': m.get('summary','Meal'), 'start': event_time(m['start'],tz).isoformat(),
                    'end': event_time(m['end'],tz).isoformat(), 'all_day':True, 'person':'Meal plan'}
                   for m in snapshot.get('meals',[])]
        entries.sort(key=lambda x:x['start'])
    elif page in ('chores','lists'):
        sources=config[page]; group=min(group,len(sources))
        choices=[{'name':'All'}]+sources; width=944//len(choices)
        for i, source in enumerate(choices):
            button(64+i*width,315,width-8,source['name'],nav(group=i,offset=0),i==group)
        selected=sources if group==0 else sources[group-1:group]
        for source in selected:
            for item in snapshot.get('todos',{}).get(source['entity'],[]):
                if item['status']=='needs_action':
                    entries.append({**item,'source':source['name'],'entity':source['entity']})
        if page=='chores': entries.sort(key=lambda x:(x.get('due') or '0000',x['source'],x['summary']))
        start_y=425; per_page=7
    elif page=='recipes':
        if recipe:
            selected=next((r for r in snapshot.get('recipes',[]) if r['id']==recipe),None)
            if selected:
                text(64,310,selected['title'],34,'bold')
                sections=[('ingredients','Ingredients'),('instructions','Directions'),('notes','Notes')]
                if section not in dict(sections): section='ingredients'
                for i,(key,label) in enumerate(sections): button(64+i*317,372,305,label,nav(section=key,offset=0),section==key)
                content=plain(selected.get(section)) or 'No '+dict(sections)[section].lower()+' recorded.'
                scroll={'key':'recipe:'+recipe+':'+section,'rect':[64,475,944,680],
                        'text':content,'font_pixels':30}
                offset=0
            else: text(64,340,'Recipe unavailable',32)
        else:
            entries=snapshot.get('recipes',[]);per_page=7

    if not scroll and (entries or not (page=='recipes' and recipe)):
        total=len(entries)
        offset=min(offset,max(0,((total-1)//per_page)*per_page))
        for i, entry in enumerate(entries[offset:offset+per_page]):
            y=start_y+i*(112 if page in ('home','calendar','meals') else 100)
            if page in ('home','calendar','meals'):
                begins=event_time(entry['start'],tz)
                date_label=max(begins.date(),updated.date()).strftime('%a, %b %-d')
                text(64,y,date_label,23,'bold',205)
                text(64,y+37,'All day' if entry['all_day'] else clock(begins),24,width=205)
                title_lines=wrap(d,entry['title'],32,710)
                for j,title_line in enumerate(title_lines): text(286,y+j*38,title_line,32,'bold',710)
                text(286,y+len(title_lines)*38+3,entry.get('person',''),22,width=710)
            elif page in ('chores','lists'):
                d.rounded_rectangle((68,y+9,123,y+64),radius=6,outline=0,width=3)
                action([64,y,80,84],{'type':'complete','entity':entry['entity'],'uid':entry['uid']})
                text(160,y,entry['summary'],31,'bold',830)
                due=(' · Due '+entry['due'][:10]) if entry.get('due') else ''
                text(160,y+45,entry['source']+due,23,width=830)
            else:
                text(64,y,entry['title'],31,'bold')
                subtitle=', '.join(entry.get('categories') or []) or 'Tap to read recipe'
                text(64,y+45,subtitle,23)
                action([64,y-4,944,92],nav(recipe=entry['id'],section='ingredients',offset=0))
        if not entries:
            errors=snapshot.get('errors',[])
            failed=any(('calendar' in e if page in ('home','calendar') else page.capitalize() in e or page in e.lower()) for e in errors)
            text(64,start_y,'Data unavailable' if failed else 'All clear.' if page in ('chores','lists') else 'Nothing scheduled.' if page in ('home','calendar','meals') else 'No recipes yet.',36,'serif')

    line(1280)
    pages=max(1,(total+per_page-1)//per_page)
    if offset>0: button(64,1185,245,'‹ Previous',nav(offset=max(0,offset-per_page)))
    if offset+per_page<total: button(763,1185,245,'Next ›',nav(offset=offset+per_page))
    if recipe: button(335,1185,402,'‹ All recipes',nav(recipe='',offset=0))
    button(64,1300,430,'Return to reading',{'type':'read'})
    button(510,1300,235,'Refresh',{'type':'refresh'})
    button(763,1300,245,'Settings',{'type':'settings'})
    text(64,1400,'Updated '+clock(updated),20,width=400)
    stale=datetime.now(tz)-updated>timedelta(minutes=90)
    status='CACHED DATA' if stale else 'PARTIAL DATA' if snapshot.get('errors') else 'HEARTHGLANCE' if scroll else f'{offset//per_page+1} / {pages}'
    d.text((1008,1400),status,font=font(20,'bold'),fill=0,anchor='rt')
    output=BytesIO();im.point(lambda p:round(p/17)*17).save(output,format='PNG',optimize=True)
    return {'png':base64.b64encode(output.getvalue()).decode(),'hits':hits,
            'view':{'type':'view','page':page,'offset':offset,'group':group,'recipe':recipe,'section':section},
            'updated':snapshot['updated'],'updated_epoch':int(updated.timestamp()),
            **({'scroll':scroll} if scroll else {})}


def offline_pack(snapshot, config):
    """One consistent snapshot, including every navigable list page.

    Recipe details share three backgrounds; titles and full section text are
    painted locally instead of downloading hundreds of almost identical PNGs.
    """
    def key(view):
        return f"{view.get('page','home')}:{view.get('group',0)}:{view.get('offset',0)}"
    views, pending, seen = {}, [{'page': page} for page, _ in PAGES], set()
    while pending:
        view = pending.pop()
        identity = key(view)
        if identity in seen: continue
        seen.add(identity)
        bundle = draw_view(snapshot, config, **view)
        views[key(bundle['view'])] = bundle
        for hit in bundle['hits']:
            action = hit['action']
            if action['type'] == 'view' and not action.get('recipe'):
                pending.append({k: v for k, v in action.items() if k != 'type'})
    template = {**snapshot, 'recipes': [{'id': '__offline_recipe__', 'title': ''}]}
    for section in ('ingredients', 'instructions', 'notes'):
        views['recipe:' + section] = draw_view(template, config, page='recipes',
            recipe='__offline_recipe__', section=section)
    recipes = {r['id']: {'title': r['title'], **{
        section: plain(r.get(section)) or 'No ' + label + ' recorded.'
        for section, label in (('ingredients', 'ingredients'), ('instructions', 'directions'), ('notes', 'notes'))}}
        for r in snapshot.get('recipes', [])}
    return {'version': 1, 'updated': snapshot['updated'], 'views': views, 'recipes': recipes}
