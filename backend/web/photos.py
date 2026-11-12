"""Hearthglance-owned photo storage: external media mount, SQLite catalog, display derivatives.

Layout under the media root (one filesystem, so renames are atomic):
  .hearthglance-media    provisioned marker; without it the mount is treated as unavailable
  staging/               raw uploads and derivative work directories
  photos/<id>/           published display.jpg + thumb.jpg

The catalog lives in SQLite on the data mount. Media and catalog are on different mounts and share no
transaction, so publishing is ordered: derivatives are renamed into photos/ first, then the row is
committed. Removal commits the row deletion first, then deletes files. A crash at any point leaves at
most an unreferenced directory or staging entry, which recover() removes. recover() never deletes a
directory that has a committed row.
"""
from contextlib import contextmanager
import errno
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
import sqlite3
import threading
import time

from PIL import Image
import pillow_heif

pillow_heif.register_heif_opener()

MARKER = '.hearthglance-media'
ALBUM = {'id': 'family', 'name': 'Family Photos'}
DISPLAY_EDGE = 2880          # longest edge of the display derivative (covers 2880x1620 walls and iPhone Pro Max)
THUMB_EDGE = 512
MAX_BYTES = 50 * 1024 * 1024
MAX_PIXELS = 60_000_000      # 48 MP iPhone captures fit; larger inputs are rejected before decoding
FREE_RESERVE = 256 * 1024 * 1024
DECODE_MEMORY = 1024 * 1024 * 1024   # address-space cap for one decode worker (Linux)
HEIF_BRANDS = {b'heic', b'heix', b'heim', b'heis', b'hevc', b'hevx', b'mif1', b'msf1'}
PHOTO_ID = re.compile(r'[a-f0-9]{24}')
IDEMPOTENCY_KEY = re.compile(r'[A-Za-z0-9_-]{16,64}')
# Pillow's own bomb guard stays above our limit so the explicit check below gives the clear 413 first.
Image.MAX_IMAGE_PIXELS = MAX_PIXELS * 2
T = Image.Transpose
ORIENT = {2: T.FLIP_LEFT_RIGHT, 3: T.ROTATE_180, 4: T.FLIP_TOP_BOTTOM, 5: T.TRANSPOSE,
          6: T.ROTATE_270, 7: T.TRANSVERSE, 8: T.ROTATE_90}


class PhotoError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status, self.message = status, message


def unavailable():
    return PhotoError(503, 'Photo storage is unavailable. Check that the media drive is connected.')


def sniff(head):
    """Actual format from magic bytes, independent of filename or declared Content-Type."""
    if head.startswith(b'\xff\xd8\xff'): return 'JPEG'
    if head.startswith(b'\x89PNG\r\n\x1a\n'): return 'PNG'
    if len(head) >= 12 and head[4:8] == b'ftyp' and head[8:12] in HEIF_BRANDS: return 'HEIF'
    return None


class Changes:
    """Small in-process change feed. Wall's event stream (#8) waits on it."""
    def __init__(self):
        self.version, self.condition = 0, threading.Condition()

    def publish(self):
        with self.condition:
            self.version += 1
            self.condition.notify_all()
            return self.version

    def wait(self, after, timeout):
        with self.condition:
            self.condition.wait_for(lambda: self.version != after, timeout)
            return self.version


class Photos:
    def __init__(self, media, database, changes=None, decoders=1, clock=time.time, isolate=True,
                 memory=DECODE_MEMORY, timeout=120):
        self.media, self.database = Path(media), Path(database)
        self.changes = changes or Changes()
        self.decode = threading.BoundedSemaphore(max(1, int(decoders)))
        self.lock = threading.RLock()          # orders publish/remove against recovery
        self.inflight = set()
        self.clock = clock
        self.isolate, self.memory, self.timeout = isolate, int(memory), timeout
        with self.connect() as db:
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('''CREATE TABLE IF NOT EXISTS photos (
                id TEXT PRIMARY KEY, album TEXT NOT NULL, idempotency TEXT UNIQUE NOT NULL,
                created REAL NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
                thumb_width INTEGER NOT NULL, thumb_height INTEGER NOT NULL, format TEXT NOT NULL)''')
        try: self.recover(startup=True)
        except PhotoError: pass               # app still starts; photo requests report the missing drive

    @contextmanager
    def connect(self):
        connection = sqlite3.connect(self.database, timeout=10, isolation_level=None)
        connection.row_factory = sqlite3.Row
        try: yield connection
        finally: connection.close()

    # --- media mount -------------------------------------------------------------------------
    def root(self):
        """Media root after verifying the provisioned marker. Checked on every read and write."""
        try:
            if not (self.media/MARKER).is_file(): raise unavailable()
            for name in ('staging', 'photos'): (self.media/name).mkdir(exist_ok=True)
        except OSError: raise unavailable() from None
        return self.media

    def available(self):
        try: self.root(); return True
        except PhotoError: return False

    # --- catalog -----------------------------------------------------------------------------
    @staticmethod
    def describe(row):
        return {'id': row['id'], 'album': row['album'], 'created': row['created'],
            'width': row['width'], 'height': row['height'],
            'thumb_width': row['thumb_width'], 'thumb_height': row['thumb_height'],
            'display': f"./api/photos/{row['id']}/display", 'thumb': f"./api/photos/{row['id']}/thumb"}

    def list(self, album='family'):
        self.root()
        with self.connect() as db:
            rows = db.execute('SELECT * FROM photos WHERE album=? ORDER BY created, id', (album,)).fetchall()
        return {'album': ALBUM, 'photos': [self.describe(r) for r in rows], 'version': self.changes.version}

    def file(self, photo, variant):
        if not PHOTO_ID.fullmatch(photo) or variant not in ('display', 'thumb'): raise PhotoError(404, 'Photo not found.')
        root = self.root()
        with self.connect() as db:
            if not db.execute('SELECT 1 FROM photos WHERE id=?', (photo,)).fetchone(): raise PhotoError(404, 'Photo not found.')
        try: return (root/'photos'/photo/f'{variant}.jpg').read_bytes()
        except FileNotFoundError: raise PhotoError(404, 'Photo not found.') from None
        except OSError: raise unavailable() from None

    # --- upload ------------------------------------------------------------------------------
    def upload(self, stream, length, key):
        """Stage, validate, derive and publish one photo. Returns (photo, created)."""
        if not IDEMPOTENCY_KEY.fullmatch(key or ''): raise PhotoError(400, 'Missing or invalid Idempotency-Key.')
        if not isinstance(length, int) or not 0 < length <= MAX_BYTES:
            raise PhotoError(413, f'Photos must be smaller than {MAX_BYTES // (1024*1024)} MB.')
        existing = self.find(key)
        if existing: return existing, False
        with self.lock:
            if key in self.inflight: raise PhotoError(409, 'This photo is still uploading. Try again shortly.')
            self.inflight.add(key)
        root, staged, work = None, None, None
        try:
            root = self.root()
            if shutil.disk_usage(root).free < length * 4 + FREE_RESERVE:
                raise PhotoError(507, 'The photo drive is full.')
            token = secrets.token_hex(12)
            staged, work = root/'staging'/f'{token}.upload', root/'staging'/f'{token}.d'
            self.receive(stream, length, staged)
            with staged.open('rb') as file: kind = sniff(file.read(16))
            if not kind: raise PhotoError(415, 'Only HEIC, JPEG and PNG photos are supported.')
            work.mkdir()
            size, thumb = self.derive(staged, kind, work)
            return self.publish(key, token, kind, size, thumb, work), True
        except PhotoError: raise
        except OSError as error:
            if error.errno in (errno.ENOSPC, errno.EDQUOT): raise PhotoError(507, 'The photo drive is full.') from None
            raise unavailable() from None
        finally:
            for path in (staged, work):
                if path and path.exists(): shutil.rmtree(path) if path.is_dir() else path.unlink()
            with self.lock: self.inflight.discard(key)

    def find(self, key):
        with self.connect() as db:
            row = db.execute('SELECT * FROM photos WHERE idempotency=?', (key,)).fetchone()
        return self.describe(row) if row else None

    @staticmethod
    def receive(stream, length, path):
        remaining = length
        with path.open('xb') as file:
            while remaining:
                chunk = stream.read(min(remaining, 256 * 1024))
                if not chunk: raise PhotoError(400, 'The upload was interrupted. Try again.')
                file.write(chunk); remaining -= len(chunk)
            file.flush(); os.fsync(file.fileno())

    def derive(self, staged, kind, work):
        with self.decode:
            if not self.isolate: return self.derive_files(staged, kind, work)
            return self.derive_isolated(staged, kind, work)

    def derive_isolated(self, staged, kind, work):
        """Decode in a short-lived process so peak memory is capped and returned to the OS afterwards."""
        command = [sys.executable, '-I', str(Path(__file__).resolve()), 'derive', str(staged), kind, str(work),
            str(self.memory)]
        env = dict(os.environ, MALLOC_ARENA_MAX='2')
        try: result = subprocess.run(command, capture_output=True, timeout=self.timeout, env=env)
        except subprocess.TimeoutExpired: raise PhotoError(422, 'This photo took too long to process.') from None
        try: reply = json.loads(result.stdout.decode().strip().splitlines()[-1])
        except (ValueError, IndexError): reply = {}
        if result.returncode == 0 and 'display' in reply: return tuple(reply['display']), tuple(reply['thumb'])
        if reply.get('error') == 'enospc': raise OSError(errno.ENOSPC, 'No space left on device')
        if reply.get('error') == 'io': raise OSError(errno.EIO, 'Media write failed')
        if isinstance(reply.get('error'), int): raise PhotoError(reply['error'], reply['message'])
        raise PhotoError(413, 'This photo is too large to process on this server.')

    @classmethod
    def derive_files(cls, staged, kind, work):
        try:
            with Image.open(staged) as image:
                if image.format not in {'JPEG': ('JPEG', 'MPO'), 'PNG': ('PNG',), 'HEIF': ('HEIF',)}[kind]:
                    raise PhotoError(415, 'The file content does not match a supported photo format.')
                width, height = image.size
                if width * height > MAX_PIXELS or min(width, height) < 1:
                    raise PhotoError(413, 'This photo has too many pixels.')
                if kind == 'JPEG': image.draft('RGB', (DISPLAY_EDGE, DISPLAY_EDGE))   # decode at reduced scale
                orientation = image.getexif().get(0x0112, 1)
                icc = image.info.get('icc_profile')
                image.thumbnail((DISPLAY_EDGE, DISPLAY_EDGE), Image.Resampling.LANCZOS)
                image = cls.flatten(image)
                if orientation in ORIENT: image = image.transpose(ORIENT[orientation])
                display = cls.save(image, work/'display.jpg', icc)
                image.thumbnail((THUMB_EDGE, THUMB_EDGE), Image.Resampling.LANCZOS)
                thumb = cls.save(image, work/'thumb.jpg', icc)
                return display, thumb
        except PhotoError: raise
        except (Image.DecompressionBombError, Image.DecompressionBombWarning):
            raise PhotoError(413, 'This photo has too many pixels.') from None
        except OSError as error:
            if error.errno in (errno.ENOSPC, errno.EDQUOT): raise
            if error.errno is not None: raise
            raise PhotoError(422, 'This photo could not be read. It may be damaged.') from None
        except (ValueError, SyntaxError, EOFError):
            raise PhotoError(422, 'This photo could not be read. It may be damaged.') from None

    @staticmethod
    def flatten(image):
        if image.mode in ('RGBA', 'LA') or (image.mode == 'P' and 'transparency' in image.info):
            image = image.convert('RGBA')
            background = Image.new('RGB', image.size, (15, 21, 18))
            background.paste(image, mask=image.getchannel('A'))
            return background
        return image.convert('RGB')

    @staticmethod
    def save(image, path, icc):
        # No EXIF, XMP or GPS is written; only the colour profile is kept so colours render correctly.
        options = {'quality': 85, 'optimize': True, 'progressive': True}
        if icc: options['icc_profile'] = icc
        with path.open('xb') as file:
            image.save(file, 'JPEG', **options)
            file.flush(); os.fsync(file.fileno())
        return image.size

    def publish(self, key, token, kind, size, thumb, work):
        photo = token
        with self.lock:
            target = self.root()/'photos'/photo
            os.replace(work, target)                    # 1. files become visible under photos/
            self.before_commit(photo)                   # test hook for crash injection
            with self.connect() as db:                  # 2. catalog row makes the photo visible to clients
                db.execute('INSERT INTO photos VALUES (?,?,?,?,?,?,?,?,?)', (photo, ALBUM['id'], key, self.clock(),
                    size[0], size[1], thumb[0], thumb[1], kind))
                row = db.execute('SELECT * FROM photos WHERE id=?', (photo,)).fetchone()
        self.changes.publish()
        return self.describe(row)

    def before_commit(self, photo):
        pass

    # --- removal and recovery ----------------------------------------------------------------
    def remove(self, photo):
        if not PHOTO_ID.fullmatch(photo): raise PhotoError(404, 'Photo not found.')
        root = self.root()
        with self.lock:
            with self.connect() as db:                  # 1. row deletion hides the photo everywhere
                if not db.execute('DELETE FROM photos WHERE id=?', (photo,)).rowcount: raise PhotoError(404, 'Photo not found.')
            try: shutil.rmtree(root/'photos'/photo)     # 2. files; a crash here leaves an orphan for recover()
            except FileNotFoundError: pass
            except OSError: pass
        self.changes.publish()

    def recover(self, startup=False, stale=3600):
        """Delete unreferenced published directories and abandoned staging entries."""
        root = self.root()
        removed = 0
        with self.lock:
            with self.connect() as db:
                known = {r['id'] for r in db.execute('SELECT id FROM photos')}
            for entry in (root/'photos').iterdir():
                if entry.name not in known:
                    shutil.rmtree(entry, ignore_errors=True) if entry.is_dir() else entry.unlink(missing_ok=True)
                    removed += 1
            now = self.clock()
            for entry in (root/'staging').iterdir():
                # Uploads in progress belong to this process; at startup none can be.
                if startup or now - entry.stat().st_mtime > stale:
                    shutil.rmtree(entry, ignore_errors=True) if entry.is_dir() else entry.unlink(missing_ok=True)
                    removed += 1
        return removed

    def recover_periodically(self, interval=600):
        def loop():
            while True:
                time.sleep(interval)
                try: self.recover()
                except Exception: pass
        threading.Thread(target=loop, name='photo-recovery', daemon=True).start()


def worker(argv):
    """Entry point for the decode process: python photos.py derive <staged> <kind> <work> <memory bytes>."""
    _, staged, kind, work, memory = argv
    if sys.platform.startswith('linux') and int(memory) > 0:
        import resource
        resource.setrlimit(resource.RLIMIT_AS, (int(memory), int(memory)))
    pillow_heif.options.DECODE_THREADS = 1
    try:
        display, thumb = Photos.derive_files(Path(staged), kind, Path(work))
        reply, code = {'display': display, 'thumb': thumb}, 0
    except PhotoError as error: reply, code = {'error': error.status, 'message': error.message}, 2
    except MemoryError: reply, code = {'error': 413, 'message': 'This photo is too large to process on this server.'}, 2
    except OSError as error:
        reply, code = {'error': 'enospc' if error.errno in (errno.ENOSPC, errno.EDQUOT) else 'io'}, 2
    print(json.dumps(reply))
    return code


if __name__ == '__main__' and sys.argv[1:2] == ['derive']:
    sys.exit(worker(sys.argv[1:]))
