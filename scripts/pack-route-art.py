"""Preserve approved generation outputs and normalize format only; never crop.

Run with bundled Pillow Python. This does not replace any older story plates.
Run --manifest after fleet packaging to register Aurora without racing that job.
"""
import hashlib
import json
import shutil
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
GENERATED = Path('/Users/tiborbanach/.codex/generated_images/019fc18e-997a-7e42-aa11-a54945e57937')
JOBS = {
    'aurora': '9443e1f8-bb3e-4285-b4ce-4fe0b4332ade',
    'aurora-hana': '65991319-1110-468f-824c-793632eee4b7',
    'aurora-vale': '4d11af16-6ba1-4077-bfa7-338d3d802060',
    'aurora-arrival': 'f5ea7ac0-256d-4f86-8599-63e7e0e3351c',
    'fortress-breach': '2ef83b27-c560-4e64-abc0-1fe6b6649d6c',
    'fortress-shield': '4bdfe292-a88b-4964-b962-f7082af1410a',
}

for name, generation in JOBS.items():
    environment = name == 'aurora'
    source_dir = ROOT / ('assets/graphics-v2/environments' if environment else 'assets/story-v6')
    output_dir = ROOT / ('public/graphics-v2/environments' if environment else 'public/story-v6')
    source_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    original = source_dir / f'{name}.png'
    if not original.exists():
        shutil.copyfile(GENERATED / f'exec-{generation}.png', original)
    image = Image.open(original).convert('RGB')
    # Preserve original aspect ratio and every pixel of the composition.
    image.thumbnail((1280, 1280) if environment else (1600, 900), Image.Resampling.LANCZOS)
    output = output_dir / f'{name}.webp'
    image.save(output, quality=88, method=6)
    assert output.stat().st_size < 320 * 1024, (name, 'payload budget')
    with Image.open(output) as decoded:
        decoded.load()
        assert decoded.size == image.size
    print(f'{name}: {image.width}x{image.height}, {output.stat().st_size:,} bytes')

if '--manifest' in sys.argv:
    path = ROOT / 'public/graphics-v2/manifest.json'
    manifest = json.loads(path.read_text())
    output = ROOT / 'public/graphics-v2/environments/aurora.webp'
    image = Image.open(output)
    manifest['environments']['aurora'] = {
        'file': 'environments/aurora.webp', 'width': image.width, 'height': image.height,
        'source': 'assets/graphics-v2/environments/aurora.png',
        'generatedFile': f'exec-{JOBS["aurora"]}.png',
        'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
    }
    path.write_text(json.dumps(manifest, indent=2) + '\n')
