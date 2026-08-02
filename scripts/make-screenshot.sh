#!/usr/bin/env bash
# Capture the store screenshot from store/screenshot.html, which embeds the real popup.
#
#   bash scripts/make-screenshot.sh
#
# Rendered at 2x and downsampled to 1280x800: headless Chrome hints text for the device scale it
# is given, so capturing at 1x produces visibly softer type than the same page on screen.
# Downsampling a 2x render is what makes the text in the store listing look like text.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="$root/store/assets"
mkdir -p "$out"

chrome=""
for candidate in \
  "/c/Program Files/Google/Chrome/Application/chrome.exe" \
  "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" \
  "$(command -v google-chrome || true)" \
  "$(command -v chromium || true)"; do
  [ -n "$candidate" ] && [ -x "$candidate" ] && chrome="$candidate" && break
done

if [ -z "$chrome" ]; then
  echo "No Chrome/Chromium found; install one or capture store/screenshot.html by hand." >&2
  exit 1
fi

"$chrome" --headless --disable-gpu --hide-scrollbars --allow-file-access-from-files \
  --force-device-scale-factor=2 --window-size=1280,800 \
  --screenshot="$out/screenshot-2x.png" \
  "file://$(cygpath -m "$root" 2>/dev/null || echo "$root")/store/screenshot.html" >/dev/null 2>&1

# Downsample and drop the alpha channel — the stores reject a PNG that carries one.
python - "$out/screenshot-2x.png" "$out/screenshot-1280x800.png" <<'PY'
import sys
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
img = Image.open(src).convert("RGB").resize((1280, 800), Image.LANCZOS)
img.save(dst, "PNG", optimize=True)
print(f"{dst}  {img.size[0]}x{img.size[1]}  mode={img.mode}")
PY

rm -f "$out/screenshot-2x.png"
