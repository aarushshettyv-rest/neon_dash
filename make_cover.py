"""Generate Discord activity cover image (1920x1080) for Neon Dash."""
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1920, 1080
BG = (11, 11, 20)
CYAN = (0, 229, 255)
CYAN_DIM = (0, 140, 180)
WHITE = (255, 255, 255)

img = Image.new("RGBA", (W, H), BG + (255,))
d = ImageDraw.Draw(img)

# Perspective grid floor — subtle neon perspective lines
horizon = int(H * 0.62)
for i in range(-14, 15):
    x_top = W // 2 + i * 46
    x_bot = W // 2 + i * 150
    d.line([(x_top, horizon), (x_bot, H)], fill=(0, 60, 90, 60), width=2)
for j in range(1, 9):
    y = horizon + (H - horizon) * (j / 9) ** 1.7
    d.line([(0, y), (W, y)], fill=(0, 60, 90, 60), width=2)

# Glow blobs
for cx, cy, r, col in [(W * 0.22, H * 0.45, 300, (0, 229, 255, 26)),
                       (W * 0.8, H * 0.6, 380, (120, 60, 255, 22)),
                       (W * 0.6, H * 0.2, 260, (0, 255, 200, 18))]:
    g = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(g)
    gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col)
    g = g.filter(ImageFilter.GaussianBlur(r * 0.6))
    img = Image.alpha_composite(img, g)

# Big neon cube outline (left of center)
qs = 300
qx, qy = int(W * 0.30), int(H * 0.52)
qw = qs
cube = Image.new("RGBA", (W, H), (0, 0, 0, 0))
cd = ImageDraw.Draw(cube)
cd.rounded_rectangle([qx, qy, qx + qw, qy + qw], radius=36, outline=CYAN, width=14)
cd.rounded_rectangle([qx + 44, qy + 44, qx + qw - 44, qy + qw - 44], radius=18,
                     outline=CYAN_DIM, width=6)
# inner face highlight
cd.rectangle([qx + 70, qy + 70, qx + qw * 0.55, qy + qw * 0.55], outline=WHITE, width=5)
cube = cube.filter(ImageFilter.GaussianBlur(10))
img = Image.alpha_composite(img, cube)
# crisp cube on top
cd2 = ImageDraw.Draw(img)
cd2.rounded_rectangle([qx, qy, qx + qw, qy + qw], radius=36, outline=CYAN, width=8)
cd2.rounded_rectangle([qx + 44, qy + 44, qx + qw - 44, qy + qw - 44], radius=18,
                      outline=(140, 250, 255), width=4)
cd2.rectangle([qx + 70, qy + 70, qx + qw * 0.55, qy + qw * 0.55], outline=WHITE, width=4)

# Title text
def font(size, bold=True):
    for name in (["segoeuib.ttf", "arialbd.ttf"] if bold else ["segoeui.ttf", "arial.ttf"]):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()

title = "NEON DASH"
tf = font(150)
tb = d.textbbox((0, 0), title, font=tf)
tw, th = tb[2] - tb[0], tb[3] - tb[1]
tx, ty = int(W * 0.52), int(H * 0.36)
# glow pass
for blur, alpha in [(18, 90), (8, 160)]:
    t = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    td = ImageDraw.Draw(t)
    td.text((tx - tb[0], ty - tb[1]), title, font=tf, fill=CYAN + (alpha,))
    t = t.filter(ImageFilter.GaussianBlur(blur))
    img = Image.alpha_composite(img, t)
d.text((tx - tb[0], ty - tb[1]), title, font=tf, fill=WHITE)

sub = "a neon rhythm platformer"
sf = font(52, bold=False)
sb = d.textbbox((0, 0), sub, font=sf)
sw = sb[2] - sb[0]
d.text((W // 2 - sw // 2 - sb[0], ty + th + 60), sub, font=sf, fill=(150, 220, 240))

img.convert("RGB").save("E:/GeometryDash/cover-1920x1080.png", quality=92)
print("done")
