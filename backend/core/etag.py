"""
Conditional GET (ETag / 304) for the JSON API.

Sep 30 2026 — 29 screens poll their data every 15 seconds and nearly every
poll returns exactly what the screen already shows: the full Pre-Sales lead
list, the Accounts overview, every project. Each unchanged poll still paid
for gzip on the server, megabytes over the network (painful on site
engineers' mobile data), a JSON parse in the browser and a re-render of
thousands of rows.

Every GET /api/* JSON response of MIN_SIZE bytes or more now carries a hash
of its body as an ETag. The frontend (src/lib/etagCache.js) sends the last
one back in If-None-Match; when the body is byte-identical the answer is an
empty 304 and the page keeps the data object it already has, so React skips
the re-render entirely.

The route still runs in full on every request, so a 304 is only ever sent
for a body identical to the one the client holds: nothing can go stale.
Responses also get `Cache-Control: no-store`: the browser's own HTTP cache is
not used for API data, which keeps financial data off the disk.

Must sit INSIDE GZipMiddleware (added to the app before it), so the hash is
taken over the uncompressed JSON.
"""
import hashlib

MIN_SIZE = 2048
MAX_BUFFER = 64 * 1024 * 1024


def _etag_matches(if_none_match: str, etag: str) -> bool:
    if if_none_match.strip() == "*":
        return True
    bare = etag.removeprefix("W/")
    return any(tag.strip().removeprefix("W/") == bare for tag in if_none_match.split(","))


class ETagMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] != "GET" or not scope["path"].startswith("/api/"):
            await self.app(scope, receive, send)
            return

        if_none_match = None
        for key, value in scope["headers"]:
            if key == b"if-none-match":
                if_none_match = value.decode("latin-1")
                break

        start = None
        chunks = []
        size = 0
        passthrough = False

        async def send_wrapper(message):
            nonlocal start, size, passthrough
            if passthrough:
                await send(message)
                return

            if message["type"] == "http.response.start":
                headers = dict(message.get("headers", []))
                if (
                    message["status"] != 200
                    or not headers.get(b"content-type", b"").startswith(b"application/json")
                    or b"etag" in headers
                ):
                    passthrough = True
                    await send(message)
                    return
                start = message
                return

            if message["type"] != "http.response.body":
                await send(message)
                return

            chunks.append(message.get("body", b""))
            size += len(chunks[-1])
            if message.get("more_body", False):
                if size > MAX_BUFFER:
                    # Too big to hold: stream the rest through untouched.
                    passthrough = True
                    await send(start)
                    await send({"type": "http.response.body", "body": b"".join(chunks), "more_body": True})
                return

            body = b"".join(chunks)
            if size < MIN_SIZE:
                await send(start)
                await send({"type": "http.response.body", "body": body})
                return

            etag = 'W/"' + hashlib.blake2b(body, digest_size=16).hexdigest() + '"'
            headers = [(k, v) for k, v in start["headers"] if k not in (b"etag", b"cache-control")]
            headers += [(b"etag", etag.encode("latin-1")), (b"cache-control", b"no-store")]

            if if_none_match and _etag_matches(if_none_match, etag):
                headers = [(k, v) for k, v in headers if k not in (b"content-length", b"content-type")]
                await send({"type": "http.response.start", "status": 304, "headers": headers})
                await send({"type": "http.response.body", "body": b""})
                return

            await send({**start, "headers": headers})
            await send({"type": "http.response.body", "body": body})

        await self.app(scope, receive, send_wrapper)
