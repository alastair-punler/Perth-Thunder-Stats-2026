#!/bin/sh
set -e
# Inject Railway env vars into the JS config before nginx starts.
envsubst '${SUPABASE_URL} ${SUPABASE_ANON_KEY} ${APP_TOKEN}' \
  < /usr/share/nginx/html/js/config.js.template \
  > /usr/share/nginx/html/js/config.js
# Hand off to the default nginx entrypoint (processes nginx conf templates, starts nginx).
exec /docker-entrypoint.sh "$@"
