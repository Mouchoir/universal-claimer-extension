"""Generate the Chrome Web Store graphical assets.

    python scripts/make-store-assets.py

Every store asset must be a 24-bit PNG **without an alpha channel** — Chrome rejects the upload
otherwise, and the extension's own icons are RGBA because a toolbar icon needs transparency. So
these are composited onto an opaque background rather than reusing the icon files directly.

Produces, into store/assets/:
  store-icon-128.png   128x128   required
  promo-small-440.png  440x280   optional tile on the category pages
  promo-marquee.png   1400x560   optional banner

The 1280x800 screenshot is not generated here: a store screenshot has to be the real interface,
so it is captured from store/screenshot.html, which renders the actual popup.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "store" / "assets"
ICON = ROOT / "src" / "icons" / "icon-128.png"

BG = (15, 17, 21)  # the portal's dark surface, so the listing matches the product
TEXT = (232, 234, 237)
MUTED = (154, 161, 173)
INDIGO = (129, 140, 248)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    """Segoe UI is present on every Windows box; fall back rather than crash elsewhere."""
    for name in (("segoeuib.ttf", "arialbd.ttf") if bold else ("segoeui.ttf", "arial.ttf")):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def flatten(img: Image.Image, bg: tuple[int, int, int]) -> Image.Image:
    """RGBA -> RGB over an opaque colour. This is the step the stores actually care about."""
    out = Image.new("RGB", img.size, bg)
    out.paste(img, (0, 0), img if img.mode == "RGBA" else None)
    return out


def store_icon() -> None:
    # Same mark as the toolbar icon, just without transparency. Composited on the tile's own
    # indigo so the rounded corners do not turn into black wedges on a light listing page.
    icon = Image.open(ICON).convert("RGBA")
    flatten(icon, (79, 70, 229)).save(OUT / "store-icon-128.png", "PNG", optimize=True)


def fit(
    d: ImageDraw.ImageDraw, text: str, avail: int, start: int, bold: bool = False
) -> ImageFont.FreeTypeFont:
    """Largest size at or below `start` whose longest line fits `avail`.

    Fixed sizes do not survive a copy change: the marquee title overflowed its canvas the first
    time it was rendered, and a cropped title is the kind of thing that reaches a store listing
    unnoticed.
    """
    size = start
    while size > 8:
        f = font(size, bold=bold)
        widest = max(d.textbbox((0, 0), line, font=f)[2] for line in text.split("\n"))
        if widest <= avail:
            return f
        size -= 2
    return font(8, bold=bold)


def promo(width: int, height: int, name: str, title: str, subtitle: str) -> None:
    img = Image.new("RGB", (width, height), BG)
    d = ImageDraw.Draw(img)

    icon_size = int(height * 0.42)
    icon = Image.open(ICON).convert("RGBA").resize((icon_size, icon_size), Image.LANCZOS)
    left = int(width * 0.08)
    icon_y = (height - icon_size) // 2
    img.paste(icon, (left, icon_y), icon)

    text_x = left + icon_size + int(width * 0.045)
    avail = width - text_x - left
    title_f = fit(d, title, avail, int(height * 0.115), bold=True)
    sub_f = fit(d, subtitle, avail, int(height * 0.068))

    # Vertically centre the two lines as a block against the icon.
    gap = int(height * 0.045)
    t_h = d.textbbox((0, 0), title, font=title_f)[3]
    s_h = d.textbbox((0, 0), subtitle, font=sub_f)[3]
    block_y = (height - (t_h + gap + s_h)) // 2

    d.text((text_x, block_y), title, font=title_f, fill=TEXT)
    d.text((text_x, block_y + t_h + gap), subtitle, font=sub_f, fill=MUTED)

    # A thin accent rule, enough to stop the tile reading as a plain dark rectangle.
    d.rectangle([0, height - 4, width, height], fill=INDIGO)

    img.save(OUT / name, "PNG", optimize=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    store_icon()
    promo(440, 280, "promo-small-440.png", "Session\nExporter", "Local. Nothing sent.")
    promo(
        1400,
        560,
        "promo-marquee.png",
        "Universal Claimer — Session Exporter",
        "Export your session cookies locally. Nothing ever leaves your machine.",
    )

    for p in sorted(OUT.glob("*.png")):
        with Image.open(p) as im:
            print(f"{p.relative_to(ROOT)}  {im.size[0]}x{im.size[1]}  mode={im.mode}")


if __name__ == "__main__":
    main()
