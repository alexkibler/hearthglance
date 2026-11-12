"""Private, cached PNG endpoint. The Kobo never receives an HA credential."""
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hmac
import json
import os
from pathlib import Path
import threading
import time
import urllib.parse

from display import HomeAssistant, collect, render
from dashboard import collect_dashboard, complete_item, draw_view, offline_pack

CONFIG = json.loads(Path('/app/config.json').read_text())
IMAGE_TOKEN = Path('/run/secrets/image_token').read_text().strip()
HA = HomeAssistant(os.environ['HA_URL'], Path('/run/secrets/ha_token').read_text())
CACHE = Path('/cache/snapshot.json')
lock = threading.Lock()
refresh_lock = threading.RLock()
snapshot = json.loads(CACHE.read_text()) if CACHE.exists() else None
pack_lock = threading.Lock()
packed_snapshot, packed = None, None


def current_pack():
    global packed_snapshot, packed
    with lock: current = snapshot
    if current is None: raise RuntimeError('No snapshot')
    with pack_lock:
        if current is not packed_snapshot:
            packed = offline_pack(current, CONFIG)
            packed_snapshot = current
        return packed


def refresh_snapshot():
    global snapshot
    with refresh_lock:
        candidate = collect_dashboard(HA, CONFIG)
        if len(candidate['errors']) >= len(CONFIG['calendars']) + 4:
            raise RuntimeError('Home Assistant unavailable; retaining cached image')
        tmp = CACHE.with_suffix('.tmp')
        tmp.write_text(json.dumps(candidate))
        tmp.replace(CACHE)
        with lock:
            snapshot = candidate
        print(datetime.now().isoformat(), 'Snapshot refreshed;', len(candidate['errors']), 'source errors', flush=True)


def refresh_loop():
    while True:
        try:
            refresh_snapshot()
        except Exception as exc:
            print(datetime.now().isoformat(), type(exc).__name__, 'Refresh failed; retaining cache', flush=True)
        time.sleep(3600)


class Handler(BaseHTTPRequestHandler):
    def authorized(self):
        return hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + IMAGE_TOKEN)

    def json_response(self, data):
        body = json.dumps(data).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def view(self, values):
        with lock: current = snapshot
        if current is None: raise RuntimeError('No snapshot')
        return draw_view(current, CONFIG, **{key: values[key] for key in
            ('page','offset','group','recipe','section') if key in values})

    def do_GET(self):
        if self.path == '/health':
            self.send_response(200 if snapshot else 503)
            self.end_headers()
            return
        parsed = urllib.parse.urlsplit(self.path)
        if parsed.path not in ('/family.png', '/view', '/offline'):
            self.send_error(404)
            return
        if not self.authorized():
            self.send_error(401)
            return
        if parsed.path in ('/view', '/offline'):
            try:
                query = {key: value[-1] for key, value in urllib.parse.parse_qs(parsed.query).items()}
                if query.get('refresh') == '1': refresh_snapshot()
                self.json_response(current_pack() if parsed.path == '/offline' else self.view(query))
            except (ValueError, TypeError, KeyError): self.send_error(400, 'Invalid view')
            except Exception: self.send_error(503, 'View unavailable')
            return
        with lock:
            current = snapshot
        if current is None:
            self.send_error(503, 'No snapshot available')
            return
        png = render(current)
        self.send_response(200)
        self.send_header('Content-Type', 'image/png')
        self.send_header('Content-Length', str(len(png)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(png)

    def do_POST(self):
        global snapshot
        if self.path != '/complete': self.send_error(404); return
        if not self.authorized(): self.send_error(401); return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 4096: raise ValueError('Invalid body size')
            body = json.loads(self.rfile.read(size))
            with refresh_lock:
                complete_item(HA, CONFIG, body.get('entity'), body.get('uid'))
                # Refresh the source item collection after HA confirms the operation.
                # Do not re-send a write if subsequent rendering or other sources fail.
                try: refresh_snapshot()
                except Exception:
                    with lock:
                        current = json.loads(json.dumps(snapshot))
                        for item in current.get('todos', {}).get(body['entity'], []):
                            if item['uid'] == body['uid']: item['status'] = 'completed'
                        snapshot = current
                self.json_response(current_pack() if body.get('offline') else self.view(body.get('view') or {'page':'chores'}))
        except (ValueError, TypeError, KeyError): self.send_error(400, 'Invalid item')
        except Exception: self.send_error(503, 'Unable to confirm completion')

    def log_message(self, fmt, *args):
        # No headers, tokens, calendar content, or query strings in logs.
        pass


if __name__ == '__main__':
    threading.Thread(target=refresh_loop, daemon=True).start()
    ThreadingHTTPServer(('0.0.0.0', 8080), Handler).serve_forever()
