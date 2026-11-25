#!/usr/bin/env bash
# Assembles the deployable site: Tech Bench app at /, hosted J.A.R.V.I.S. at /jarvis/.
# Cloudflare Pages: build command `bash techbench-app/dev/build-site.sh`, output directory `site`.
# Set SUPABASE_URL and SUPABASE_ANON_KEY as Cloudflare Pages environment variables to turn on sync.
set -euo pipefail
APP="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$APP/../site}"
mkdir -p "$OUT/icons" "$OUT/jarvis"
cp "$APP"/{index.html,app.css,app.js,data.js,report.js,sw.js,manifest.webmanifest,config.js} "$OUT/"
cp "$APP"/icons/*.png "$OUT/icons/"
cp "$APP"/jarvis/index.html "$APP"/jarvis/hosted.js "$OUT/jarvis/"
if [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_ANON_KEY:-}" ]; then
  printf "window.TB_CONFIG = { supabaseUrl: '%s', supabaseAnonKey: '%s', reportFunction: 'report' };\n" "$SUPABASE_URL" "$SUPABASE_ANON_KEY" > "$OUT/config.js"
  echo "config.js written from environment variables"
else
  echo "SUPABASE_URL / SUPABASE_ANON_KEY not set: the site runs in this-device-only mode"
fi
# the service worker and settings must never be served stale
cat > "$OUT/_headers" <<'HEADERS'
/sw.js
  Cache-Control: no-cache
/config.js
  Cache-Control: no-cache
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
HEADERS
echo "site built in $OUT"
