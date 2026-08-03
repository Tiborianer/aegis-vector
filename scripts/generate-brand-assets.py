from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont


NAVY = (5, 11, 25, 255)
CYAN = (53, 232, 255, 255)
AMBER = (255, 182, 64, 255)
WHITE = (238, 249, 255, 255)


def mark(size: int, maskable: bool = False) -> Image.Image:
    scale = 4
    canvas_size = size * scale
    image = Image.new("RGBA", (canvas_size, canvas_size), NAVY if maskable else (0, 0, 0, 0))
    field = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(field)
    inset = int(canvas_size * (0.135 if maskable else 0.095))
    draw.rounded_rectangle(
        (inset, inset, canvas_size - inset, canvas_size - inset),
        radius=int(canvas_size * 0.145),
        fill=(5, 17, 35, 255),
        outline=(23, 71, 102, 255),
        width=max(2, int(canvas_size * 0.012)),
    )
    field = field.rotate(45, Image.Resampling.BICUBIC, center=(canvas_size // 2, canvas_size // 2))
    image.alpha_composite(field)
    draw = ImageDraw.Draw(image)
    s = canvas_size / 512
    points = [(256, 103), (286, 197), (409, 337), (292, 306), (274, 409), (256, 435),
              (238, 409), (220, 306), (103, 337), (226, 197)]
    draw.polygon([(int(x * s), int(y * s)) for x, y in points], fill=WHITE, outline=(183, 231, 245, 255), width=max(2, int(5 * s)))
    draw.polygon([(int(x * s), int(y * s)) for x, y in [(256, 125), (268, 225), (256, 381), (244, 225)]], fill=(208, 233, 241, 190))
    draw.polygon([(int(x * s), int(y * s)) for x, y in [(233, 391), (247, 391), (240, 422), (224, 436)]], fill=AMBER)
    draw.polygon([(int(x * s), int(y * s)) for x, y in [(279, 391), (265, 391), (272, 422), (288, 436)]], fill=AMBER)
    glyph = [(363, 128), (374, 151), (397, 162), (374, 173), (363, 196), (352, 173), (329, 162), (352, 151)]
    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    ImageDraw.Draw(glow).polygon([(int(x * s), int(y * s)) for x, y in glyph], fill=(53, 232, 255, 185))
    image.alpha_composite(glow.filter(ImageFilter.GaussianBlur(max(1, int(7 * s)))))
    draw = ImageDraw.Draw(image)
    draw.polygon([(int(x * s), int(y * s)) for x, y in glyph], fill=CYAN)
    r = max(2, int(5 * s))
    draw.ellipse((int(363 * s) - r, int(162 * s) - r, int(363 * s) + r, int(162 * s) + r), fill=(255, 255, 255, 255))
    return image.resize((size, size), Image.Resampling.LANCZOS)


def social_card(source: Path, target: Path) -> None:
    image = Image.open(source).convert("RGB")
    target_ratio = 1200 / 630
    source_ratio = image.width / image.height
    if source_ratio > target_ratio:
        width = int(image.height * target_ratio)
        left = (image.width - width) // 2
        image = image.crop((left, 0, left + width, image.height))
    elif source_ratio < target_ratio:
        height = int(image.width / target_ratio)
        top = (image.height - height) // 2
        image = image.crop((0, top, image.width, top + height))
    image = image.resize((1200, 630), Image.Resampling.LANCZOS)
    image = ImageEnhance.Contrast(image).enhance(1.06)
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    pixels = overlay.load()
    for x in range(720):
        alpha = int(196 * (1 - x / 720) ** 1.55)
        for y in range(630):
            pixels[x, y] = (2, 7, 17, alpha)
    card = Image.alpha_composite(image.convert("RGBA"), overlay)
    draw = ImageDraw.Draw(card)
    narrow = "/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf"
    bold = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
    aegis_font = ImageFont.truetype(narrow, 76)
    vector_font = ImageFont.truetype(narrow, 102)
    tagline_font = ImageFont.truetype(bold, 22)
    draw.text((70, 184), "AEGIS", font=aegis_font, fill=(238, 249, 255), stroke_width=1, stroke_fill=(3, 14, 28))
    draw.text((65, 244), "VECTOR", font=vector_font, fill=(53, 232, 255), stroke_width=2, stroke_fill=(3, 14, 28))
    draw.line((72, 374, 520, 374), fill=(53, 232, 255, 170), width=2)
    draw.text((72, 394), "Six vectors. One last line.", font=tagline_font, fill=(199, 226, 235))
    glyph = [(520, 196), (530, 216), (550, 226), (530, 236), (520, 256), (510, 236), (490, 226), (510, 216)]
    draw.polygon(glyph, fill=(53, 232, 255))
    target.parent.mkdir(parents=True, exist_ok=True)
    card.convert("RGB").save(target, "JPEG", quality=88, optimize=True, progressive=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    for size in (16, 32, 48, 180, 192, 512):
        name = "apple-touch-icon.png" if size == 180 else f"icon-{size}.png"
        mark(size).save(args.output / name, "PNG", optimize=True)
    mark(512, maskable=True).save(args.output / "icon-maskable-512.png", "PNG", optimize=True)
    social_card(args.source, args.output / "share-card-v1.jpg")


if __name__ == "__main__":
    main()
