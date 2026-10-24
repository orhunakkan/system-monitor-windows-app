#!/usr/bin/env bash
# Launch the port maximized with a throw-away settings profile, let the graphs
# fill, and save a full-resolution PNG of its window (Linux/X11 only).
#
# Usage: tools/capture.sh out.png [seconds=64]
#
# The profile copies GNOME System Monitor's own cpu-colors when gsettings has
# them, so the capture is directly comparable with docs/reference/gsm-resources@2x.png.
# Needs xwininfo, xwd and python3 with Pillow.

set -euo pipefail
out=${1:?usage: tools/capture.sh out.png [seconds]}
wait_s=${2:-64}
root=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp" || true' EXIT

mkdir -p "$tmp/cfg/System Monitor"
colors=$(gsettings get org.gnome.gnome-system-monitor cpu-colors 2>/dev/null || true)
python3 -I - "$tmp/cfg/System Monitor/settings.json" "$colors" <<'EOF'
import json, re, sys
cols = re.findall(r"'(#[0-9a-f]+)'", sys.argv[2])
cfg = {'maximized': True}
if cols:
    cfg['cpu-colors'] = cols
json.dump(cfg, open(sys.argv[1], 'w'))
EOF

cd "$root"
# Run the Electron binary itself (not the node_modules/.bin wrapper) so kill reaches it.
electron=$(env -u ELECTRON_RUN_AS_NODE node -e "process.stdout.write(require('electron'))")
env -u ELECTRON_RUN_AS_NODE XDG_CONFIG_HOME="$tmp/cfg" "$electron" . >"$tmp/app.log" 2>&1 &
app=$!
cleanup() {
  kill "$app" 2>/dev/null || true
  wait "$app" 2>/dev/null || true
  rm -rf "$tmp" || true
}
trap cleanup EXIT

win=
for _ in $(seq 1 80); do
  win=$(xwininfo -root -tree | awk '/"System Monitor": \("system-monitor"/ {print $1; exit}')
  [ -n "$win" ] && break
  sleep 0.25
done
[ -n "$win" ] || { echo "window not found; log:"; cat "$tmp/app.log"; exit 1; }

sleep "$wait_s"
xwd -id "$win" -silent >"$tmp/shot.xwd"
python3 -I "$root/tools/xwd2png.py" "$tmp/shot.xwd" "$out"
