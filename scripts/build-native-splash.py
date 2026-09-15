"""Build the native launch images for the iOS and Android shells.

Re-run after editing this file:

    python3 scripts/build-native-splash.py

Writes 19 files in place, over three separate launch surfaces:

  1. `ios/.../Splash.imageset/*` (3 files) — the whole iOS launch image,
     shown through LaunchScreen.storyboard with `scaleAspectFill`.
  2. `android/.../drawable{,-port,-land}-*/splash.png` (11 files) — the
     legacy Capacitor full-screen drawable.
  3. `android/.../drawable-*dpi/splash_icon.png` (5 files) — the *icon* for
     androidx core-splashscreen, which is what Android actually draws. It
     feeds `windowSplashScreenAnimatedIcon` in `values/styles.xml`, which the
     library turns into the compat window background below API 31 and maps
     onto the platform's system splash screen from API 31 up.

Surfaces 1 and 2 are full-screen compositions; surface 3 is an icon on the
system's own geometry, so it does NOT share their proportions — see
SPLASH_ICON_* below.

Pixel sizes for surfaces 1 and 2 are fixed by the Capacitor template and are
NOT derived from anything here; the script only repaints them.

Source artwork is the warm-lamp app icon,
`ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` — the
highest-resolution copy of the mark in the repo (1024x1024, #899/#904).

Composition (see #1238):
  - ground: #FBEDE0, the same value as `capacitor.config.ts`
    `android.backgroundColor`, `--bg`, and the PWA manifest's
    `background_color`, so the hand-off from launch image to WebView does not
    flash a different colour;
  - the icon square, re-grounded onto #FBEDE0, centred, one scale, no
    separate portrait / landscape artwork.

The two size factors below differ only because the platforms scale the bitmap
differently. Both target the same on-screen result: the orbit ring reads at
roughly a third of the screen's shorter edge on a modern phone. Deriving one
factor from the other is not possible — see the comments on each.
"""

import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageMath

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MASTER = 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'

TARGET_BG = (251, 237, 224)     # #FBEDE0
FLOOD_MARK = (255, 0, 255)      # sentinel colour, absent from the artwork
FLOOD_THRESH = 14               # per-step tolerance of the background flood
MASK_FEATHER = 3                # taper width of the re-grounding, master px
BG_BLUR = 32                    # radius of the local background estimate, master px

# Android paints the drawable as the launch window's background, which is
# stretched to fill the window. So a fraction of the image maps 1:1 onto the
# same fraction of the screen, and 0.46 x 0.71 (the orbit ring's share of the
# icon square) lands the ring on ~1/3 of the screen's shorter edge.
ANDROID_FACTOR = 0.46

# iOS shows the square asset through LaunchScreen.storyboard with
# `scaleAspectFill`, so a 19.5:9 phone crops away everything outside the
# centre ~46% of the square's width and magnifies what is left by H/2732.
# 0.22 is 0.46 divided back through that magnification.
IOS_FACTOR = 0.22

ANDROID = [
    ('android/app/src/main/res/drawable/splash.png', 480, 320),
    ('android/app/src/main/res/drawable-port-mdpi/splash.png', 320, 480),
    ('android/app/src/main/res/drawable-port-hdpi/splash.png', 480, 800),
    ('android/app/src/main/res/drawable-port-xhdpi/splash.png', 720, 1280),
    ('android/app/src/main/res/drawable-port-xxhdpi/splash.png', 960, 1600),
    ('android/app/src/main/res/drawable-port-xxxhdpi/splash.png', 1280, 1920),
    ('android/app/src/main/res/drawable-land-mdpi/splash.png', 480, 320),
    ('android/app/src/main/res/drawable-land-hdpi/splash.png', 800, 480),
    ('android/app/src/main/res/drawable-land-xhdpi/splash.png', 1280, 720),
    ('android/app/src/main/res/drawable-land-xxhdpi/splash.png', 1600, 960),
    ('android/app/src/main/res/drawable-land-xxxhdpi/splash.png', 1920, 1280),
]

IOS = [
    ('ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png', 2732, 2732),
    ('ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png', 2732, 2732),
    ('ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png', 2732, 2732),
]

# --- system splash icon (androidx core-splashscreen + Android 12 system splash) ---
#
# This surface has its own geometry and the full-screen ratio above does not
# apply. Both paths agree on it, so one asset serves both:
#   - core-splashscreen `drawable-v23/compat_splash_screen_no_icon_background`
#     draws the icon in a 288dp box, then strokes a 410dp oval with a 109dp
#     border in the background colour — leaving a 192dp hole;
#   - the Android 12+ system splash uses the same 288dp canvas / 192dp visible
#     circle for an icon with no icon-background colour.
# So the artwork has to fit a centred circle of 2/3 the canvas.
SPLASH_ICON_CANVAS_DP = 288
# The mark (orbit ring, sun, moon) spans 0.781 of the master square's width,
# measured as the bounding circle of the background mask. 230dp x 0.781 =
# 180dp, which sits inside the 192dp circle with ~6dp of clearance each side.
SPLASH_ICON_MASTER_DP = 230
# The icon is painted on an opaque #FBEDE0 ground rather than a transparent
# one, on purpose: it is the same colour as `windowSplashScreenBackground`, so
# it is invisible whether or not the platform actually applies the circular
# mask, and it avoids alpha fringing on the soft lamp glow. The coupling is
# the catch — change `windowSplashScreenBackground` in values/styles.xml
# without re-running this script and a cream square (or disc) appears behind
# the mark. Nothing fails; it just looks wrong on a cold start.
SPLASH_ICON_DENSITIES = [
    ('mdpi', 1.0),
    ('hdpi', 1.5),
    ('xhdpi', 2.0),
    ('xxhdpi', 3.0),
    ('xxxhdpi', 4.0),
]


def background_mask(im):
    """255 where the pixel is the icon's flat paper ground, 0 on the artwork.

    A colour-distance mask does not work here: the lantern's glow is a warm
    near-white sitting only ~4/255 away from the paper cream, so it gets
    classified as background and re-grounded along with it. The symptom is
    not an error — the splash renders fine and the lamp simply stops glowing
    warm, turning a flat grey-cream. Flooding inward from the four corners
    keys on adjacency instead of absolute colour, which separates the two.
    """
    work = im.copy()
    w, h = work.size
    for seed in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        ImageDraw.floodfill(work, seed, FLOOD_MARK, thresh=FLOOD_THRESH)
    marked = Image.new('RGB', work.size, FLOOD_MARK)
    mask = (ImageChops.difference(work, marked)
            .convert('L')
            .point(lambda p: 255 if p < 2 else 0))
    # Morphological closing: the flood stops one pixel short of the master's
    # squircle outline, and that unfilled hairline would survive as a faint
    # 1px ring in the finished splash. Closing fills it without growing the
    # mask over the real artwork edges.
    return mask.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))


def regrounded_master(path):
    """Move the icon square off its own cream (#FCE5C9) and onto #FBEDE0.

    A single constant offset is not enough: the master's corner fill and its
    squircle interior are ~3.5/255 apart in blue, so a flat shift lands one of
    them off-target and leaves a faint rounded-rectangle seam once the square
    sits on a flat #FBEDE0 field. Every pixel is corrected against a *local*
    background estimate instead.

    Two masks, deliberately:

    - the background estimate is a normalised convolution over the **hard**
      mask. Weighting it with a feathered mask gives the artwork's own edge
      pixels a non-zero weight, they drag the estimate dark, and the
      correction overshoots — the symptom is a bright halo tracing every
      silhouette, the sun, the moon and each orbit dash.
    - the blend weight is a separate, lightly feathered copy, and the feather
      has to stay narrower than the thinnest artwork feature (the orbit dashes
      are ~8px on the 1024px master). Widen it, or dilate the mask first, and
      the dashes and the sun's rays are re-grounded along with the paper and
      disappear from the splash without anything failing.
    """
    im = Image.open(path).convert('RGB')
    hard = background_mask(im)
    blend = hard.filter(ImageFilter.GaussianBlur(MASK_FEATHER))
    blur = ImageFilter.GaussianBlur(BG_BLUR)
    den = hard.filter(blur).point(lambda p: max(p, 1))
    channels = []
    for i, c in enumerate(im.split()):
        num = ImageChops.multiply(c, hard).filter(blur)
        local_bg = ImageMath.unsafe_eval('float(n) * 255 / float(d)', n=num, d=den)
        target = Image.new('F', im.size, float(TARGET_BG[i]))
        channels.append(ImageMath.unsafe_eval(
            "convert(min(max(float(c) + (tgt - bg) * float(w) / 255, 0), 255), 'L')",
            c=c, bg=local_bg, tgt=target, w=blend))
    corrected = Image.merge('RGB', channels)
    # Snap pure paper to a flat #FBEDE0. The master's grain is +/-2/255 there,
    # invisible either way, but it defeats PNG's row filters and doubles the
    # size of every file.
    flat = blend.point(lambda p: 255 if p >= 254 else 0)
    return Image.composite(Image.new('RGB', im.size, TARGET_BG), corrected, flat)


def compose(logo, w, h, factor):
    """Centre `logo` on a #FBEDE0 canvas; `factor` is of the shorter edge."""
    side = int(round(factor * min(w, h)))
    canvas = Image.new('RGB', (w, h), TARGET_BG)
    canvas.paste(logo.resize((side, side), Image.LANCZOS),
                 ((w - side) // 2, (h - side) // 2))
    return canvas


def compose_icon(logo, density):
    """The system splash icon: master square centred on a 288dp canvas."""
    canvas_px = int(round(SPLASH_ICON_CANVAS_DP * density))
    master_px = int(round(SPLASH_ICON_MASTER_DP * density))
    canvas = Image.new('RGB', (canvas_px, canvas_px), TARGET_BG)
    offset = (canvas_px - master_px) // 2
    canvas.paste(logo.resize((master_px, master_px), Image.LANCZOS),
                 (offset, offset))
    return canvas


def main():
    logo = regrounded_master(os.path.join(REPO, MASTER))
    for group, factor in ((ANDROID, ANDROID_FACTOR), (IOS, IOS_FACTOR)):
        for rel, w, h in group:
            compose(logo, w, h, factor).save(
                os.path.join(REPO, rel), 'PNG', optimize=True)
            print(f'{rel}  {w}x{h}  logo {int(round(factor * min(w, h)))}px')
    for bucket, density in SPLASH_ICON_DENSITIES:
        rel = f'android/app/src/main/res/drawable-{bucket}/splash_icon.png'
        path = os.path.join(REPO, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        icon = compose_icon(logo, density)
        icon.save(path, 'PNG', optimize=True)
        print(f'{rel}  {icon.width}x{icon.height}  '
              f'mark {int(round(SPLASH_ICON_MASTER_DP * density))}px')


if __name__ == '__main__':
    sys.exit(main())
