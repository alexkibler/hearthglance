"""Live photo event stream (api/photos/events) used by the dashboard slideshow. Synthetic data only."""
import http.client
import io
import json
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

sys.path[:0] = [str(Path(__file__).resolve().parents[1]), str(Path(__file__).resolve().parent)]
import app
from photos import MARKER, Photos
from test_photos import image_bytes

CONFIG = {'household': 'Test', 'people': [], 'calendars': [], 'lists': []}


class PhotoEventTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        base = Path(self.temp.name)
        (base/'media').mkdir(); (base/'media'/MARKER).write_text('x')
        self.store = Photos(base/'media', base/'photos.sqlite3', isolate=False)
        self.app = app.Application(CONFIG, 'http://ha.test', 'https://ha.test', 'https://app.test/hearthglance/',
            base/'sessions.json', base, photos=self.store)
        self.app.event_heartbeat = 0.05
        self.sid = self.app.sessions.create({'access_token': 't', 'refresh_token': 'r', 'expires_in': 3600})
        self.server = app.serve(self.app, '127.0.0.1', 0)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.open = []

    def tearDown(self):
        for conn in self.open: conn.close()
        self.server.shutdown(); self.server.server_close(); self.temp.cleanup()

    def connect(self):
        conn = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=5)
        self.open.append(conn); return conn

    def get(self, path, auth=True):
        conn = self.connect()
        conn.request('GET', '/hearthglance/' + path, headers={'Cookie': 'hg_session=' + self.sid} if auth else {})
        response = conn.getresponse(); body = response.read()
        return response.status, dict(response.getheaders()), body.decode(errors='replace')

    def stream(self):
        conn = self.connect()
        conn.request('GET', '/hearthglance/api/photos/events', headers={'Cookie': 'hg_session=' + self.sid})
        response = conn.getresponse(); response.conn = conn
        return response

    def slot_returns(self, within=3):
        deadline = time.monotonic() + within
        while time.monotonic() < deadline:                      # the server notices a closed socket on its next write
            if self.app.event_streams.acquire(blocking=False):
                self.app.event_streams.release(); return True
            time.sleep(0.05)
        return False

    @staticmethod
    def event(response):
        """Read one SSE block, skipping keep-alive comments."""
        while True:
            lines = []
            while True:
                line = response.fp.readline().decode()
                if line in ('\n', ''): break
                lines.append(line.rstrip('\n'))
            if not lines and line == '': return None
            if lines and all(l.startswith(':') for l in lines): continue
            fields = dict(l.split(': ', 1) for l in lines if not l.startswith(':'))
            return fields

    def test_stream_announces_current_version_then_changes_with_keep_alives(self):
        response = self.stream()
        self.assertEqual(response.status, 200)
        self.assertEqual(response.getheader('Content-Type'), 'text/event-stream')
        self.assertEqual(response.getheader('Cache-Control'), 'no-store')
        self.assertEqual(response.getheader('X-Accel-Buffering'), 'no')
        first = self.event(response)
        self.assertEqual((first['event'], json.loads(first['data'])), ('photos', {'version': 0}))
        self.assertEqual(first['retry'], '5000')
        time.sleep(0.15)                                        # keep-alive comments flow while idle
        photo, _ = self.store.upload(io.BytesIO(image_bytes()), len(image_bytes()), 'events-test-key-0002')
        self.assertEqual(json.loads(self.event(response)['data']), {'version': 1})
        self.store.remove(photo['id'])
        self.assertEqual(json.loads(self.event(response)['data']), {'version': 2})

    def test_reconnect_receives_the_version_it_missed(self):
        first = self.stream(); self.event(first); first.close()
        self.store.upload(io.BytesIO(image_bytes()), len(image_bytes()), 'events-test-key-0003')
        again = self.stream()
        self.assertEqual(json.loads(self.event(again)['data']), {'version': 1})

    def test_stream_requires_a_session_and_ends_when_it_is_revoked(self):
        self.assertEqual(self.get('api/photos/events', auth=False)[0], 401)
        response = self.stream(); self.event(response)
        self.app.sessions.remove(self.app.sessions.key(self.sid))
        self.assertIsNone(self.event(response))                 # server closes the stream

    def test_streams_are_bounded_and_released(self):
        self.app.event_streams = threading.BoundedSemaphore(1)
        held = self.stream(); self.event(held)
        status, _, body = self.get('api/photos/events')
        self.assertEqual(status, 503); self.assertIn('Too many', body)
        held.close(); held.conn.close()
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:                      # released once the server notices the closed socket
            response = self.stream()
            if response.status == 200: break
            response.read(); time.sleep(0.1)
        self.assertEqual(response.status, 200)

    def test_a_failure_during_stream_setup_releases_its_slot(self):
        """Codex #8 review: sign-out or any error after the slot is taken must not leak capacity."""
        self.app.event_streams = threading.BoundedSemaphore(1)
        real_key, calls = self.app.sessions.key, []
        def signed_out_after_first_check(sid):
            calls.append(sid)
            if len(calls) > 1: raise app.LoginRequired()
            return real_key(sid)
        with patch.object(self.app.sessions, 'key', side_effect=signed_out_after_first_check):
            response = self.stream()
            if response.status == 200: self.event(response)
            response.close(); response.conn.close()
        self.assertTrue(self.slot_returns())                                  # sign-out race leaked nothing
        with patch.object(app.Handler, 'send_response', side_effect=OSError('client went away')):
            conn = self.connect()
            conn.request('GET', '/hearthglance/api/photos/events', headers={'Cookie': 'hg_session=' + self.sid})
            try: conn.getresponse().read()
            except (http.client.HTTPException, OSError): pass
        self.assertTrue(self.slot_returns())                                  # the slot came back
        self.app.sessions.remove(self.app.sessions.key(self.sid))
        self.assertEqual(self.get('api/photos/events')[0], 401)                     # signed out: refused before a slot is taken
        self.assertTrue(self.slot_returns(0.2))

    def test_streams_are_recycled_after_their_lifetime(self):
        self.app.event_lifetime = 0.2
        response = self.stream(); self.event(response)
        started = time.monotonic()
        self.assertIsNone(self.event(response))
        self.assertLess(time.monotonic() - started, 3)

    def test_stream_without_photo_storage_is_unavailable(self):
        self.app.photos = None
        self.assertEqual(self.get('api/photos/events')[0], 503)


if __name__ == '__main__':
    unittest.main()
