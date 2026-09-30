#!/bin/bash
# gzip and year-long browser caching for the hashed React build in /static/.
#
# Sep 30 2026 — nginx served main.js (486 KB) and main.css (187 KB)
# uncompressed with no cache headers, so every visit re-checked them and
# slow phones downloaded ~670 KB before the login screen could draw.
#
# Run by the deploy workflow on every deploy. Writes one drop-in under
# conf.d (included inside nginx's http block), checks it with `nginx -t`,
# and reloads only when it changed. If nginx rejects it (e.g. nginx.conf
# already sets one of these directives), it retries without the gzip lines,
# then removes the drop-in, so a bad config can never be left in place.
# Always exits 0: this must not fail a deploy.
CONF=${NGINX_STATIC_CONF:-/etc/nginx/conf.d/myhomeusb-static.conf}

write_conf() {
  {
    echo "# Managed by hostinger_setup/nginx_static_cache.sh (deploy workflow). Edits are overwritten."
    if [ "$1" = "with_gzip" ]; then
      # `gzip on` is already set in nginx.conf; it only compresses text/html
      # until the types are listed.
      echo "gzip_types text/plain text/css application/javascript application/json image/svg+xml;"
      echo "gzip_vary on;"
      echo "gzip_comp_level 5;"
      echo "gzip_min_length 1024;"
    fi
    # Build file names change on every deploy, so a year is safe. Only
    # /static/ URLs: index.html and /api keep their own headers.
    echo 'map $uri $myhomeusb_static_expires {'
    echo '    ~^/static/  1y;'
    echo '    default     off;'
    echo '}'
    echo 'expires $myhomeusb_static_expires;'
  } > "$CONF.new"
}

apply() {
  local old=""
  [ -f "$CONF" ] && old=$(cat "$CONF")
  cp "$CONF.new" "$CONF"
  if nginx -t >/dev/null 2>&1; then
    if [ "$old" != "$(cat "$CONF")" ]; then
      systemctl reload nginx 2>/dev/null || nginx -s reload
      echo "nginx_static_cache: applied ($1), nginx reloaded"
    else
      echo "nginx_static_cache: unchanged ($1)"
    fi
    return 0
  fi
  echo "nginx_static_cache: nginx -t rejected the $1 variant:"
  nginx -t 2>&1 | tail -3
  return 1
}

if ! command -v nginx >/dev/null 2>&1 || [ ! -d "$(dirname "$CONF")" ]; then
  echo "nginx_static_cache: nginx or $(dirname "$CONF") not found, skipping"
  exit 0
fi

write_conf with_gzip
if apply with_gzip; then rm -f "$CONF.new"; exit 0; fi
write_conf cache_only
if apply cache_only; then rm -f "$CONF.new"; exit 0; fi

rm -f "$CONF" "$CONF.new"
nginx -t >/dev/null 2>&1 && { systemctl reload nginx 2>/dev/null || nginx -s reload; }
echo "nginx_static_cache: removed the drop-in, nginx config unchanged"
exit 0
