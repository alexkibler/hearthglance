import copy
from datetime import datetime
from io import BytesIO
import unittest
from zoneinfo import ZoneInfo
from PIL import Image, ImageDraw
from display import collect, render, event_time, font, wrap


class DisplayTest(unittest.TestCase):
    def setUp(self):
        self.tz = ZoneInfo('America/New_York')
        self.now = datetime(2026, 10, 29, 8, 30, tzinfo=self.tz)
        self.config = {'timezone': 'America/New_York', 'household': 'Test family',
            'weather': 'weather.home', 'calendars': [
                {'entity': 'calendar.one', 'name': 'Alex'},
                {'entity': 'calendar.two', 'name': 'Family'}]}

    def api(self, path, data=None):
        if path.startswith('/api/calendars/'):
            return [
                {'summary': 'All-day appointment', 'start': {'date': '2026-10-28'}, 'end': {'date': '2026-10-30'}},
                {'summary': 'Appointment', 'start': {'dateTime': '2026-10-29T16:30:00-04:00'}, 'end': {'dateTime': '2026-10-29T17:30:00-04:00'}},
                {'summary': 'Ended', 'start': {'dateTime': '2026-10-29T07:00:00-04:00'}, 'end': {'dateTime': '2026-10-29T08:00:00-04:00'}},
            ]
        if path.startswith('/api/states/'):
            return {'state': 'sunny', 'attributes': {'temperature': 52, 'temperature_unit': '°F'}}
        return {'service_response': {'weather.home': {'forecast': []}}}

    def test_ongoing_all_day_and_shared_event(self):
        snapshot = collect(self.api, self.config, self.now)
        self.assertEqual(len(snapshot['events']), 2)
        self.assertTrue(snapshot['events'][0]['all_day'])
        self.assertEqual(snapshot['events'][1]['person'], 'Alex + Family')
        self.assertEqual(snapshot['errors'], [])

    def test_dst_and_exclusive_all_day_end(self):
        self.assertEqual(event_time('2026-11-01T17:00:00Z', self.tz).hour, 12)
        self.assertEqual(event_time('2026-10-31T16:00:00Z', self.tz).hour, 12)
        config = copy.deepcopy(self.config)
        snapshot = collect(self.api, config, datetime(2026, 10, 30, 0, 0, tzinfo=self.tz))
        self.assertEqual(snapshot['events'], [])

    def test_outage_is_visible(self):
        def failed(*args): raise TimeoutError()
        snapshot = collect(failed, self.config, self.now)
        self.assertEqual(len(snapshot['errors']), 3)
        png = Image.open(BytesIO(render(snapshot, self.now)))
        self.assertEqual(png.size, (1072, 1448))
        self.assertLessEqual(len(png.getcolors()), 16)

    def test_dense_and_long_text_remains_native_size(self):
        snapshot = collect(self.api, self.config, self.now)
        event = snapshot['events'][1]
        event['title'] = 'Very long appointment title ' * 15
        snapshot['events'] = [copy.deepcopy(event) for _ in range(25)]
        png = render(snapshot, self.now)
        self.assertLess(len(png), 512 * 1024)
        self.assertEqual(Image.open(BytesIO(png)).mode, 'L')
        draw = ImageDraw.Draw(Image.new('L', (1072, 1448)))
        lines = wrap(draw, 'A'*300 + ' example ' + 'B'*300, 34, 700)
        self.assertLessEqual(len(lines), 2)
        self.assertTrue(all(draw.textlength(line, font=font(34, 'bold')) <= 700 for line in lines))


if __name__ == '__main__': unittest.main()
