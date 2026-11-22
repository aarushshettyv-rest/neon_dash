"""Generate the Discord presence 'icon' asset: neon ship on dark rounded square."""
from PIL import Image, ImageDraw, ImageFilter

S = 512
CYAN = (0, 229, 255)
CYAN_HI = (191, 246, 255)
WHITE = (255, 255, 255)
BG = (11, 11, 20)

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# Rounded-square background (same as icon.svg)
d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 14 / 64), fill=BG)

# Ship dart shape — scaled from game.js ship path:
# nose (PS/2, 0), fins (-PS/2, +/-PS/3), notch (-PS/3, 0), pointing right
cx, cy = S // 2, S // 2
ps = S * 0.56  # ship "size" in px
nose = (cx + ps / 2, cy)
top_fin = (cx - ps / 2, cy - ps / 3)
notch = (cx - ps / 3, cy)
bot_fin = (cx - ps / 2, cy + ps / 3)
ship = [nose, top_fin, notch, bot_fin]

# Glow layer
ship_layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
sd = ImageDraw.Draw(ship_layer)
sd.polygon(ship, fill=CYAN)
glow = ship_layer.filter(ImageFilter.GaussianBlur(S * 0.045))
img = Image.alpha_composite(img, glow)

# Ship body with vertical gradient (dark cyan -> bright cyan like the game)
body = Image.new("RGBA", (S, S), (0, 0, 0, 0))
bd = ImageDraw.Draw(body)
bd.polygon(ship, fill=CYAN)
# lighten right half for gradient feel
grad = Image.new("RGBA", (S, S), (0, 0, 0, 0))
gd = ImageDraw.Draw(grad)
gd.polygon(ship, fill=CYAN_HI)
grad.putalpha(grad.split()[3].point(lambda a: int(a * 0.45)))
body = Image.alpha_composite(body, grad)
img = Image.alpha_composite(img, body)

# White outline
d = ImageDraw.Draw(img)
d.line([nose, top_fin, notch, bot_fin, nose], fill=WHITE, width=int(S * 0.014), joint="curve")

# Engine flame flicker (behind tail notch)
flame = [(cx - ps / 2 - 6, cy), (cx - ps / 2 - int(ps * 0.22), cy - int(ps * 0.07)),
         (cx - ps / 2 - int(ps * 0.14), cy), (cx - ps / 2 - int(ps * 0.22), cy + int(ps * 0.07))]
d.polygon(flame, fill=(120, 240, 255, 220))

img.save("E:/GeometryDash/icon-ship-512.png")

# Smaller variant for good measure
img.resize((256, 256), Image.LANCZOS).save("E:/GeometryDash/icon-ship-256.png")
print("done")
