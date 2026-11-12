# Photos API

Contract for Sidekick Photos (#7) and Wall (#8). All paths are relative to the app base path (for example `/hearthglance/`). Every request needs the signed-in `hg_session` cookie. Writes also need the `X-HG-CSRF` token from `GET api/session`, a same-origin `Origin` header (or none), and no `Sec-Fetch-Site: cross-site`.

There is one shared album in this release: `{"id": "family", "name": "Family Photos"}`.

## Photo object

```json
{
  "id": "5f0c1e9a8b7d6c5e4f3a2b1c",
  "album": "family",
  "created": 1794873600.123,
  "width": 2160, "height": 2880,
  "thumb_width": 384, "thumb_height": 512,
  "display": "./api/photos/5f0c1e9a8b7d6c5e4f3a2b1c/display",
  "thumb": "./api/photos/5f0c1e9a8b7d6c5e4f3a2b1c/thumb"
}
```

`width`/`height` describe the display image after rotation. `display` and `thumb` are relative URLs to resolve against the app base.

## Endpoints

| Method | Path | Success | Notes |
|---|---|---|---|
| GET | `api/photos` | `200 {"album", "photos": [Photo], "version"}` | Oldest first. `version` increases on every upload or removal. |
| GET | `api/photos/<id>/display` | `200 image/jpeg` | Longest edge ≤ 2880 px. `Cache-Control: private, max-age=31536000, immutable`. |
| GET | `api/photos/<id>/thumb` | `200 image/jpeg` | Longest edge ≤ 512 px. Same caching. |
| POST | `api/photos` | `201 {"photo"}` new, `200 {"photo"}` repeat | Raw image bytes as the body (not multipart). Requires `Content-Length` and `Idempotency-Key`. |
| DELETE | `api/photos/<id>` | `200 {"removed": "<id>"}` | Removes the catalog row first, then the files. |

### Upload rules

- `Idempotency-Key`: 16–64 characters from `A-Z a-z 0-9 _ -`. Generate one per selected file and reuse it on every retry of that file. A repeat after success returns the original photo with `200`. A repeat while the first attempt is still processing returns `409`, so retry shortly.
- The format comes from the file's content, not `Content-Type`. HEIC/HEIF, JPEG and PNG are accepted.
- Limits: 50 MB per file and 60 megapixels. Chunked transfer encoding is rejected.
- Derivatives are rotated upright, transparent areas are flattened, and they're saved as JPEG with no EXIF, GPS, camera or XMP metadata. Only the colour profile is kept. The original upload is not retained.
- A photo appears in listings only after both derivatives are stored and its catalog row is committed. Interrupted or failed uploads never appear and leave no files behind.

### Errors

Errors return JSON `{"error": "<message for people>"}`.

| Status | Meaning | Client action |
|---|---|---|
| 400 | Missing/invalid `Idempotency-Key`, interrupted body, bad request | Fix or retry |
| 401 | Not signed in | Sign in |
| 403 | Missing CSRF token or cross-site request | Reload the app |
| 404 | Unknown photo | Refresh the list |
| 409 | Same `Idempotency-Key` is still processing | Retry after a short delay |
| 413 | File too big, too many pixels, or too large to process within the memory cap | Don't retry |
| 415 | Not HEIC, JPEG or PNG | Don't retry |
| 422 | Damaged or unreadable image | Don't retry |
| 503 | Media drive unavailable or photos not configured | Retry later; other app features still work |
| 507 | Media drive full | Don't retry until space is freed |

## Change notifications

Uploads and removals bump an in-process change counter (`Changes` in `backend/web/photos.py`). Wall's event stream (#8) announces the new `version`, and clients then call `GET api/photos` again.
