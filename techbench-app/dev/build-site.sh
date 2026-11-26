#!/usr/bin/env bash
# Assembles the deployable site:
#   /         Pickle's CCE Tech Bench
#   /jarvis/  hosted J.A.R.V.I.S. command centre (ElevenLabs voice)
#   /psr/     PSR Tool
# Cloudflare Pages: build command `bash techbench-app/dev/build-site.sh`, output directory `site`.
# SUPABASE_URL / SUPABASE_ANON_KEY (Cloudflare Pages environment variables), if set, override the
# Supabase project in config.js; otherwise the committed config is used.
set -euo pipefail
APP="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$APP/.." && pwd)"
OUT="${1:-$ROOT/site}"
mkdir -p "$OUT/icons" "$OUT/jarvis" "$OUT/psr/icons" "$OUT/psr/vendor" "$OUT/psr/splash"

cp "$APP"/{index.html,app.css,app.js,data.js,report.js,parts.js,sw.js,manifest.webmanifest,config.js} "$OUT/"
cp "$APP"/icons/*.png "$OUT/icons/"
cp "$APP"/jarvis/index.html "$APP"/jarvis/hosted.js "$APP"/jarvis/manifest.webmanifest "$APP"/jarvis/jarvis-greeting.mp3 "$OUT/jarvis/"

PSR="$ROOT/psr-app"
cp "$PSR"/{index.html,app.css,app.js,sync.js,sw.js,manifest.webmanifest,config.js} "$OUT/psr/"
cp "$PSR"/icons/*.png "$OUT/psr/icons/"
cp "$PSR"/vendor/*.js "$OUT/psr/vendor/"
cp "$PSR"/splash/*.png "$OUT/psr/splash/"

if [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_ANON_KEY:-}" ]; then
  printf "window.TB_CONFIG = { supabaseUrl: '%s', supabaseAnonKey: '%s', reportFunction: 'report' };\n" "$SUPABASE_URL" "$SUPABASE_ANON_KEY" > "$OUT/config.js"
  printf "window.PSR_CONFIG = { supabaseUrl: '%s', supabaseAnonKey: '%s', psrFunction: 'psr' };\n" "$SUPABASE_URL" "$SUPABASE_ANON_KEY" > "$OUT/psr/config.js"
  echo "config.js files written from environment variables"
else
  echo "Using the Supabase project in the committed config.js files"
fi

# service workers and settings must never be served stale
cat > "$OUT/_headers" <<'HEADERS'
/sw.js
  Cache-Control: no-cache
/config.js
  Cache-Control: no-cache
/psr/sw.js
  Cache-Control: no-cache
/psr/config.js
  Cache-Control: no-cache
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
HEADERS
echo "site built in $OUT"
