#!/bin/bash
# capture.sh — token-radar-01 screenshots via headless Chromium (CDP).
# Why CDP and not --screenshot: this build (Muse Browser 157) refuses to
# start without a Hatch WebGL domain policy, and its one-shot --screenshot /
# --dump-dom produce no output at all. A persistent headless instance with
# --remote-debugging-port works fine and Page.captureScreenshot via CDP is
# reliable. Policy file format (reverse-engineered from the binary's own
# error strings): first line "hatch-webgl-allowed-domains-v1", then strictly
# sorted registrable domains, one per line, file must end with a newline;
# the SHA-256 of the file (lowercase hex) is passed alongside.
# This script does NOT submit anything and never touches API keys/keypairs.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="${OUT_DIR:-$ROOT/out/dashboard}"
SHOTS_DIR="${SHOTS_DIR:-$ROOT/screenshots}"
POLICY_FILE="${POLICY_FILE:-/tmp/webgl-policy.txt}"
CHROME="${CHROME:-/opt/meta-chromium/chrome}"
PROFILE="${PROFILE:-/tmp/chrome-prof-shot}"
PORT="${CDP_PORT:-9222}"

mkdir -p "$SHOTS_DIR"

# 1. WebGL domain policy file (header only = no WebGL origins allowed;
#    the dashboard is static HTML/JS and needs no WebGL at all).
if [ ! -f "$POLICY_FILE" ]; then
  printf 'hatch-webgl-allowed-domains-v1\n' > "$POLICY_FILE"
fi
SHA="$(sha256sum "$POLICY_FILE" | cut -d' ' -f1)"

# 2. Start headless chrome with CDP if it is not already answering.
if ! curl -s -m 2 "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
  rm -rf "$PROFILE"
  nohup "$CHROME" --headless=new --disable-gpu --no-sandbox --disable-dev-shm-usage \
    --user-data-dir="$PROFILE" \
    --hatch-webgl-allowed-domains-file="$POLICY_FILE" \
    --hatch-webgl-allowed-domains-sha256="$SHA" \
    --remote-debugging-port="$PORT" --remote-debugging-address=127.0.0.1 \
    about:blank >/tmp/chrome-shot.log 2>&1 &
  for _ in $(seq 1 30); do
    curl -s -m 2 "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1 && break
    sleep 1
  done
  curl -s -m 2 "http://127.0.0.1:$PORT/json/version" >/dev/null || { echo "chrome did not start (see /tmp/chrome-shot.log)"; exit 1; }
fi

# 3. Resolve shot URLs. Defaults assume the final out/ dashboard with hash
#    routing; override with BOARD_URL / DETAIL_URL / FILTER_URL env vars.
BASE="file://$OUT_DIR/index.html"
BOARD_URL="${BOARD_URL:-$BASE}"
DETAIL_URL="${DETAIL_URL:-$BASE#/detail/steakhouse-financial}"
FILTER_URL="${FILTER_URL:-$BASE#/filter/Risk%20Curators}"

# 4. Shoot the three states.
node "$ROOT/cdp-shot.mjs" "$BOARD_URL"  "$SHOTS_DIR/1-board.png"   "${WAIT_MS:-2500}"
node "$ROOT/cdp-shot.mjs" "$DETAIL_URL" "$SHOTS_DIR/2-detail.png"  "${WAIT_MS:-2500}"
node "$ROOT/cdp-shot.mjs" "$FILTER_URL" "$SHOTS_DIR/3-filtered.png" "${WAIT_MS:-2500}"

# 5. Size optimisation + validation.
python3 "$ROOT/validate-shots.py" "$SHOTS_DIR"
