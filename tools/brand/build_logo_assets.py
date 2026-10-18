#!/usr/bin/env python3
"""Build Hopewick icon and logo files from the founder-approved artwork.

Usage: python tools/brand/build_logo_assets.py [path/to/variant-F-mockup-navy.png]
Needs: pip install pillow numpy scipy

Source (Hopewick 2.0, approved by the founder 18 Oct 2026): variant F
"mockup navy", a pixel recolour of the founder's hands artwork (navy hands,
light-blue river, gold sunrise, all-navy wordmark, no red). A copy is kept at
brand/source/hopewick-logo-source.png and is the default input.

No redesign: the icon mark is the heart + hands + sunrise + river cut out of
the artwork (the wordmark and taglines are excluded), resized only.
The dark-mode lockup is the same artwork with only the wordmark and tagline
text pixels recoloured to near-white (masks); gold divider and separators stay gold.
Writes app/icon-*.png, app/icon-maskable-*.png, favicon.ico, og-image.png,
apple-touch-icon.png and brand/*.png in this repo.
"""
import math, os, sys, tempfile, shutil
from PIL import Image
import numpy as np
from scipy import ndimage

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(REPO, 'brand', 'source', 'hopewick-logo-source.png')
WORK = tempfile.mkdtemp(prefix='hopewick-logo-')

src = Image.open(SRC).convert('RGBA')
a = np.array(src)
alpha = a[...,3]; rgb = a[...,:3].astype(int)
solid = (alpha>20) & (rgb.min(axis=2) < 235)
lab, n = ndimage.label(solid)
sizes = ndimage.sum(solid, lab, range(1, n+1))
heart = int(np.argmax(sizes)) + 1
heart_mask = lab == heart
objs = ndimage.find_objects(lab)
word_ids = [i+1 for i,o in enumerate(objs) if o is not None and i+1 != heart and o[0].start >= 560]
others = np.isin(lab, word_ids)
# grow the heart region to keep its soft glow; keep away from other parts (wordmark, i-dot)
grow = ndimage.binary_dilation(heart_mask, iterations=18)
keep_out = ndimage.binary_dilation(others, iterations=6)
region = grow & ~keep_out
# also never take anything below the bottom of the heart tip
ys = np.where(heart_mask.any(axis=1))[0]
print('heart rows', ys.min(), ys.max())
mark = a.copy()
mark[~region] = 0
# feather the cut edge slightly
m = Image.fromarray(mark)
bbox = Image.fromarray((mark[...,3] > 6).astype(np.uint8)*255).getbbox()
print('mark bbox', bbox)
m = m.crop(bbox)
m.save(os.path.join(WORK, 'mark-master.png'))
# lockup: whole artwork, cropped to content
lb = Image.fromarray((alpha > 6).astype(np.uint8)*255).getbbox()
print('lockup bbox', lb)
src.crop(lb).save(os.path.join(WORK, 'lockup-master.png'))

# Dark-mode lockup: recolour only the text (wordmark, tagline, bottom line) to
# near-white. Text = the non-heart components below the heart; gold pixels
# (divider line, | separators) are left untouched.
NEAR_WHITE = np.array([244, 247, 251])
text_zone = ndimage.binary_dilation(others, iterations=2) & ~region
r_, g_, b_ = rgb[..., 0], rgb[..., 1], rgb[..., 2]
goldish = (r_ > b_ + 40) & (r_ > 120)          # warm divider / separators
text_px = text_zone & ~goldish & (alpha > 0)
dark = a.copy()
dark[..., :3][text_px] = NEAR_WHITE
print('dark lockup recoloured px', int(text_px.sum()), 'gold kept px', int((text_zone & goldish & (alpha > 0)).sum()))
Image.fromarray(dark).crop(lb).save(os.path.join(WORK, 'lockup-dark-master.png'))
# check what heart_mask x extent at the i-dot rows looks like
print('heart x range', np.where(heart_mask.any(axis=0))[0][[0,-1]])

# Fill pin-holes the background removal punched inside the mark (white
# highlights on the original white canvas) so the transparent icon reads the
# same as the artwork on white.
mk = np.array(Image.open(os.path.join(WORK, 'mark-master.png')))
solid_m = mk[...,3] > 20
filled = ndimage.binary_fill_holes(solid_m)
holes = filled & ~solid_m
print('filled holes px', int(holes.sum()))
for c in range(3):
    ch = mk[...,c].astype(float); al = mk[...,3].astype(float)/255
    ch[holes] = ch[holes]*al[holes] + 255*(1-al[holes])
    mk[...,c] = ch.astype(np.uint8)
mk[...,3][holes] = 255
Image.fromarray(mk).save(os.path.join(WORK, 'mark-master.png'))

mark = Image.open(os.path.join(WORK, 'mark-master.png')).convert('RGBA')
lock = Image.open(os.path.join(WORK, 'lockup-master.png')).convert('RGBA')
lock_dark = Image.open(os.path.join(WORK, 'lockup-dark-master.png')).convert('RGBA')
WHITE = (255, 255, 255, 255)

def fit(img, box_w, box_h):
    s = min(box_w / img.width, box_h / img.height)
    return img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)

def square(size, margin_frac, bg=None, img=mark):
    inner = size * (1 - 2 * margin_frac)
    m = fit(img, inner, inner)
    canvas = Image.new('RGBA', (size, size), bg or (0, 0, 0, 0))
    canvas.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    return canvas

def small(size):
    # Tiny sizes: downscale in steps from a 4x master for cleaner detail.
    big = square(size * 8, 0.02)
    return big.resize((size, size), Image.LANCZOS)

def maskable(size):
    # Safe zone = centred circle with radius 40% of the icon. Fit the mark's
    # bounding box diagonal inside 76% of the size.
    d = size * 0.76
    diag = math.hypot(mark.width, mark.height)
    s = d / diag
    m = mark.resize((round(mark.width * s), round(mark.height * s)), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), WHITE)
    canvas.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    return canvas.convert('RGB')

out = {}
out['app/icon-512.png'] = square(512, 0.06)
out['app/icon-192.png'] = square(192, 0.06)
out['app/icon-180.png'] = square(180, 0.08, WHITE).convert('RGB')  # Apple: opaque
out['app/icon-32.png'] = small(32)
out['app/icon-16.png'] = small(16)
out['app/icon-maskable-512.png'] = maskable(512)
out['app/icon-maskable-192.png'] = maskable(192)
out['brand/hopewick-mark.png'] = mark  # full-resolution icon mark
out['brand/hopewick-lockup.png'] = lock  # full lockup, transparent
out['brand/hopewick-lockup-600.png'] = fit(lock, 600, 600)
out['brand/hopewick-lockup-dark.png'] = lock_dark  # same artwork, text near-white, for dark theme
out['brand/hopewick-lockup-dark-600.png'] = fit(lock_dark, 600, 600)
# og-image: lockup centred on white, 1200x630
og = Image.new('RGBA', (1200, 630), WHITE)
l = fit(lock, 1100, 580)
og.alpha_composite(l, ((1200 - l.width) // 2, (630 - l.height) // 2))
out['og-image.png'] = og.convert('RGB')

for rel, img in out.items():
    p = os.path.join(REPO, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    img.save(p, optimize=True)
    print(rel, img.size, img.mode, os.path.getsize(p))

# favicon.ico with 16, 32, 48
ico_src = square(256, 0.02)
ico_src.save(os.path.join(REPO, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)])
print('favicon.ico', os.path.getsize(os.path.join(REPO, 'favicon.ico')))

# Header-sized mark (trimmed, not square) for the site and app headers.
for w in (96,):
    hm = fit(mark, w, w)
    p = os.path.join(REPO, f'brand/hopewick-mark-{w}.png')
    hm.save(p, optimize=True)
    print(p, hm.size, os.path.getsize(p))

shutil.copyfile(os.path.join(REPO, 'app', 'icon-180.png'), os.path.join(REPO, 'apple-touch-icon.png'))
shutil.rmtree(WORK, ignore_errors=True)
