#!/bin/sh
set -e

# Apply pending migrations before starting (safe to run on every boot; no-op when up to date).
if [ "${SKIP_MIGRATIONS:-false}" != "true" ]; then
  echo "[entrypoint] applying database migrations…"
  node node_modules/prisma/build/index.js migrate deploy
fi

exec "$@"
