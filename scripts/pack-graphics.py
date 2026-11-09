"""Package offline renders into fixed-size atlases; no gameplay data is changed.

Run after render-fleet.py with a Python containing Pillow. Source images remain
unchanged. Environment processing is resolution/format normalization only.
"""
import hashlib
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
BAKE = ROOT / 'work/graphics-v2/fleet'
PUBLIC = ROOT / 'public/graphics-v2'
SOURCE = ROOT / 'assets/graphics-v2/environments'
GENERATED = Path('/Users/tiborbanach/.codex/generated_images/019fc18e-997a-7e42-aa11-a54945e57937')
ENVIRONMENTS = {
    'coastal': 'exec-00b97418-669a-47af-84a6-c9e1440af998.png',
    'minefield': 'exec-4dfec17e-8dfd-4a56-b20f-f01e14c9c48e.png',
    'aurora': 'exec-9443e1f8-bb3e-4285-b4ce-4fe0b4332ade.png',
    'fortress': 'exec-96b619fa-9665-4c29-af2e-5c19392e7d6d.png',
    'stormbreak': 'exec-0346f5da-f0e7-4705-96b2-2d5b9629fe89.png',
    'graveyard': 'exec-c3133e94-8153-431f-b23f-8c5f940429c5.png',
    'carrierSiege': 'exec-88e3385e-1c10-4a10-b67d-aee50fce3707.png',
    'dreadnought': 'exec-1db0e4f5-1ab5-4265-af4c-395d04c3f728.png',
    'cirrus': 'exec-de90376b-3b66-430c-9181-afb589999c8f.png',
}

for folder in [PUBLIC / 'ships', PUBLIC / 'environments', SOURCE]:
    folder.mkdir(parents=True, exist_ok=True)

only = next((arg.split('=',1)[1].split(',') for arg in sys.argv if arg.startswith('--only=')), None)
staged = '--staged' in sys.argv
manifest_path = PUBLIC / ('expansion-manifest.json' if staged else 'manifest.json')
manifest = json.loads(manifest_path.read_text()) if only and manifest_path.exists() else {'version': 2, 'ships': {}, 'environments': {}}
specs = json.loads((BAKE / 'manifest.json').read_text())
if only:
    specs = {kind: specs[kind] for kind in only}
contact = Image.new('RGB', (1100, len(specs)*150), '#081222')
labels = ImageDraw.Draw(contact)
for row, (kind, spec) in enumerate(specs.items()):
    w, h = spec['width'], spec['height']
    density, render_density = spec.get('textureDensity',1), spec.get('renderDensity',3)
    fw, fh = w*density, h*density
    atlas = Image.new('RGBA', (fw*4, fh*4))
    hashes = set()
    for index in range(16):
        source = Image.open(BAKE / kind / f'{index:02}.png').convert('RGBA')
        assert source.size == (w*render_density, h*render_density), (kind, index, source.size)
        bounds = source.getchannel('A').getbbox()
        assert bounds and bounds[0] > 0 and bounds[1] > 0 and bounds[2] < source.width and bounds[3] < source.height, (kind, index, 'clipped render', bounds)
        frame = source.resize((fw, fh), Image.Resampling.LANCZOS)
        hashes.add(hashlib.sha256(frame.tobytes()).hexdigest())
        atlas.paste(frame, ((index%4)*fw, (index//4)*fh))
        if index in (0, 7, 15):
            thumb = frame.resize((w*2, h*2), Image.Resampling.NEAREST)
            thumb.thumbnail((270, 125), Image.Resampling.LANCZOS)
            contact.paste(thumb, (180+(0 if index == 0 else 1 if index == 7 else 2)*295, row*150+15), thumb)
    assert len(hashes) == 16, (kind, 'duplicate bank frames')
    path = PUBLIC / 'ships' / f'{kind}.png'
    if kind == 'nullArchitect' and spec['family'] == 'approvedCrown' and path.exists():
        backup = ROOT / 'assets/graphics-v2/atlases-archive/nullArchitect-cathedral-v1.png'
        if not backup.exists():
            backup.parent.mkdir(parents=True, exist_ok=True)
            backup.write_bytes(path.read_bytes())
    atlas.save(path, optimize=True)
    manifest['ships'][kind] = {**spec, 'frameCount':16, 'file':f'ships/{kind}.png', 'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
    labels.text((15,row*150+60), kind, fill='#d1e8ff')

if ('nullArchitect' in specs and specs['nullArchitect']['family'] == 'approvedCrown'):
    # A true 3D-baked articulated module, separate from the turret-free hull.
    module_source = BAKE / 'modules/crown-turret.png'
    module = Image.open(module_source).convert('RGBA')
    contract = json.loads((BAKE / 'modules/crown-turret.json').read_text())
    assert module.size == (48*contract.get('renderDensity',3),)*2, ('crown-turret', module.size)
    bounds = module.getchannel('A').getbbox()
    assert bounds and min(bounds[:2]) > 0 and max(bounds[2:]) < module.width, ('crown-turret clipped', bounds)
    density = contract.get('textureDensity',1)
    module = module.resize((48*density,48*density), Image.Resampling.LANCZOS)
    assert module.getchannel('A').getextrema()[0] == 0, 'turret must have transparent surround'
    module_dir = PUBLIC / 'modules';module_dir.mkdir(exist_ok=True)
    module_path = module_dir / 'crown-turret.png';module.save(module_path,optimize=True)
    (module_dir / 'crown-turret.json').write_text(json.dumps(contract,indent=2)+'\n')
    manifest.setdefault('modules',{})['crownTurret'] = {
        'file':'modules/crown-turret.png','width':48,'height':48,'textureDensity':density,
        'source':'assets/graphics-v2/models/crown-turret.glb',
        'sha256':hashlib.sha256(module_path.read_bytes()).hexdigest(),
        'contract':'modules/crown-turret.json',
    }

if 'seraph' in specs and specs['seraph']['family'] == 'approvedEclipse':
    contract = json.loads((BAKE / 'modules/seraph-wings.json').read_text())
    module_dir = PUBLIC / 'modules';module_dir.mkdir(exist_ok=True)
    (module_dir / 'seraph-wings.json').write_text(json.dumps(contract,indent=2)+'\n')
    for wing in contract['wings']:
        module = Image.open(BAKE / wing['file']).convert('RGBA')
        assert module.size == (contract['width']*4,contract['height']*4)
        module = module.resize((contract['width']*2,contract['height']*2),Image.Resampling.LANCZOS)
        path = PUBLIC / wing['file'];module.save(path,optimize=True)
        manifest.setdefault('modules',{})[wing['textureKey']] = {
            'file':wing['file'],'width':contract['width'],'height':contract['height'],'textureDensity':2,
            'source':contract['source'],'contract':'modules/seraph-wings.json',
            'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
        }

for name, filename in ({} if only else ENVIRONMENTS).items():
    original = SOURCE / f'{name}.png'
    if not original.exists():
        original.write_bytes((GENERATED / filename).read_bytes())
    source = Image.open(original).convert('RGBA' if name == 'cirrus' else 'RGB')
    source.thumbnail((1280,1280), Image.Resampling.LANCZOS)
    path = PUBLIC / 'environments' / f'{name}.webp'
    source.save(path, quality=90, method=6)
    if name == 'cirrus':
        assert source.getchannel('A').getextrema()[0] == 0, 'clouds must be transparent'
    manifest['environments'][name] = {'file':f'environments/{name}.webp','width':source.width,'height':source.height,
        'source':f'assets/graphics-v2/environments/{name}.png','generatedFile':filename,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}

# Final relay deliberately shares the Dreadnought surface, with distinct runtime
# lighting and warm beacons. Keep this alias in full and selective rebuilds.
if 'dreadnought' in manifest['environments']:
    manifest['environments']['lastLight'] = {**manifest['environments']['dreadnought'], 'aliasOf':'dreadnought'}

contact.save(ROOT / ('work/graphics-v2/expansion-contact.png' if staged or only else 'work/graphics-v2/fleet-contact.png'))
manifest_path.write_text(json.dumps(manifest, indent=2)+'\n')
print(f"Packed {len(specs)} spacecraft with 16 distinct frames each; {'staged' if staged else 'production'} manifest updated.")
print(f"Shipping size: {sum(p.stat().st_size for p in PUBLIC.rglob('*') if p.is_file())/1024/1024:.2f} MiB")
