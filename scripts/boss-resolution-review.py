"""Render a same-display-size QA comparison from actual shipping PNG pixels.

This does not author or alter game art; it composites existing bake outputs.
"""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT/'public/graphics-v2'
BEFORE = ROOT/'assets/graphics-v2/archive/2026-11-08-boss-resolution-before'
OUT = ROOT/'work/graphics-v2/boss-upgrade-review.png'
image = Image.new('RGB',(1120,930),'#07101c')
draw = ImageDraw.Draw(image)
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',20)
small = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',15)

def crown(folder,density):
    hull = Image.open(folder/'nullArchitect.png' if folder==BEFORE else folder/'ships/nullArchitect.png').convert('RGBA')
    w,h=260*density,210*density
    frame=hull.crop((3*w,h,4*w,2*h)).resize((520,420),Image.Resampling.LANCZOS)
    module=Image.open(folder/'crown-turret.png' if folder==BEFORE else folder/'modules/crown-turret.png').convert('RGBA')
    module=module.resize((96,96),Image.Resampling.LANCZOS)
    data=json.loads((folder/'crown-turret.json' if folder==BEFORE else folder/'modules/crown-turret.json').read_text())
    for mount in data['mounts']:
        frame.alpha_composite(module,(round(260+mount['x']*520-48),round(210+mount['y']*420-48)))
    return frame

draw.text((28,20),'OBSIDIAN CROWN / SAME 520 x 420 GAME FOOTPRINT',font=font,fill='#ddedff')
for x,folder,density,title in [(20,BEFORE,1,'BEFORE / 260 x 210 source'),(580,PUBLIC,3,'AFTER / 780 x 630 source')]:
    draw.text((x+10,61),title,font=small,fill='#8eacc9')
    ship=crown(folder,density);image.paste(ship,(x,90),ship)
draw.line((25,525,1095,525),fill='#30465c',width=1)
draw.text((28,551),'ECLIPSE SERAPH / APPROVED MODEL + TWO ARTICULATED WINGS',font=font,fill='#ddedff')
seraph=Image.open(ROOT/'work/graphics-v2/fleet/modules/seraph-complete.png').convert('RGBA')
seraph.thumbnail((640,328),Image.Resampling.LANCZOS)
image.paste(seraph,(240,590),seraph)
draw.text((28,900),'Real Blender rebakes; no source-image enlargement. Runtime body sizes and Crown mount coordinates retained.',font=small,fill='#8eacc9')
image.save(OUT)
print(OUT)
