"""A native-resolution, image-only Family display for the Kobo Clara BW."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, time, timedelta
from io import BytesIO
import json
import math
from pathlib import Path
import urllib.parse
import urllib.request
from contextlib import closing
from zoneinfo import ZoneInfo

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
WIDTH, HEIGHT = 1072, 1448


class HomeAssistant:
    def __init__(self, url, token):
        self.url, self.token = url.rstrip('/'), token.strip()

    def api(self, path, data=None):
        req = urllib.request.Request(self.url + path,
            data=None if data is None else json.dumps(data).encode(),
            headers={'Authorization': 'Bearer ' + self.token,
                     'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=10) as response:
            return json.load(response)

    def ws(self, payload):
        import websocket
        url = self.url.replace('http://', 'ws://').replace('https://', 'wss://')
        with closing(websocket.create_connection(url + '/api/websocket', timeout=10)) as connection:
            connection.recv()
            connection.send(json.dumps({'type': 'auth', 'access_token': self.token}))
            if json.loads(connection.recv()).get('type') != 'auth_ok':
                raise RuntimeError('Recipe authentication failed')
            connection.send(json.dumps({'id': 1, **payload}))
            while True:
                result = json.loads(connection.recv())
                if result.get('id') == 1:
                    if not result.get('success'): raise RuntimeError('Recipe request failed')
                    return result['result']


def event_time(value, tz):
    if isinstance(value, dict):
        value = value.get('dateTime') or value.get('date')
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    return parsed.replace(tzinfo=tz) if parsed.tzinfo is None else parsed.astimezone(tz)


def collect(api, config, now=None):
    tz = ZoneInfo(config['timezone'])
    now = now or datetime.now(tz)
    start = datetime.combine(now.date(), time.min, tz)
    end = start + timedelta(days=config.get('days', 7))
    query = urllib.parse.urlencode({'start': start.isoformat(), 'end': end.isoformat()})
    errors, events = [], []

    def calendar(source):
        return source, api('/api/calendars/' + source['entity'] + '?' + query)

    with ThreadPoolExecutor(max_workers=6) as pool:
        jobs = [(source, pool.submit(calendar, source)) for source in config['calendars']]
        for source, job in jobs:
            try:
                _, items = job.result()
                for item in items:
                    begins, ends = event_time(item['start'], tz), event_time(item['end'], tz)
                    if ends <= now:
                        continue
                    raw = item['start']
                    raw = raw.get('dateTime') or raw.get('date') if isinstance(raw, dict) else raw
                    events.append({'title': item.get('summary') or 'Untitled event',
                        'start': begins.isoformat(), 'end': ends.isoformat(),
                        'all_day': len(raw) == 10, 'person': source['name']})
            except Exception:
                errors.append(source['name'] + ' calendar unavailable')
    # Merge copies of a shared appointment while retaining each person's label.
    merged = {}
    for event in events:
        key = (event['title'].strip().casefold(), event['start'], event['end'])
        if key in merged:
            names = merged[key]['person'].split(' + ')
            if event['person'] not in names:
                merged[key]['person'] += ' + ' + event['person']
        else:
            merged[key] = event
    events = sorted(merged.values(), key=lambda e: (
        max(date.fromisoformat(e['start'][:10]), now.date()), not e['all_day'], e['start'], e['title']))
    weather, forecast = None, []
    try:
        state = api('/api/states/' + config['weather'])
        if state['state'] in ('unavailable', 'unknown'):
            raise ValueError('Weather unavailable')
        weather = {'condition': state['state'], **state['attributes']}
        response = api('/api/services/weather/get_forecasts?return_response',
                       {'entity_id': config['weather'], 'type': 'daily'})
        forecast = response['service_response'][config['weather']]['forecast']
    except Exception:
        errors.append('Weather forecast unavailable')
    return {'updated': now.isoformat(), 'timezone': config['timezone'],
            'household': config['household'], 'events': events,
            'weather': weather, 'forecast': forecast, 'errors': errors}


def font(size, kind='sans'):
    names = {'sans': 'NotoSans-Regular.ttf', 'bold': 'NotoSans-Bold.ttf',
             'serif': 'NotoSerif-Regular.ttf'}
    return ImageFont.truetype(str(ROOT / 'fonts' / names[kind]), size)


def fit(draw, text, size, width, kind='sans'):
    f = font(size, kind)
    text = ' '.join(str(text).split())
    if draw.textlength(text, font=f) <= width:
        return text
    while text and draw.textlength(text + '…', font=f) > width:
        text = text[:-1]
    return text.rstrip() + '…'


def wrap(draw, text, size, width, lines=2):
    words, result, line = str(text).split(), [], ''
    f = font(size, 'bold')
    for index, word in enumerate(words):
        candidate = (line + ' ' + word).strip()
        if draw.textlength(candidate, font=f) > width and line:
            result.append(fit(draw, line, size, width, 'bold'))
            line = word
            if len(result) == lines - 1:
                line = ' '.join(words[index:])
                break
        else:
            line = candidate
    if line:
        result.append(fit(draw, line, size, width, 'bold'))
    return result[:lines]


def weather_icon(draw, xy, condition, scale=1):
    x, y = xy
    def pts(box):
        return tuple(round((x if i % 2 == 0 else y) + p * scale) for i, p in enumerate(box))
    stroke = max(2, round(3 * scale))
    sunny = condition in ('sunny', 'clear-night', 'partlycloudy')
    if sunny:
        draw.ellipse(pts((20, 17, 54, 51)), outline=0, width=stroke)
        for angle in range(0, 360, 45):
            a = math.radians(angle)
            draw.line(pts((37 + 24*math.cos(a), 34 + 24*math.sin(a),
                           37 + 31*math.cos(a), 34 + 31*math.sin(a))), fill=0, width=stroke)
    if condition not in ('sunny', 'clear-night'):
        draw.rounded_rectangle(pts((15, 39, 76, 64)), radius=12*scale, fill=255, outline=0, width=stroke)
        draw.ellipse(pts((29, 26, 60, 57)), fill=255, outline=0, width=stroke)
        draw.rectangle(pts((31, 44, 59, 61)), fill=255)
    if condition in ('rainy', 'pouring', 'lightning-rainy', 'snowy-rainy'):
        for offset in (23, 44, 65):
            draw.line(pts((offset, 72, offset-5, 82)), fill=0, width=stroke)
    if condition in ('snowy', 'snowy-rainy'):
        for offset in (25, 50, 70):
            draw.ellipse(pts((offset, 73, offset+3, 76)), fill=0)


def clock(dt):
    return dt.strftime('%I:%M').lstrip('0') + dt.strftime(' %p').lower()


def render(snapshot, now=None):
    tz = ZoneInfo(snapshot['timezone'])
    updated = datetime.fromisoformat(snapshot['updated']).astimezone(tz)
    now = now or datetime.now(tz)
    image = Image.new('L', (WIDTH, HEIGHT), 255)
    d = ImageDraw.Draw(image)
    def text(x, y, value, size=28, kind='sans', shade=0):
        d.text((x, y), str(value), font=font(size, kind), fill=shade, anchor='lt')
    def rule(y, weight=2):
        d.line((64, y, 1008, y), fill=0, width=weight)

    text(64, 54, snapshot['household'].upper(), 23, 'bold')
    label = updated.strftime('%B %-d, %Y').upper()
    d.text((1008, 54), label, font=font(23), fill=0, anchor='rt')
    rule(100, 3)
    text(60, 125, updated.strftime('%A'), 88, 'serif')
    text(65, 237, 'THE DAY AHEAD', 22, 'bold')
    rule(285)

    weather = snapshot.get('weather') or {}
    forecast = snapshot.get('forecast') or []
    if weather:
        weather_icon(d, (63, 320), weather['condition'], 1.25)
        temp = weather.get('temperature')
        unit = weather.get('temperature_unit', '°F')
        text(180, 310, f'{round(temp)}{unit}' if isinstance(temp, (int, float)) else '—', 62, 'serif')
        condition = weather['condition'].replace('partlycloudy', 'Partly cloudy').replace('-', ' ').capitalize()
        text(182, 388, fit(d, condition, 23, 280), 23)
    else:
        text(70, 340, 'Weather unavailable', 27)
    daily = [f for f in forecast if event_time(f['datetime'], tz).date() >= updated.date()][:3]
    for i, day in enumerate(daily):
        x = 510 + 170*i
        when = event_time(day['datetime'], tz)
        text(x, 310, 'TODAY' if when.date() == updated.date() else when.strftime('%a').upper(), 21, 'bold')
        weather_icon(d, (x+27, 337), day['condition'], .7)
        high = round(day['temperature']) if isinstance(day.get('temperature'), (int, float)) else '—'
        low = round(day['templow']) if isinstance(day.get('templow'), (int, float)) else '—'
        text(x, 405, f'{high}° / {low}°', 25)
    rule(467, 3)
    text(64, 496, 'Family agenda', 40, 'serif')
    events = snapshot.get('events', [])
    y, last_day, displayed = 567, None, 0
    for event in events:
        begins = event_time(event['start'], tz)
        group = max(begins.date(), updated.date())
        title_lines = wrap(d, event['title'], 34, 700)
        heading = group != last_day
        needed = len(title_lines)*44 + 45 + (51 if heading else 0)
        if y + needed > 1310:
            break
        if heading:
            label = 'TODAY' if group == updated.date() else 'TOMORROW' if group == updated.date()+timedelta(days=1) else group.strftime('%A').upper()
            text(64, y, label + group.strftime('  /  %b %-d').upper(), 22, 'bold')
            y += 47
            last_day = group
        label = 'All day' if event['all_day'] else 'Ongoing' if begins < updated else clock(begins)
        text(64, y+2, label, 25)
        for line in title_lines:
            text(270, y, line, 34, 'bold')
            y += 44
        text(270, y, fit(d, event['person'], 23, 700), 23, shade=65)
        y += 45
        displayed += 1
    if not events:
        if any('calendar' in e for e in snapshot.get('errors', [])):
            text(64, 594, 'Agenda unavailable', 35, 'serif')
            text(64, 650, 'Check Home Assistant connectivity.', 27)
        else:
            text(64, 594, 'A little breathing room.', 40, 'serif')
            text(64, 658, 'No upcoming events in the next seven days.', 27)
    if len(events) > displayed:
        text(64, 1295, f'+ {len(events)-displayed} more in the family calendar', 23)
    rule(1350)
    text(64, 1381, 'Updated ' + updated.strftime('%b %-d') + ' at ' + clock(updated), 21)
    status = 'PARTIAL DATA' if snapshot.get('errors') else 'FAMILY · HEARTHGLANCE'
    if now - updated > timedelta(minutes=90):
        status = 'CACHED · CHECK UPDATED TIME'
    d.text((1008, 1381), status, font=font(19, 'bold'), fill=0, anchor='rt')
    # E-ink-native 16 shades, without photographic dithering or browser assets.
    image = image.point(lambda p: round(p / 17) * 17)
    output = BytesIO()
    image.save(output, format='PNG', optimize=True)
    return output.getvalue()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('snapshot', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    args.output.write_bytes(render(json.loads(args.snapshot.read_text())))
