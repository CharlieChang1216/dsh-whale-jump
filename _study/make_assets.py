"""Build the game-ready whale-girl sprite from the uploaded artwork.

Outputs (into the plugin's assets dir):
  whale-hero.png     base sprite, tightly cropped, transparent
  whale-icon.png     256x256 square icon for the DSH plugin list

只出一张立绘：canvas 在 HiDPI 下由 `resize()` 按 devicePixelRatio 放大画布，
再用 `drawImage` 把这张图缩放上去，不需要单独的 @2x 文件。

The artwork is a single front-facing chibi pose, so the game animates it
procedurally (bob / squash / tilt) rather than swapping frames.
"""
import os

from PIL import Image, ImageFilter

# 路径相对脚本定位，仓库换个位置也能跑
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "docs", "miniwhale-source.jpg")
OUT_DIR = os.path.join(ROOT, "assets")
os.makedirs(OUT_DIR, exist_ok=True)


def cut_white_background(im: Image.Image, thresh: int = 236) -> Image.Image:
    """Flood-fill near-white from the borders so interior whites survive."""
    rgb = im.convert("RGB")
    w, h = rgb.size
    px = rgb.load()

    alpha = Image.new("L", (w, h), 255)
    ap = alpha.load()

    from collections import deque

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
        if min(r, g, b) < thresh:
            continue
        seen[i] = 1
        ap[x, y] = 0
        q.append((x + 1, y))
        q.append((x - 1, y))
        q.append((x, y + 1))
        q.append((x, y - 1))

    alpha = alpha.filter(ImageFilter.GaussianBlur(1.0))
    alpha = alpha.point(lambda v: 0 if v < 96 else (255 if v > 200 else int((v - 96) * 255 / 104)))

    out = rgb.convert("RGBA")
    out.putalpha(alpha)
    return out.crop(out.getbbox())


src = Image.open(SRC)
base = cut_white_background(src)
print("cut size:", base.size)

# --- base sprite: cap the long edge at 320px so the bundle stays small ------
LONG_EDGE = 320
scale = LONG_EDGE / max(base.size)
w = max(1, round(base.size[0] * scale))
h = max(1, round(base.size[1] * scale))
hero = base.resize((w, h), Image.LANCZOS)

# Trim the transparent margin again after resampling (LANCZOS can grow it 1px).
hero = hero.crop(hero.getbbox())
hero.save(os.path.join(OUT_DIR, "whale-hero.png"), optimize=True)
print("whale-hero.png", hero.size, os.path.getsize(os.path.join(OUT_DIR, "whale-hero.png")), "bytes")

# --- plugin icon: head-and-shoulder close-up -------------------------------
# 插件列表里的图标只有几十像素，全身图缩进去后脸会糊成一团。所以裁成头肩特写：
# 取原图高度 4% 起、64% 高的一块正方形，保留头饰、蝴蝶结与领结，不切下巴。
# 这两个比例是比出来的：0.02/0.58 会切掉头饰，0.00/0.68 脸又偏小。
ICON = 256
ICON_TOP = 0.04
ICON_SIZE = 0.64
src_w, src_h = base.size
side = int(src_h * ICON_SIZE)
top = int(src_h * ICON_TOP)
left = max(0, min(src_w - side, src_w // 2 - side // 2))
icon = base.crop((left, top, left + side, top + side)).resize((ICON, ICON), Image.LANCZOS)
icon.save(os.path.join(OUT_DIR, "whale-icon.png"), optimize=True)
print("whale-icon.png", icon.size, os.path.getsize(os.path.join(OUT_DIR, "whale-icon.png")), "bytes")

# --- previews for the human check ----------------------------------------
for name, bg in (("dark", (18, 32, 51, 255)), ("sea", (231, 245, 251, 255))):
    canvas = Image.new("RGBA", (hero.width + 40, hero.height + 40), bg)
    canvas.alpha_composite(hero, (20, 20))
    canvas.convert("RGB").save(os.path.join(HERE, f"hero-{name}.png"))
print("previews written")
