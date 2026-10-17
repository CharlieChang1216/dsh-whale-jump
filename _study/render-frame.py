"""Replay the recorded canvas ops with Pillow so the frame can be eyeballed."""
import json
import os

from PIL import Image, ImageDraw, ImageFont, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
SPEC = json.load(open(os.path.join(HERE, "frame.json"), encoding="utf-8"))
W, H = SPEC["W"], SPEC["H"]
ops = SPEC["ops"]

# supersample for readable output
S = 2
img = Image.new("RGBA", (int(W * S), int(H * S)), (255, 255, 255, 255))
draw = ImageDraw.Draw(img, "RGBA")

stack = []
transform = [1, 0, 0, 1, 0, 0]  # a,b,c,d,e,f
path_pts = []
cur_ellipse = None
cur_round = None
clip_poly = None


def parse_color(c, alpha=1.0):
    if isinstance(c, dict) and c.get("grad"):
        stops = c.get("stops") or []
        if not stops:
            return (200, 220, 235, 255)
        return parse_color(stops[0][1], alpha)
    if not isinstance(c, str):
        return (128, 128, 128, 255)
    s = c.strip()
    if s.startswith("#"):
        s = s[1:]
        if len(s) == 3:
            s = "".join(ch * 2 for ch in s)
        try:
            r, g, b = int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)
            return (r, g, b, int(255 * alpha))
        except Exception:
            return (128, 128, 128, 255)
    if s.startswith("rgba(") or s.startswith("rgb("):
        inner = s[s.index("(") + 1 : s.rindex(")")]
        parts = [p.strip() for p in inner.split(",")]
        try:
            r, g, b = (int(float(p)) for p in parts[:3])
            a = float(parts[3]) if len(parts) > 3 else 1.0
            return (r, g, b, max(0, min(255, int(255 * a * alpha))))
        except Exception:
            return (128, 128, 128, 255)
    return (128, 128, 128, 255)


def gradient_image(coords, stops, box):
    """Approximate a linear gradient with horizontal/vertical stripes."""
    x0, y0, x1, y1 = coords
    vertical = abs(y1 - y0) >= abs(x1 - x0)
    length = max(1, int(abs(y1 - y0) if vertical else abs(x1 - x0)))
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    parsed = sorted(((float(o), parse_color(c)) for o, c in stops), key=lambda t: t[0])
    if not parsed:
        return None

    def color_at(t):
        if t <= parsed[0][0]:
            return parsed[0][1]
        if t >= parsed[-1][0]:
            return parsed[-1][1]
        for i in range(len(parsed) - 1):
            o0, c0 = parsed[i]
            o1, c1 = parsed[i + 1]
            if o0 <= t <= o1:
                f = 0 if o1 == o0 else (t - o0) / (o1 - o0)
                return tuple(int(c0[k] + (c1[k] - c0[k]) * f) for k in range(4))
        return parsed[-1][1]

    x_start, y_start = int(x0 * S), int(y0 * S)
    for i in range(length * S):
        t = i / max(1, length * S - 1)
        col = color_at(t)
        if vertical:
            ld.line([(x_start, y_start + i), (x_start + int((box[2] - box[0]) * S), y_start + i)], fill=col)
        else:
            ld.line([(x_start + i, y_start), (x_start + i, y_start + int((box[3] - box[1]) * S))], fill=col)
    return layer


def composite(shape_fn, col, clip=None):
    """把任意形状按 col(含 alpha) 合成到 img 上；clip 为可选的裁剪多边形。

    统一走「临时层 + alpha_composite」，避免 ImageDraw 直接覆盖导致半透明失效。
    """
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    shape_fn(ImageDraw.Draw(layer), col)
    if clip:
        m = Image.new("L", img.size, 0)
        ImageDraw.Draw(m).polygon(clip, fill=255)
        layer.putalpha(ImageChops.multiply(layer.getchannel("A"), m))
    img.alpha_composite(layer)


def tf(x, y):
    a, b, c, d, e, f = transform
    return (x * a + y * c + e) * S, (x * b + y * d + f) * S


def path_points(pts):
    """把录制下来的路径点展开成多边形顶点；二次贝塞尔按 12 段采样。"""
    if not pts:
        return []
    out = []
    for p in pts:
        if p[0] == "q":
            _, cx, cy, x, y = p
            if not out:
                continue
            lx, ly = out[-1]
            ccx, ccy = tf(cx, cy)
            tx, ty = tf(x, y)
            for i in range(1, 13):
                t = i / 12
                bx = (1 - t) ** 2 * lx + 2 * (1 - t) * t * ccx + t**2 * tx
                by = (1 - t) ** 2 * ly + 2 * (1 - t) * t * ccy + t**2 * ty
                out.append((bx, by))
        else:
            out.append(tf(p[1], p[2]))
    return out


def css_font(font, scale=S):
    """Crude '15px ui-monospace' -> PIL font size."""
    size = 14
    try:
        for tok in font.split():
            if tok.endswith("px"):
                size = float(tok[:-2])
                break
    except Exception:
        pass
    for candidate in (
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\arial.ttf",
    ):
        try:
            return ImageFont.truetype(candidate, int(size * scale))
        except Exception:
            continue
    return ImageFont.load_default()


fill_style = "#000000"
stroke_style = "#000000"
line_w = 1
alpha = 1.0
font_css = "10px sans-serif"
text_align = "left"

for o in ops:
    op = o["op"]
    if op == "save":
        stack.append((list(transform), fill_style, stroke_style, line_w, alpha, font_css, text_align, clip_poly))
    elif op == "restore":
        if stack:
            transform, fill_style, stroke_style, line_w, alpha, font_css, text_align, clip_poly = stack.pop()
    elif op == "setTransform":
        t = o["transform"]
        transform = [t["a"], t["b"], t["c"], t["d"], t["e"], t["f"]]
    elif op == "translate":
        transform[4] += o["x"] * transform[0]
        transform[5] += o["y"] * transform[3]
    elif op == "rotate":
        import math

        a = o["a"]
        ca, sa = math.cos(a), math.sin(a)
        a0, b0, c0, d0, e0, f0 = transform
        transform = [
            a0 * ca + c0 * sa,
            b0 * ca + d0 * sa,
            -a0 * sa + c0 * ca,
            -b0 * sa + d0 * ca,
            e0,
            f0,
        ]
    elif op == "scale":
        transform[0] *= o["x"]
        transform[3] *= o["y"]
    elif op == "clip":
        # 近似：把当前 path 的多边形存成裁剪区域，后续 fillRect 只画在它内部。
        poly = [p[1] for p in path_pts if p[0] in ("m", "l")]
        clip_poly = poly if len(poly) > 2 else None
    elif op == "clear":
        draw.rectangle([0, 0, img.width, img.height], fill=(255, 255, 255, 255))
    elif op == "fillRect":
        fill_style = o["fill"]
        box = [tf(o["x"], o["y"])[0], tf(o["x"], o["y"])[1], tf(o["x"] + o["w"], o["y"] + o["h"])[0], tf(o["x"] + o["w"], o["y"] + o["h"])[1]]
        if isinstance(fill_style, dict) and fill_style.get("grad"):
            layer = gradient_image(fill_style["coords"], fill_style["stops"], (o["x"], o["y"], o["x"] + o["w"], o["y"] + o["h"]))
            if layer is not None:
                mask = Image.new("L", img.size, 0)
                ImageDraw.Draw(mask).rectangle(box, fill=255)
                layer.putalpha(ImageChops.multiply(layer.getchannel("A"), mask))
                img.alpha_composite(layer)
        else:
            col = parse_color(fill_style)
            composite(lambda d, c: d.rectangle(box, fill=c), col, clip_poly)
    elif op == "beginPath":
        path_pts = []
    elif op == "moveTo":
        path_pts.append(("m", tf(o["x"], o["y"])))
    elif op == "lineTo":
        path_pts.append(("l", tf(o["x"], o["y"])))
    elif op == "quad":
        if path_pts:
            last = path_pts[-1][1]
            pts = []
            for i in range(1, 13):
                t = i / 12
                x = (1 - t) ** 2 * last[0] + 2 * (1 - t) * t * tf(o["cx"], o["cy"])[0] + t**2 * tf(o["x"], o["y"])[0]
                y = (1 - t) ** 2 * last[1] + 2 * (1 - t) * t * tf(o["cx"], o["cy"])[1] + t**2 * tf(o["x"], o["y"])[1]
                pts.append(("l", (x, y)))
            path_pts.extend(pts)
    elif op == "arc":
        draw.ellipse(
            [tf(o["x"], o["y"])[0] - o["r"] * S, tf(o["x"], o["y"])[1] - o["r"] * S,
             tf(o["x"], o["y"])[0] + o["r"] * S, tf(o["x"], o["y"])[1] + o["r"] * S],
            fill=parse_color(fill_style, alpha),
        )
    elif op == "ellipse":
        cx, cy = tf(o["x"], o["y"])
        draw.ellipse(
            [cx - o["rx"] * S, cy - o["ry"] * S, cx + o["rx"] * S, cy + o["ry"] * S],
            fill=parse_color(o.get("fill", fill_style), o.get("alpha", alpha)),
        )
    elif op == "roundRect":
        cur_round = (tf(o["x"], o["y"]), o["w"] * S, o["h"] * S, o.get("r", 0) * S)
        (x, y), w, h, r = cur_round
        # 记录里带着当时的 fill，必须用它而不是闭包里的旧值：
        # 同一帧里轨道和填充是两个不同颜色的 roundRect，用旧值会把两者画成同色。
        draw.rounded_rectangle(
            [x, y, x + w, y + h],
            radius=max(0, r),
            fill=parse_color(o.get("fill", fill_style), o.get("alpha", alpha)),
        )
    elif op == "fill":
        fill_style = o["fill"]
        alpha_o = o.get("alpha", 1.0)
        col = parse_color(fill_style, alpha_o)
        lines = path_points(o.get("pts"))
        if len(lines) > 2:
            composite(lambda d, c: d.polygon(lines, fill=c), col, clip_poly)
    elif op == "stroke":
        stroke_style = o["stroke"]
        line_w = o.get("lw", 1)
        col = parse_color(stroke_style, o.get("alpha", 1.0))
        lines = path_points(o.get("pts"))
        if len(lines) > 1:
            draw.line(lines, fill=col, width=max(1, int(line_w * S)), joint="curve")
    elif op == "text":
        fill_style = o["fill"]
        f = css_font(o.get("font", font_css))
        tx, ty = tf(o["x"], o["y"])
        align = o.get("align", "left")
        try:
            bbox = draw.textbbox((0, 0), o["t"], font=f)
            tw = bbox[2] - bbox[0]
            th = bbox[3] - bbox[1]
        except Exception:
            tw = th = 10
        if align == "right":
            tx -= tw
        elif align == "center":
            tx -= tw / 2
        baseline = o.get("baseline", "alphabetic")
        if baseline == "top":
            pass
        elif baseline == "middle":
            ty -= th / 2
        draw.text((tx, ty), o["t"], font=f, fill=parse_color(fill_style, o.get("alpha", 1.0)))

# paste the character sprite where drawImage was called
if os.path.exists(os.path.join(HERE, "hero-dark.png")):
    pass

sprite_path = os.path.join(os.path.dirname(HERE), "assets", "whale-hero.png")
image_ops = [o for o in ops if o["op"] == "image"]
if image_ops and os.path.exists(sprite_path):
    sprite = Image.open(sprite_path).convert("RGBA")
    for o in image_ops:
        dw, dh = o["dw"] * S, o["dh"] * S
        s2 = sprite.resize((int(dw), int(dh)), Image.LANCZOS)
        x, y = tf(o["dx"], o["dy"])
        img.paste(s2, (int(x), int(y)), s2)

out = os.path.join(HERE, "frame-preview.png")
img.convert("RGB").save(out)
print("wrote", out, img.size)
