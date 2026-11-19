"""Pack the selected Blender bakes into trimmed Phaser atlases at gameplay scale."""
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'public/graphics-v2/breakups'
DEST.mkdir(parents=True, exist_ok=True)
CATALOG = json.loads((ROOT / 'src/game/assets/ship-breakups.json').read_text())


def pack(kind):
    src = ROOT / 'work/ship-breakups' / kind
    frames = {}
    banks = {}
    for path in sorted(src.glob('*_*.png')):
        bank, index = map(int, path.stem.split('_'))
        with Image.open(path) as raw:
            size = (raw.width // 2, raw.height // 2)
            im = raw.convert('RGBA').resize(size, Image.Resampling.LANCZOS)
        bounds = im.getchannel('A').point(lambda a: 255 if a >= 3 else 0).getbbox()
        assert bounds and bounds[0] > 0 and bounds[1] > 0 and bounds[2] < im.width and bounds[3] < im.height, path
        left, top, right, bottom = bounds
        bounds = (left - 1, top - 1, right + 1, bottom + 1)
        frames[f'{bank}/{index}'] = (im.crop(bounds), size, bounds[:2])
        banks.setdefault(bank, []).append(index)
    assert set(banks) == {-30, 0, 30}
    assert all(sorted(indices) == list(range(len(indices))) for indices in banks.values())
    spec = CATALOG[kind]
    assert len(banks[-30]) == len(banks[30]) == spec['bankFrames']
    assert len(banks[0]) == spec['frames']
    # Pack rows by height. Transparent gutters keep neighbouring frames out of linear filtering.
    width = 1024
    x, y, row_height = 1, 1, 0
    entries = {}
    for name in sorted(frames, key=lambda n: (-frames[n][0].height, n)):
        im, size, (left, top) = frames[name]
        w, h = im.size
        if x + w + 1 > width:
            x, y, row_height = 1, y + row_height + 2, 0
        entries[name] = {'frame': {'x': x, 'y': y, 'w': w, 'h': h}, 'trimmed': True,
                         'spriteSourceSize': {'x': left, 'y': top, 'w': w, 'h': h},
                         'sourceSize': {'w': size[0], 'h': size[1]}}
        x += w + 2
        row_height = max(row_height, h)
    sheet = Image.new('RGBA', (width, y + row_height + 1))
    assert sheet.height <= 2048
    for name, entry in entries.items():
        rect = entry['frame']
        sheet.paste(frames[name][0], (rect['x'], rect['y']))
    path = DEST / (kind + '.png')
    sheet.save(path, optimize=True)
    meta = {'image': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'fps': 30, 'length': len(banks[0]), 'sharedTail': len(banks[30])}
    for event in ('rackIgnition', 'fieldCollapse'):
        if event in spec:
            meta[event] = spec[event]
    payload = {'frames': entries, 'meta': meta}
    (DEST / (kind + '.json')).write_text(json.dumps(payload, separators=(',', ':')) + '\n')
    print(kind, len(entries), sheet.size)


for name in sys.argv[1:] or CATALOG:
    pack(name)
