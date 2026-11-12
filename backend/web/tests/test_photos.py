"""Photo storage and API tests. All images are synthetic and generated in the test."""
import errno
import http.client
import io
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
import photos
from photos import MARKER, PhotoError, Photos

CONFIG = {'household': 'Test', 'people': [], 'calendars': [], 'lists': []}


def image_bytes(kind='JPEG', size=(800, 600), color='red', exif=None, mode='RGB'):
    buffer = io.BytesIO()
    image = Image.new(mode, size, color)
    options = {'exif': exif.tobytes()} if exif is not None else {}
    image.save(buffer, format=kind, **options)
    return buffer.getvalue()


def oriented_jpeg():
    exif = Image.Exif()
    exif[0x0112] = 6                              # rotate 90° clockwise on display
    exif[0x8825] = {2: (40.0, 26.0, 46.0)}        # GPS IFD with a latitude
    exif[0x010f] = 'Synthetic camera'
    return image_bytes('JPEG', (800, 600), exif=exif)


def key(n=0):
    return f'test-upload-key-{n:04d}'


class Store(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        base = Path(self.temp.name)
        self.media, self.data = base/'media', base/'data'
        self.media.mkdir(); self.data.mkdir()
        (self.media/MARKER).write_text('hearthglance-media v1\n')
        self.store = Photos(self.media, self.data/'photos.sqlite3', isolate=False)

    def tearDown(self):
        self.temp.cleanup()

    def put(self, body, n=0, store=None):
        return (store or self.store).upload(io.BytesIO(body), len(body), key(n))

    def published(self):
        return sorted(p.name for p in (self.media/'photos').iterdir())

    def staging(self):
        return sorted(p.name for p in (self.media/'staging').iterdir())


class DerivativeTests(Store):
    def test_jpeg_is_rotated_and_stripped_of_location_and_camera_metadata(self):
        photo, created = self.put(oriented_jpeg())
        self.assertTrue(created)
        self.assertEqual((photo['width'], photo['height']), (600, 800))
        for variant in ('display', 'thumb'):
            with Image.open(io.BytesIO(self.store.file(photo['id'], variant))) as result:
                self.assertEqual(result.format, 'JPEG')
                self.assertLess(result.width, result.height)
                self.assertEqual(dict(result.getexif()), {})
                self.assertNotIn('exif', result.info)
        data = self.store.file(photo['id'], 'display')
        self.assertNotIn(b'Synthetic camera', data)
        self.assertLessEqual(max(photo['thumb_width'], photo['thumb_height']), photos.THUMB_EDGE)

    def test_heic_and_transparent_png_are_accepted(self):
        heic = image_bytes('HEIF', (640, 480), 'blue')
        png = image_bytes('PNG', (300, 200), (0, 0, 0, 0), mode='RGBA')
        for n, body in enumerate((heic, png)):
            photo, _ = self.put(body, n)
            with Image.open(io.BytesIO(self.store.file(photo['id'], 'display'))) as result:
                self.assertEqual((result.format, result.mode), ('JPEG', 'RGB'))
        self.assertEqual(sorted(p['id'] for p in self.store.list()['photos']), self.published())

    def test_large_photo_is_reduced_to_display_size(self):
        photo, _ = self.put(image_bytes('JPEG', (6000, 4000)))
        self.assertEqual(max(photo['width'], photo['height']), photos.DISPLAY_EDGE)


class ValidationTests(Store):
    def assertRejected(self, status, body, length=None):
        with self.assertRaises(PhotoError) as raised:
            self.store.upload(io.BytesIO(body), len(body) if length is None else length, key())
        self.assertEqual(raised.exception.status, status)
        self.assertEqual(self.published(), []); self.assertEqual(self.staging(), [])
        self.assertEqual(self.store.list()['photos'], [])

    def test_actual_format_is_checked_not_the_declared_type(self):
        self.assertRejected(415, image_bytes('GIF', (10, 10)))
        self.assertRejected(415, b'<svg xmlns="http://www.w3.org/2000/svg"/>')
        self.assertRejected(422, b'\xff\xd8\xff\xe0' + b'not really a jpeg' * 20)
        self.assertRejected(422, image_bytes('JPEG')[:200])

    def test_size_and_pixel_limits_apply_before_decoding(self):
        self.assertRejected(413, b'x', length=photos.MAX_BYTES + 1)
        self.assertRejected(413, b'', length=0)
        self.assertRejected(413, image_bytes('PNG', (8000, 8000), 0, mode='1'))   # 64 MP, a few KB on disk

    def test_interrupted_body_leaves_nothing_behind(self):
        body = image_bytes()
        self.assertRejected(400, body[:100], length=len(body))

    def test_idempotency_key_is_required(self):
        body = image_bytes()
        for bad in ('', 'short', 'x' * 65, 'has spaces in it!!'):
            with self.assertRaises(PhotoError) as raised:
                self.store.upload(io.BytesIO(body), len(body), bad)
            self.assertEqual(raised.exception.status, 400)


class IdempotencyTests(Store):
    def test_repeated_request_returns_the_same_photo(self):
        first, created = self.put(image_bytes())
        second, again = self.put(image_bytes(color='green'))
        self.assertTrue(created); self.assertFalse(again)
        self.assertEqual(first['id'], second['id'])
        self.assertEqual(len(self.store.list()['photos']), 1); self.assertEqual(len(self.published()), 1)

    def test_concurrent_duplicate_is_refused_while_the_first_is_in_flight(self):
        started, release = threading.Event(), threading.Event()
        original = self.store.derive
        def slow(*args):
            started.set(); release.wait(5); return original(*args)
        results = []
        with patch.object(self.store, 'derive', side_effect=slow):
            worker = threading.Thread(target=lambda: results.append(self.put(image_bytes())))
            worker.start(); started.wait(5)
            with self.assertRaises(PhotoError) as raised: self.put(image_bytes())
            self.assertEqual(raised.exception.status, 409)
            release.set(); worker.join(5)
        self.assertEqual(len(self.store.list()['photos']), 1)

    def test_replay_racing_a_finishing_upload_never_publishes_twice(self):
        """Codex #6 review: B looks up the key while A is finishing; there must be one row and one directory."""
        resume_a, a_waiting, results, errors = threading.Event(), threading.Event(), {}, []
        original_derive, original_find = self.store.derive, self.store.find
        def paused_derive(*args):
            a_waiting.set(); resume_a.wait(5); return original_derive(*args)
        def find_then_let_a_finish(key):
            found = original_find(key)
            if threading.current_thread().name == 'B':
                resume_a.set()
                a.join(1)          # A cannot commit while B holds the lock between lookup and reservation
            return found
        def run(name):
            try: results[name] = self.put(image_bytes())
            except PhotoError as error: results[name] = error.status
            except Exception as error: errors.append(error)
        with patch.object(self.store, 'derive', side_effect=paused_derive), \
             patch.object(self.store, 'find', side_effect=find_then_let_a_finish):
            a = threading.Thread(target=run, args=('A',), name='A'); a.start(); a_waiting.wait(5)
            b = threading.Thread(target=run, args=('B',), name='B'); b.start(); b.join(10); a.join(10)
        self.assertEqual(errors, [])
        self.assertEqual(results['B'], 409)
        self.assertTrue(results['A'][1])
        replay, created = self.put(image_bytes())
        self.assertFalse(created); self.assertEqual(replay['id'], results['A'][0]['id'])
        self.assertEqual(len(self.store.list()['photos']), 1); self.assertEqual(self.published(), [replay['id']])

    def test_replay_requires_the_media_drive(self):
        self.put(image_bytes())
        (self.media/MARKER).unlink()
        with self.assertRaises(PhotoError) as raised: self.put(image_bytes())
        self.assertEqual(raised.exception.status, 503)

    def test_decode_concurrency_is_bounded(self):
        store = Photos(self.media, self.data/'bounded.sqlite3', decoders=2, isolate=False)
        active, peak, lock = [0], [0], threading.Lock()
        original = Image.open
        def tracked(*args, **kwargs):
            with lock: active[0] += 1; peak[0] = max(peak[0], active[0])
            threading.Event().wait(0.05)
            with lock: active[0] -= 1
            return original(*args, **kwargs)
        with patch.object(photos.Image, 'open', side_effect=tracked):
            threads = [threading.Thread(target=self.put, args=(image_bytes(), n, store)) for n in range(6)]
            for t in threads: t.start()
            for t in threads: t.join(10)
        self.assertLessEqual(peak[0], 2)
        self.assertEqual(len(store.list()['photos']), 6)


class StorageFailureTests(Store):
    def test_missing_marker_or_drive_is_a_clear_unavailable_error(self):
        photo, _ = self.put(image_bytes())
        (self.media/MARKER).unlink()
        for call in (self.store.list, lambda: self.store.file(photo['id'], 'display'),
                     lambda: self.put(image_bytes(), 1), lambda: self.store.remove(photo['id'])):
            with self.assertRaises(PhotoError) as raised: call()
            self.assertEqual(raised.exception.status, 503)
            self.assertIn('media drive', raised.exception.message)

    def test_unmounted_media_never_creates_directories(self):
        missing = Path(self.temp.name)/'unmounted'
        store = Photos(missing, self.data/'other.sqlite3', isolate=False)
        with self.assertRaises(PhotoError): store.list()
        self.assertFalse(missing.exists())

    def test_full_drive_is_refused_up_front_and_on_write(self):
        with patch.object(photos.shutil, 'disk_usage', return_value=type('U', (), {'free': 1024})()):
            with self.assertRaises(PhotoError) as raised: self.put(image_bytes())
        self.assertEqual(raised.exception.status, 507)
        original = Photos.save
        def full(*args):
            raise OSError(errno.ENOSPC, 'No space left on device')
        with patch.object(Photos, 'save', side_effect=full):
            with self.assertRaises(PhotoError) as raised: self.put(image_bytes(), 1)
        self.assertEqual(raised.exception.status, 507)
        self.assertEqual(self.published(), []); self.assertEqual(self.staging(), [])
        self.assertIs(Photos.save, original)


class CrashRecoveryTests(Store):
    """Media and catalog are on different mounts; a crash between steps must not expose or leak photos."""
    def restart(self):
        return Photos(self.media, self.data/'photos.sqlite3', isolate=False)

    def committed(self):
        photo, _ = self.put(image_bytes(color='blue'), 99)
        return photo['id']

    def crash_at(self, target, n=1):
        """Simulate the process dying at `target`; cleanup handlers don't run after a real crash."""
        class Crash(BaseException): pass
        with patch.object(photos.shutil, 'rmtree'), patch.object(Path, 'unlink'):
            with patch.object(*target, side_effect=Crash):
                with self.assertRaises(Crash): self.put(image_bytes(), n)

    def test_crash_between_file_publish_and_catalog_commit(self):
        keep = self.committed()
        self.crash_at((Photos, 'before_commit'))
        orphan = [name for name in self.published() if name != keep]
        self.assertEqual(len(orphan), 1)                         # files published, no row
        self.assertEqual([p['id'] for p in self.store.list()['photos']], [keep])
        with self.assertRaises(PhotoError): self.store.file(orphan[0], 'display')
        store = self.restart()
        self.assertEqual(self.published(), [keep]); self.assertEqual(self.staging(), [])
        self.assertTrue(store.file(keep, 'display'))
        photo, created = self.put(image_bytes(), 1, store)      # client retry with the same key succeeds once
        self.assertTrue(created); self.assertEqual(len(store.list()['photos']), 2)

    def test_crash_while_receiving_or_deriving_leaves_only_staging(self):
        keep = self.committed()
        self.crash_at((Photos, 'receive'), 1)
        self.crash_at((Photos, 'derive'), 2)
        self.assertNotEqual(self.staging(), [])
        self.restart()
        self.assertEqual(self.staging(), []); self.assertEqual(self.published(), [keep])

    def test_crash_after_removal_commit_leaves_an_orphan_that_recovery_cleans(self):
        keep, gone = self.committed(), self.put(image_bytes(), 5)[0]['id']
        with patch.object(photos.shutil, 'rmtree', side_effect=OSError('crash')):
            self.store.remove(gone)
        self.assertIn(gone, self.published())
        self.assertEqual([p['id'] for p in self.store.list()['photos']], [keep])
        self.assertEqual(self.store.recover(), 1)
        self.assertEqual(self.published(), [keep])

    def test_periodic_recovery_spares_fresh_staging_and_committed_photos(self):
        keep = self.committed()
        (self.media/'staging'/'inflight.upload').write_bytes(b'x')
        self.assertEqual(self.store.recover(), 0)
        self.assertEqual(self.staging(), ['inflight.upload'])
        self.assertEqual(self.store.recover(stale=-1), 1)
        self.assertEqual(self.published(), [keep])


class IsolatedDecodeTests(Store):
    """The production path: decoding runs in a separate, memory-capped process."""
    def setUp(self):
        super().setUp()
        self.store = Photos(self.media, self.data/'isolated.sqlite3')

    def test_worker_produces_rotated_stripped_derivatives(self):
        for n, body in enumerate((oriented_jpeg(), image_bytes('HEIF', (640, 480)))):
            photo, created = self.put(body, n)
            self.assertTrue(created)
            with Image.open(io.BytesIO(self.store.file(photo['id'], 'display'))) as result:
                self.assertEqual(dict(result.getexif()), {})
        self.assertEqual((self.store.list()['photos'][0]['width'], self.store.list()['photos'][0]['height']), (600, 800))

    def test_worker_errors_map_to_clear_responses(self):
        with self.assertRaises(PhotoError) as raised: self.put(b'\xff\xd8\xff\xe0' + b'damaged' * 40)
        self.assertEqual(raised.exception.status, 422)
        self.assertEqual(self.published(), []); self.assertEqual(self.staging(), [])

    @unittest.skipUnless(sys.platform.startswith('linux'), 'address-space limits are enforced on Linux only')
    def test_memory_cap_rejects_instead_of_exhausting_the_server(self):
        store = Photos(self.media, self.data/'capped.sqlite3', memory=160 * 1024 * 1024)
        with self.assertRaises(PhotoError) as raised:
            self.put(image_bytes('PNG', (7000, 7000), 'white'), 0, store)      # 49 MP decodes to ~147 MB
        self.assertEqual(raised.exception.status, 413)
        self.assertEqual(self.published(), []); self.assertEqual(self.staging(), [])


class ChangeFeedTests(Store):
    def test_upload_and_removal_publish_changes(self):
        start = self.store.changes.version
        photo, _ = self.put(image_bytes())
        self.assertEqual(self.store.changes.version, start + 1)
        self.put(image_bytes())                                  # idempotent repeat publishes nothing
        self.assertEqual(self.store.changes.version, start + 1)
        self.store.remove(photo['id'])
        self.assertEqual(self.store.changes.version, start + 2)
        self.assertEqual(self.store.changes.wait(start + 2, 0.01), start + 2)


class PhotoHTTPTests(Store):
    def setUp(self):
        super().setUp()
        self.app = app.Application(CONFIG, 'http://ha.test', 'https://ha.test', 'https://app.test/hearthglance/',
            self.data/'sessions.json', Path(self.temp.name), photos=self.store)
        self.sid = self.app.sessions.create({'access_token': 't', 'refresh_token': 'r', 'expires_in': 3600})
        self.csrf = self.app.sessions.records[self.app.sessions.key(self.sid)]['csrf']
        self.server = app.serve(self.app, '127.0.0.1', 0)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); super().tearDown()

    def request(self, method, path, body=None, auth=True, csrf=True, headers=None):
        h = {'Cookie': 'hg_session=' + self.sid} if auth else {}
        if method != 'GET' and csrf: h['X-HG-CSRF'] = self.csrf
        h.update(headers or {})
        conn = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=10)
        conn.request(method, '/hearthglance/' + path, body, h)
        response = conn.getresponse(); data = response.read(); conn.close()
        return response.status, dict(response.getheaders()), data

    def upload(self, body, n=0, **kwargs):
        headers = {'Content-Type': 'image/jpeg', 'Idempotency-Key': key(n), **kwargs.pop('headers', {})}
        return self.request('POST', 'api/photos', body, headers=headers, **kwargs)

    def test_full_path_upload_list_read_and_remove(self):
        status, _, body = self.upload(oriented_jpeg())
        self.assertEqual(status, 201); photo = json.loads(body)['photo']
        self.assertEqual(self.upload(oriented_jpeg())[0], 200)
        status, _, body = self.request('GET', 'api/photos')
        listing = json.loads(body)
        self.assertEqual(listing['album']['name'], 'Family Photos')
        self.assertEqual([p['id'] for p in listing['photos']], [photo['id']])
        status, headers, image = self.request('GET', photo['display'][2:])
        self.assertEqual((status, headers['Content-Type']), (200, 'image/jpeg'))
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertEqual(self.request('GET', photo['thumb'][2:])[1]['Cache-Control'], 'no-store')
        self.assertEqual(self.request('DELETE', 'api/photos/' + photo['id'])[0], 200)
        self.assertEqual(self.request('GET', photo['display'][2:])[0], 404)
        self.assertEqual(json.loads(self.request('GET', 'api/photos')[2])['photos'], [])

    def test_unauthenticated_and_cross_site_requests_are_rejected(self):
        photo = self.put(image_bytes())[0]
        self.assertEqual(self.upload(image_bytes(), 1, auth=False)[0], 401)
        self.assertEqual(self.upload(image_bytes(), 1, csrf=False)[0], 403)
        self.assertEqual(self.upload(image_bytes(), 1, headers={'Origin': 'https://evil.test'})[0], 400)
        self.assertEqual(self.upload(image_bytes(), 1, headers={'Sec-Fetch-Site': 'cross-site'})[0], 403)
        self.assertEqual(self.request('GET', 'api/photos', auth=False)[0], 401)
        self.assertEqual(self.request('GET', photo['thumb'][2:], auth=False)[0], 401)
        self.assertEqual(self.request('DELETE', 'api/photos/' + photo['id'], csrf=False)[0], 403)
        self.assertEqual(self.request('DELETE', 'api/photos/' + photo['id'], auth=False)[0], 401)
        self.assertEqual(len(self.store.list()['photos']), 1)

    def test_errors_are_reported_without_partial_photos(self):
        self.assertEqual(self.upload(b'GIF89a' + b'\0' * 50)[0], 415)
        self.assertEqual(self.upload(image_bytes(), headers={'Idempotency-Key': 'bad'})[0], 400)
        self.assertEqual(self.request('DELETE', 'api/photos/' + 'a' * 24)[0], 404)
        (self.media/MARKER).unlink()
        status, _, body = self.request('GET', 'api/photos')
        self.assertEqual(status, 503); self.assertIn('media drive', json.loads(body)['error'])
        self.assertEqual(self.upload(image_bytes(), 1)[0], 503)

    def test_photos_disabled_when_no_media_is_configured(self):
        self.app.photos = None
        self.assertEqual(self.request('GET', 'api/photos')[0], 503)


if __name__ == '__main__':
    unittest.main()
