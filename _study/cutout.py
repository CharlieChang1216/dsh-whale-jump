"""Cut the chibi whale girl out of the white-background JPEG.

Strategy: flood-fill the white background from the borders (so white areas
*inside* the character — the apron, the ruffle — are preserved), then
alpha-feather the 1px contour so the sprite doesn't get a white halo.
"""
import os
import sys
from collections import deque

from PIL import Image, ImageFilter

# 路径相对脚本定位，仓库换个位置也能跑
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "docs", "miniwhale-source.jpg")
OUT = os.path.join(HERE, "miniwhale-cut.png")

im = Image.open(SRC).convert("RGB")
w, h = im.size
px = im.load()

# --- 1. flood fill background from every border pixel -----------------------
# A pixel counts as background if it is near-white (JPEG ringing keeps it
# around 250..255) and reachable from the border without crossing the art.
THRESH = 236
alpha = Image.new("L", (w, h), 255)
ap = alpha.load()

seen = bytearray(w * h)
q = deque()
for x in range(w):
    q.append((x, 0))
    q.append((x, h - 1))
for y in range(h):
    q.append((0, y))
    q.append((w - 1, y))

while q:
    x, y = q.popleft()
    if x < 0 or y < 0 or x >= w or y >= h:
        continue
    i = y * w + x
    if seen[i]:
        continue
    r, g, b = px[x, y]
    if min(r, g, b) < THRESH:
        continue
    seen[i] = 1
    ap[x, y] = 0
    q.append((x + 1, y))
    q.append((x - 1, y))
    q.append((x, y + 1))
    q.append((x, y - 1))

# --- 2. soften the contour --------------------------------------------------
# Blur then push contrast back so only the boundary band becomes translucent;
# this kills the white fringe while keeping the silhouette crisp.
alpha = alpha.filter(ImageFilter.GaussianBlur(1.1))
alpha = alpha.point(lambda v: 0 if v < 90 else (255 if v > 205 else int((v - 90) * 255 / 115)))

out = im.convert("RGBA")
out.putalpha(alpha)
out = out.crop(out.getbbox())

out.save(OUT)
print("saved", OUT, out.size)

# --- 3. report so the result can be judged --------------------------------
bbox = Image.open(OUT).getbbox()
print("bbox after crop:", bbox)
hist = Image.open(OUT).getchannel("A").histogram()
opaque = sum(hist[250:])
transparent = sum(hist[:6])
print(f"opaque px {opaque}  transparent px {transparent}  total {w*h}  cover {opaque/(w*h):.1%}")

# corner check: corners of the cut sprite must be transparent
sp = Image.open(OUT).load()
sw, sh = Image.open(OUT).size
print("corners alpha:",
      [sp[x, y][3] for x, y in [(0, 0), (sw - 1, 0), (0, sh - 1), (sw - 1, sh - 1)]])

# preview on a dark backdrop, so any leftover white halo is obvious
prev = Image.open(OUT)
for name, bg in (("dark", (24, 26, 38, 255)), ("light", (247, 247, 247, 255))):
    canvas = Image.new("RGBA", prev.size, bg)
    canvas.alpha_composite(prev)
    canvas.convert("RGB").save(os.path.join(HERE, f"preview-{name}.png"))
print("previews written")
