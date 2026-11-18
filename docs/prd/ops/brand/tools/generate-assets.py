"""Carberk brand assets: the 'carberk.' wordmark and the 'c.' icon, from Poppins ExtraBold outlines.

Needs fontTools and Pillow. Poppins-ExtraBold.ttf is not committed; download it from
https://github.com/google/fonts/tree/main/ofl/poppins (SIL Open Font License, see Poppins-OFL.txt).

Run:  python3 docs/prd/ops/brand/tools/generate-assets.py <repo-root> <path-to-Poppins-ExtraBold.ttf>
"""
import os, sys

from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from PIL import Image, ImageDraw, ImageFont, ImageChops

FONT = sys.argv[2]
REPO = sys.argv[1]
GEIST = REPO + "/apps/mobile/assets/fonts/"
RED, INK, WHITE, GREY = "#E60000", "#17191D", "#FFFFFF", "#646B73"
TRACK, DOT_D, DOT_GAP = -0.035, 0.215, 0.045
ICON_TRACK = -0.02

font = TTFont(FONT)
UPM = font["head"].unitsPerEm
GS = font.getGlyphSet()
CMAP = font.getBestCmap()
HMTX = font["hmtx"]


def pair_kern(left, right):
    """GPOS pair adjustment (XAdvance of the first glyph) for one pair, in font units."""
    if "GPOS" not in font:
        return 0
    total = 0
    for lookup in font["GPOS"].table.LookupList.Lookup:
        for st in lookup.SubTable:
            if lookup.LookupType == 9:
                st = st.ExtSubTable
            if getattr(st, "LookupType", lookup.LookupType) != 2 and not hasattr(st, "PairSet") and not hasattr(st, "Class1Record"):
                continue
            cov = st.Coverage.glyphs
            if left not in cov:
                continue
            if st.Format == 1:
                for rec in st.PairSet[cov.index(left)].PairValueRecord:
                    if rec.SecondGlyph == right and rec.Value1 is not None:
                        return getattr(rec.Value1, "XAdvance", 0) or 0
            elif st.Format == 2:
                c1 = st.ClassDef1.classDefs.get(left, 0)
                c2 = st.ClassDef2.classDefs.get(right, 0)
                v = st.Class1Record[c1].Class2Record[c2].Value1
                val = (getattr(v, "XAdvance", 0) or 0) if v is not None else 0
                if val:
                    return val
    return total


def layout(text, track):
    """Glyph x positions (font units) plus the dot. Returns (items, dot_cx, dot_r, bounds)."""
    names = [CMAP[ord(ch)] for ch in text]
    x, items = 0.0, []
    for i, g in enumerate(names):
        items.append((g, x))
        x += HMTX[g][0] + track * UPM
        if i + 1 < len(names):
            x += pair_kern(g, names[i + 1])
    r = DOT_D * UPM / 2
    cx = x + DOT_GAP * UPM + r
    bp = BoundsPen(GS)
    for g, gx in items:
        GS[g].draw(TransformPen(bp, (1, 0, 0, 1, gx, 0)))
    x0, y0, x1, y1 = bp.bounds
    return items, cx, r, (x0, min(y0, 0), cx + r, y1)


def svg(text, track, letters, dot, pad=0.0):
    items, cx, r, (x0, y0, x1, y1) = layout(text, track)
    p = pad * UPM
    w, h = x1 - x0 + 2 * p, y1 - y0 + 2 * p
    pen = SVGPathPen(GS, ntos=lambda v: ("%.1f" % v).rstrip("0").rstrip("."))
    for g, gx in items:
        GS[g].draw(TransformPen(pen, (1, 0, 0, -1, gx - x0 + p, y1 + p)))
    d = pen.getCommands()
    cyc = y1 + p - r
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" role="img" aria-label="Carberk">'
        f'<path fill="{letters}" d="{d}"/>'
        f'<circle fill="{dot}" cx="{cx - x0 + p:.1f}" cy="{cyc:.1f}" r="{r:.1f}"/></svg>\n'
    ), w / h


def raster(text, track, width_px, letters, dot):
    """Tight RGBA render of the mark, exactly width_px wide."""
    items, cx, r, (x0, y0, x1, y1) = layout(text, track)
    SS = 4
    s = width_px * SS / (x1 - x0)
    W, H = int(round((x1 - x0) * s)), int(round((y1 - y0) * s))
    f = ImageFont.truetype(FONT, int(round(UPM * s)))
    s = f.size / UPM
    mask = Image.new("L", (W, H), 0)
    for g, gx in items:
        ch = next(chr(c) for c, n in CMAP.items() if n == g)
        layer = Image.new("L", (W, H), 0)
        ImageDraw.Draw(layer).text(((gx - x0) * s, y1 * s), ch, font=f, fill=255, anchor="ls")
        mask = ImageChops.lighter(mask, layer)
    dmask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(dmask).ellipse([(cx - r - x0) * s, (y1 - 2 * r) * s, (cx + r - x0) * s, y1 * s], fill=255)
    size = (width_px, int(round(H / SS)))
    out = Image.new("RGBA", size, (0, 0, 0, 0))
    out.paste(Image.new("RGBA", size, letters), (0, 0), mask.resize(size, Image.LANCZOS))
    out.paste(Image.new("RGBA", size, dot), (0, 0), dmask.resize(size, Image.LANCZOS))
    return out


def centred(size, bg, mark, dy=0):
    im = Image.new("RGBA", (size, size), bg)
    im.alpha_composite(mark, ((size - mark.width) // 2, (size - mark.height) // 2 + dy))
    return im


def rgb(hexc, a=255):
    return tuple(int(hexc[i:i + 2], 16) for i in (1, 3, 5)) + (a,)


def geist(weight, size):
    return ImageFont.truetype(GEIST + f"Geist-{weight}.ttf", size)


def feature(line, by="by Alpha Motors", quote=None):
    W, H = 1024, 500
    im = Image.new("RGBA", (W, H), rgb(RED))
    wm = raster("carberk", TRACK, 548, rgb(WHITE), rgb(WHITE))
    im.alpha_composite(wm, (84, 126))
    d = ImageDraw.Draw(im)
    size = 35
    while d.textlength(line, font=geist("Medium", size)) > W - 2 * 86:
        size -= 1
    d.text((86, 126 + wm.height + 62), line, font=geist("Medium", size), fill=rgb(WHITE), anchor="ls")
    d.line([(86, 394), (W - 86, 394)], fill=rgb(WHITE), width=1)
    d.text((86, 440), by, font=geist("SemiBold", 25), fill=rgb(WHITE), anchor="ls")
    if quote:
        d.text((W - 86, 440), quote, font=geist("Medium", 25), fill=rgb(WHITE), anchor="rs")
    return im.convert("RGB")


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if isinstance(data, str):
        open(path, "w").write(data)
    else:
        data.save(path, optimize=True)
    print("wrote", os.path.relpath(path, REPO))


M = REPO + "/apps/mobile/assets/"
B = REPO + "/docs/prd/ops/brand/"
S = REPO + "/docs/prd/ops/play-console-submission/"


word_svg, aspect = svg("carberk", TRACK, INK, RED)
write(B + "carberk-wordmark.svg", word_svg)
write(B + "carberk-wordmark-white.svg", svg("carberk", TRACK, WHITE, WHITE)[0])
write(B + "carberk-wordmark-red.svg", svg("carberk", TRACK, RED, RED)[0])
write(B + "carberk-mark.svg", svg("c", ICON_TRACK, RED, RED)[0])
write(M + "logo-carberk-red.svg", svg("carberk", TRACK, RED, RED)[0].replace(' role="img" aria-label="Carberk"', ""))
print("wordmark aspect %.3f" % aspect)


mark_w = rgb(WHITE), rgb(WHITE)
write(M + "images/icon.png", centred(1024, rgb(RED), raster("c", ICON_TRACK, 493, *mark_w)))
write(M + "images/android-icon-background.png", Image.new("RGBA", (1024, 1024), rgb(RED)))
write(M + "images/android-icon-foreground.png", centred(1024, (0, 0, 0, 0), raster("c", ICON_TRACK, 493, *mark_w)))
write(M + "images/android-icon-monochrome.png", centred(1024, (0, 0, 0, 0), raster("c", ICON_TRACK, 493, (0, 0, 0, 255), (0, 0, 0, 255))))
write(M + "images/splash-icon.png", centred(1024, (0, 0, 0, 0), raster("c", ICON_TRACK, 721, rgb(RED), rgb(RED))))


write(S + "graphics/app-icon-512.png", centred(512, rgb(RED), raster("c", ICON_TRACK, 246, *mark_w)))
write(S + "graphics/feature-graphic-1024x500-en.png", feature("Buy and sell cars in Turkmenistan"))
write(S + "graphics/feature-graphic-1024x500-ru.png", feature("Покупка и продажа авто в Туркменистане"))
write(S + "not-used-on-store/feature-graphic-1024x500-tk.png", feature("Türkmenistanda ulag al we sat", by="Alpha Motors bilen", quote="Arzan däl-de, amatly ulag satyn al."))


av = centred(1080, rgb(RED), raster("c", ICON_TRACK, 470, *mark_w))
write(B + "social/instagram-avatar-1080.png", av.convert("RGB"))
