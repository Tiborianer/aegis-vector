import { readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';

const root = resolve(process.argv[2] ?? 'public', 'graphics-v2');
// CI verifies the shipping pixels/contracts without publishing the private
// authoring library. `npm run verify:graphics` additionally checks those sources.
const verifySources = process.argv[2] !== 'dist' && !process.argv.includes('--runtime-only');
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const ships = ['player','scout','interceptor','bomber','elite','charger','sniper','mineLayer','shieldCarrier','bulwark','phantom','artillery','reclaimer','razorwing','gatekeeper','pursuer','carrierBoss','warden','boss','drone','droneMk2','skimmer','weaver','seraph','nullArchitect','prism','leech'];
const environments = ['coastal','minefield','aurora','fortress','stormbreak','graveyard','carrierSiege','dreadnought','lastLight','cirrus'];
const assert = (ok, why) => { if (!ok) throw new Error(`Graphics verification: ${why}`); };
let total = 0;
const counted = new Set();
function asset(definition) {
  assert(definition && !definition.file.includes('..'), 'missing/unsafe manifest entry');
  const data = readFileSync(join(root, definition.file));
  assert(data.length > 256 && data.length < (definition.textureDensity > 1 ? 6_000_000 : 2_000_000), `${definition.file}: invalid size`);
  assert(createHash('sha256').update(data).digest('hex') === definition.sha256, `${definition.file}: content hash mismatch`);
  if (!counted.has(definition.file)) total += data.length;
  counted.add(definition.file);
  return data;
}

function rgbaPng(data, label) {
  assert(data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])), `${label}: PNG signature`);
  const width = data.readUInt32BE(16), height = data.readUInt32BE(20);
  assert(data[24] === 8 && data[25] === 6 && data[28] === 0, `${label}: must be 8-bit RGBA, noninterlaced`);
  const chunks = [];
  let ended = false;
  for (let at=8; at<data.length;) {
    const length = data.readUInt32BE(at), type = data.toString('ascii',at+4,at+8);
    assert(at+length+12 <= data.length, `${label}: truncated chunk`);
    if (type === 'IDAT') chunks.push(data.subarray(at+8,at+8+length));
    if (type === 'IEND') ended = true;
    at += length+12;
  }
  assert(ended && chunks.length, `${label}: incomplete PNG`);
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width*4, pixels = Buffer.alloc(stride*height);
  assert(raw.length === (stride+1)*height, `${label}: undecodable scanlines`);
  const paeth = (a,b,c) => { const p=a+b-c, pa=Math.abs(p-a), pb=Math.abs(p-b), pc=Math.abs(p-c); return pa<=pb && pa<=pc ? a : pb<=pc ? b : c; };
  for(let y=0;y<height;y++) {
    const filter = raw[y*(stride+1)];
    assert(filter<=4, `${label}: unknown PNG filter`);
    for(let x=0;x<stride;x++) {
      const at=y*stride+x, left=x>=4?pixels[at-4]:0, up=y>0?pixels[at-stride]:0, corner=y>0&&x>=4?pixels[at-stride-4]:0;
      const predictor = [0,left,up,Math.floor((left+up)/2),paeth(left,up,corner)][filter];
      pixels[at]=(raw[y*(stride+1)+x+1]+predictor)&255;
    }
  }
  return {width,height,pixels};
}

assert(manifest.version === 2 && Object.keys(manifest.ships).length === ships.length, 'fleet version/count');
for (const kind of ships) {
  const def = manifest.ships[kind], data = asset(def);
  const {width,height,pixels} = rgbaPng(data, kind);
  const density = def.textureDensity ?? 1, fw = def.width*density, fh = def.height*density;
  assert([1,2,3].includes(density) && width <= 4096 && height <= 4096, `${kind}: bounded texture density`);
  assert(width === fw*4 && height === fh*4 && def.frameCount === 16 && def.angles.length === 16 && def.angles[7] === 0, `${kind}: frame layout`);
  const hashes = new Set();
  for(let frame=0;frame<16;frame++) {
    const hash = createHash('sha256');
    let opaque=0, transparent=0;
    for(let y=0;y<fh;y++) {
      const start = ((Math.floor(frame/4)*fh+y)*width+(frame%4)*fw)*4;
      const row = pixels.subarray(start,start+fw*4);
      hash.update(row);
      for(let x=0;x<fw;x++) { if(row[x*4+3] > 0) opaque++; else transparent++; }
    }
    assert(opaque>40 && transparent>40, `${kind}/${frame}: empty or opaque-box frame`);
    hashes.add(hash.digest('hex'));
  }
  assert(hashes.size === 16, `${kind}: duplicate bank images`);
}
assert(Object.keys(manifest.environments).length === environments.length, 'environment count');
let breakupFrames = 0;
const breakups = JSON.parse(readFileSync(new URL('../src/game/assets/ship-breakups.json', import.meta.url), 'utf8'));
for (const [kind, spec] of Object.entries(breakups)) {
  const { meta, frames } = JSON.parse(readFileSync(join(root, 'breakups', kind + '.json'), 'utf8'));
  const { width, height } = rgbaPng(asset({ file: 'breakups/' + kind + '.png', sha256: meta.sha256 }), kind);
  assert(meta.fps === 30 && meta.sharedTail > 0 && meta.sharedTail < meta.length
    && width <= 2048 && height <= 2048, kind + ': breakup timing and sheet size');
  assert(meta.length === spec.frames && meta.sharedTail === spec.bankFrames
    && Object.keys(frames).length === meta.length + 2 * meta.sharedTail, kind + ': breakup frame count');
  for (const cue of ['rackIgnition', 'fieldCollapse']) {
    assert(meta[cue] === spec[cue] && (meta[cue] === undefined || meta[cue] > 0 && meta[cue] < meta.length), kind + ': secondary cue');
  }
  for (const bank of [-30, 0, 30]) {
    for (let i = 0; i < (bank === 0 ? meta.length : meta.sharedTail); i++) {
      const entry = frames[`${bank}/${i}`];
      assert(entry?.trimmed, kind + ': missing breakup frame ' + i);
      const { frame: f, sourceSize: s, spriteSourceSize: t } = entry;
      assert(f.w > 0 && f.h > 0 && f.x >= 0 && f.y >= 0 && f.x + f.w <= width && f.y + f.h <= height
        && t.w === f.w && t.h === f.h && t.x >= 0 && t.y >= 0 && t.x + t.w <= s.w && t.y + t.h <= s.h,
        kind + ': invalid breakup trim ' + i);
      breakupFrames++;
    }
  }
}
const wrecks = JSON.parse(readFileSync(new URL('../src/game/assets/wreck-ships.json', import.meta.url), 'utf8'));
const enemies = ships.filter(kind => !['player', 'drone', 'droneMk2'].includes(kind));
const covered = [...Object.keys(breakups), ...Object.keys(wrecks).filter(kind => kind !== 'player')];
assert(covered.length === enemies.length && enemies.every(kind => covered.includes(kind)), 'every enemy must have exactly one destruction');
assert(wrecks.player, 'missing player breakup');
let wreckPoses = 0;
for (const group of new Set([...Object.values(wrecks), 'plumes'])) {
  const prefix = 'breakups/wreck-' + group;
  const { meta, frames } = JSON.parse(readFileSync(join(root, prefix + '.json'), 'utf8'));
  const image = asset({ file: prefix + '.webp', sha256: meta.sha256 });
  assert(image.toString('ascii', 0, 4) === 'RIFF' && image.toString('ascii', 8, 16) === 'WEBPVP8X'
    && image.readUIntLE(24, 3) + 1 === meta.size.w && image.readUIntLE(27, 3) + 1 === meta.size.h
    && meta.size.w <= 2048 && meta.size.h <= 2048, group + ': transparent WebP dimensions');
  for (const { frame: f, sourceSize: sz, spriteSourceSize: t } of Object.values(frames)) {
    assert(f.w > 0 && f.h > 0 && f.x >= 0 && f.y >= 0 && f.x+f.w <= meta.size.w && f.y+f.h <= meta.size.h
      && t.w === f.w && t.h === f.h && t.x >= 0 && t.y >= 0 && t.x+t.w <= sz.w && t.y+t.h <= sz.h, group + ': trim');
  }
  const members = Object.keys(wrecks).filter(kind => wrecks[kind] === group);
  assert(Object.keys(meta.ships).length === members.length, group + ': ship count');
  for (const kind of members) {
    const d = meta.ships[kind];
    assert(d?.steps === 12 && d.parts.length >= 8 && d.density > 0 && d.duration > 0, kind + ': solid assemblies');
    if (kind === 'player') {
      assert(d.parts.filter(p => p.role === 'capsule').length === 1 && d.events.every(e => e.role !== 'capsule'),
        'player must eject one complete cockpit from its collar');
    }
    let previous = -1;
    for (const beat of d.events) {
      assert(beat.time > previous && beat.time + beat.life <= d.duration && beat.size > 0
        && beat.sites.length === 2 && beat.sites.every(i => d.parts[i]?.role === beat.role), kind + ': physical stage');
      previous = beat.time;
    }
    for (const [i, part] of d.parts.entries()) {
      assert(part.anchors.length === 16 && part.paths.length === 2 && part.paths.every(p =>
        p.length === 5 && p.every(Number.isFinite) && p[0] >= 0 && p[0] < d.duration), kind + ': bank and release');
      for (let n=0; n<d.steps; n++) assert(frames[kind+'/'+i+'/'+n], kind + ': missing solid orientation');
    }
  }
  if (group === 'plumes') {
    for (const color of ['fire','field','ion']) for (let i=0; i<18; i++) assert(frames[color+'/'+i], color + ': missing plume');
    assert(frames.spall, 'missing incandescent chip');
  }
  wreckPoses += Object.keys(frames).length;
}
const crownModule = manifest.modules?.crownTurret;
const crownPng = rgbaPng(asset(crownModule), 'crown-turret');
assert(crownPng.width === 144 && crownPng.height === 144 && crownModule.width === 48 && crownModule.height === 48 && crownModule.textureDensity === 3, 'crown-turret: high-density 48px logical module contract');
let crownOpaque = 0, crownTransparent = 0;
for (let i=3; i<crownPng.pixels.length; i+=4) {
  if(crownPng.pixels[i]>0) crownOpaque++; else crownTransparent++;
}
assert(crownOpaque>40 && crownTransparent>40, 'crown-turret: empty or opaque-box sprite');
const crownContract = JSON.parse(readFileSync(join(root, crownModule.contract), 'utf8'));
assert(crownContract.width === 260 && crownContract.height === 210 && crownContract.neutralFrame === 7
  && crownContract.barrelForward === 'down' && crownContract.pivot?.every(v=>v===.5), 'crown-turret: invalid alignment contract');
assert(crownContract.mounts?.length === 6 && crownContract.mounts.every(p=>Number.isFinite(p.x) && Number.isFinite(p.y)
  && Math.abs(p.x)<.5 && Math.abs(p.y)<.5), 'crown-turret: six normalized mounts required');
assert(crownContract.muzzleLengthPx>0 && crownContract.muzzleLengthPx<24, 'crown-turret: invalid barrel reach');
assert(manifest.ships.nullArchitect.textureDensity === 3 && manifest.ships.nullArchitect.renderDensity === 4, 'Crown must retain real high-resolution bake pixels');
assert(manifest.ships.seraph.family === 'approvedEclipse' && manifest.ships.seraph.textureDensity === 2, 'approved Eclipse production mapping');
const seraph = JSON.parse(readFileSync(join(root, 'modules/seraph-wings.json'), 'utf8'));
assert(seraph.name === 'Eclipse Seraph' && seraph.width === 320 && seraph.height === 164 && seraph.wings?.length === 2, 'Eclipse wing contract');
for (const wing of seraph.wings) {
  const def = manifest.modules[wing.textureKey], png = rgbaPng(asset(def), wing.textureKey);
  assert(png.width === 640 && png.height === 328 && def.textureDensity === 2, 'Eclipse wing high-density size');
  assert(wing.origin.every((v, i) => Math.abs(v - (.5 + wing.hinge[i] / [320,164][i])) < 1e-6), 'Eclipse physical hinge origin');
  assert(wing.colliders.length === 4 && wing.muzzle.every(Number.isFinite), 'Eclipse moving plate/muzzle contract');
  let visible = 0, transparent = 0;
  for (let i = 3; i < png.pixels.length; i += 4) { if (png.pixels[i] > 0) visible++; else transparent++; }
  assert(visible > 40 && transparent > visible, 'Eclipse separated transparent wing mesh');
}
if (verifySources) {
  const source = readFileSync(resolve(crownModule.source));
  assert(source.toString('ascii',0,4)==='glTF' && source.readUInt32LE(4)===2 && source.readUInt32LE(8)===source.length, 'crown-turret: invalid actual 3D source');
  const model = JSON.parse(source.toString('utf8',20,20+source.readUInt32LE(12)).trim());
  assert(model.meshes?.length>3 && model.materials?.length>2, 'crown-turret: missing articulated geometry/materials');
  assert(statSync(resolve(crownContract.source)).size>0, 'crown-turret: approved editable Crown source missing');
}
assert(manifest.environments.lastLight?.aliasOf === 'dreadnought'
  && manifest.environments.lastLight.file === manifest.environments.dreadnought.file, 'final relay surface alias');
for(const id of environments) {
  const def = manifest.environments[id], data = asset(def);
  assert(data.toString('ascii',0,4)==='RIFF' && data.toString('ascii',8,12)==='WEBP' && data.readUInt32LE(4)+8===data.length, `${id}: malformed WebP`);
  assert(def.width>=1024 && def.height>=1024, `${id}: surface resolution`);
  if (verifySources) {
    const original = resolve(def.source);
    assert(statSync(original).size>0, `${id}: missing source art`);
  }
}
if (verifySources) for(const kind of ships) {
  const glb = readFileSync(resolve(manifest.ships[kind].source));
  assert(glb.toString('ascii',0,4)==='glTF' && glb.readUInt32LE(4)===2 && glb.readUInt32LE(8)===glb.length, `${kind}: invalid real 3D source`);
  const json = JSON.parse(glb.toString('utf8',20,20+glb.readUInt32LE(12)).trim());
  assert(json.meshes?.length > 3 && json.materials?.length > 2, `${kind}: missing model geometry/materials`);
}
assert(total < 20_000_000, 'graphics payload exceeds 20 MB');
console.log(`Graphics verified: ${ships.length} real-model atlases, ${covered.length} enemy breakups plus the player (${wreckPoses} debris and plume poses), ${ships.length*16+breakupFrames} decoded transparent frames, 9 mission mappings (8 unique surfaces) + cirrus; ${(total/1024/1024).toFixed(2)} MiB.`);
