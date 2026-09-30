// Sep 30 2026 — Conditional GETs for our own API (backend/core/etag.py).
//
// Most screens re-fetch their data every 15 seconds and nearly every refresh
// comes back identical. The backend now tags each JSON response with an ETag;
// we send the last one back in If-None-Match and an unchanged answer is an
// empty 304 instead of the full payload (the Pre-Sales lead list alone is
// megabytes). On a 304 the caller gets the SAME data object it got last time,
// so `setLeads(res.data)` is a no-op and React skips re-rendering thousands of
// rows.
//
// Pages sometimes edit fetched objects in place. Handing such an object back
// would show local edits the server never accepted, so the cached object is
// only reused while it still serialises to exactly what the server sent;
// otherwise the caller gets a fresh copy of the server's data, as before.
//
// Memory only (never storage): a reload starts clean, and nothing lands on
// disk. Same-origin /api/ requests only: cross-origin, If-None-Match would
// force a CORS preflight on every GET.

const MAX_ENTRIES = 50;
const MAX_SNAPSHOT_CHARS = 32 * 1024 * 1024;

const cache = new Map(); // full URL -> { etag, data, snapshot }

function apiKey(instance, config) {
  const method = (config.method || 'get').toLowerCase();
  if (method !== 'get') return null;
  if (config.responseType && config.responseType !== 'json') return null;
  try {
    const url = new URL(instance.getUri(config), window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return null;
    return url.href;
  } catch {
    return null;
  }
}

function headerValue(headers, name) {
  if (!headers) return undefined;
  return typeof headers.get === 'function' ? headers.get(name) : headers[name];
}

function remember(key, etag, data) {
  let snapshot;
  try {
    snapshot = JSON.stringify(data);
  } catch {
    return;
  }
  if (typeof snapshot !== 'string' || snapshot.length > MAX_SNAPSHOT_CHARS) return;
  cache.delete(key);
  cache.set(key, { etag, data, snapshot });
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
}

export function installEtagCache(instance) {
  instance.interceptors.request.use(config => {
    const key = apiKey(instance, config);
    if (!key) return config;
    config.__etagKey = key;
    const hit = cache.get(key);
    if (hit) {
      // Kept on the config so a concurrent eviction can't lose it before the 304.
      config.__etagHit = hit;
      if (typeof config.headers?.set === 'function') config.headers.set('If-None-Match', hit.etag);
      else config.headers = { ...config.headers, 'If-None-Match': hit.etag };
      const validate = config.validateStatus;
      if (typeof validate === 'function') config.validateStatus = status => status === 304 || validate(status);
    }
    return config;
  });

  instance.interceptors.response.use(response => {
    const { __etagKey: key, __etagHit: hit } = response.config || {};
    if (!key) return response;

    if (response.status === 304 && hit) {
      let data = hit.data;
      let unchanged = false;
      try {
        unchanged = JSON.stringify(data) === hit.snapshot;
      } catch { /* fall through to a fresh copy */ }
      if (!unchanged) {
        data = JSON.parse(hit.snapshot);
        hit.data = data;
      }
      cache.delete(key);
      cache.set(key, hit);
      return { ...response, status: 200, statusText: 'OK', data };
    }

    const etag = headerValue(response.headers, 'etag');
    if (response.status === 200 && etag) remember(key, etag, response.data);
    else cache.delete(key);
    return response;
  });
}

export function clearEtagCache() {
  cache.clear();
}
