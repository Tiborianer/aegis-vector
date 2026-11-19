import type Phaser from 'phaser';
import { BANK_ANGLES, NEUTRAL_BANK, shipKey, shipTextureDensity } from '../../game/assets/visuals';
import catalog from '../../game/assets/wreck-ships.json';

export type WreckShip = keyof typeof catalog;
export const isWreckShip = (kind: string): kind is WreckShip => Object.hasOwn(catalog, kind);
export const WRECK_SHEETS = [...new Set([...Object.values(catalog), 'plumes'])];
export const wreckKey = (sheet: string): string => 'wreck-' + sheet;
export const wreckAsset = (sheet: string): string => 'graphics-v2/breakups/' + wreckKey(sheet);
const plumeKey = wreckKey('plumes');

type Point = { x: number; y: number };
type Pair = [number, number];
// Each path stores release time, two projected velocities, spin, and 3D roll.
type Path = [number, number, number, number, number];
type Part = { name: string; role: string; layer: number; arm: number; anchors: Pair[]; paths: [Path, Path] };
type Beat = { time: number; label: string; color: string; size: number; life: number; sites: Pair };
type Shot = { duration: number; density: number; steps: number; parts: Part[]; events: Beat[] };
type Image = Phaser.GameObjects.Image;
type Container = Phaser.GameObjects.Container;
type SeatSound = (cue: 'rack-ignition' | 'field-collapse', x: number) => void;
const clamp = (v: number) => Math.min(1, Math.max(0, v));
const fullTurn = 2 * Math.PI;

function liveWingPoses(enemy: Phaser.Physics.Arcade.Sprite): Image[] {
  const modules = enemy.getData('modulesView') as Container | undefined;
  return modules?.getData('wings') ?? [];
}

function pivot(point: Pair, wing?: Image): Pair {
  if (!wing) return point;
  const dx = point[0] - wing.x, dy = point[1] - wing.y;
  const c = Math.cos(wing.rotation), s = Math.sin(wing.rotation);
  return [wing.x + c * dx - s * dy, wing.y + s * dx + c * dy];
}

/** Play a ship's actual mechanical assemblies on one scene clock. Timing and
 * trajectories for both impact sides come from its editable Blender scene. */
export function playFleetWreck(
  scene: Phaser.Scene, kind: WreckShip, enemy: Phaser.Physics.Arcade.Sprite, impact: Point,
  transients: Set<Phaser.GameObjects.GameObject>, sound: SeatSound,
): boolean {
  const sheet = wreckKey(catalog[kind]);
  if (enemy.texture.key !== shipKey(kind) || !scene.textures.exists(sheet) || !scene.textures.exists(plumeKey)) return false;
  const data = scene.textures.get(sheet).customData as { meta?: { ships?: Record<string, Shot> } };
  const definition = data.meta?.ships?.[kind];
  if (!definition?.parts.length) return false;
  const shot: Shot = definition;

  const { x, y, rotation, alpha } = enemy;
  const { x: vx, y: vy } = enemy.body!.velocity;
  const localX = Math.cos(rotation) * (impact.x - x) + Math.sin(rotation) * (impact.y - y);
  const side = Math.abs(localX) < 1 ? enemy.getData('entityId') % 2 : Number(localX > 0);
  const frame = Number(enemy.frame.name);
  const bank = BANK_ANGLES[frame] === undefined ? NEUTRAL_BANK : frame;
  const radians = BANK_ANGLES[bank] * Math.PI / 180;
  const poseAt = (roll: number) => (Math.round(roll * shot.steps / fullTurn) % shot.steps + shot.steps) % shot.steps;
  const density = shipTextureDensity(kind);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const motion = reduced ? .42 : 1;
  const length = reduced ? Math.min(1.28, shot.duration) : shot.duration;
  const group = scene.add.container(x, y).setDepth(enemy.depth + .05).setRotation(rotation)
    .setScale(enemy.scaleX * density, enemy.scaleY * density).setAlpha(alpha)
    .setData('fleetWreck', kind).setData('finishDuringExtraction', shot.duration > 1.65);

  const wings = liveWingPoses(enemy);
  const pieces = shot.parts.map((part, index) => {
    const wing = part.arm ? wings.find(w => Math.sign(w.x) === part.arm) : undefined;
    const [startX, startY] = pivot(part.anchors[bank], wing);
    const pose = poseAt(radians);
    const image = scene.add.image(startX, startY, sheet, `${kind}/${index}/${pose}`)
      .setScale(1 / shot.density).setRotation(wing?.rotation ?? 0);
    return { image, index, startX, startY, facing: image.rotation, pose, layer: part.layer, path: part.paths[side] };
  });
  group.add([...pieces].sort((a, b) => a.layer - b.layer).map(p => p.image));

  // This short dissolve preserves the exact living bank and the Seraph's wing hinges.
  const intact = [scene.add.image(0, 0, enemy.texture.key, enemy.frame.name).setScale(1 / density)];
  for (const wing of wings) {
    intact.push(scene.add.image(wing.x, wing.y, wing.texture.key, wing.frame.name)
      .setOrigin(wing.originX, wing.originY).setScale(wing.scaleX, wing.scaleY).setRotation(wing.rotation));
  }
  group.add(intact);
  const flashes = shot.events.map((event, i) => {
    const image = scene.add.image(0, 0, plumeKey, event.color + '/0').setVisible(false);
    image.setScale(event.size * 1.8 / 112).setRotation((i * 1.83 + side * .91) % fullTurn);
    group.add(image);
    return { event, image, anchor: pieces[event.sites[side]], sounded: false };
  });
  // A small reusable set of sparks stays within the co-op drawing budget during an EMP.
  const sparks = Array.from({ length: reduced ? 0 : shot.duration > 1.65 ? 7 : 4 }, () => {
    const spark = scene.add.image(0, 0, plumeKey, 'spall').setVisible(false);
    group.add(spark);
    return spark;
  });
  function draw(time: number) {
    const elapsedWorld = time * length / shot.duration;
    group.setPosition(x + vx * elapsedWorld, y + vy * elapsedWorld);
    if (kind === 'phantom') group.setAlpha(alpha + (1 - alpha) * clamp(time / .17));
    const open = clamp(time / .085);
    for (const layer of intact) layer.setAlpha(1 - open).setVisible(open < 1);
    for (const part of pieces) {
      const [release, dx, dy, spin, roll] = part.path;
      const age = Math.max(0, time - release);
      const next = poseAt(radians + roll * age * motion);
      if (next !== part.pose) {
        part.image.setFrame(`${kind}/${part.index}/${next}`);
        part.pose = next;
      }
      const fade = clamp((shot.duration - time) / Math.max(.18, (shot.duration - release) * .38));
      part.image.setPosition(part.startX + dx * age * motion, part.startY + dy * age * motion)
        .setRotation(part.facing + spin * age * motion).setAlpha(open * fade);
    }
    let latest = -1;
    for (const [i, flash] of flashes.entries()) {
      const age = time - flash.event.time;
      if (age >= 0) latest = i;
      if (age >= 0 && !flash.sounded) {
        flash.sounded = true;
        if (i > 0 && (shot.duration > 1.65 || i === flashes.length - 1)) {
          sound(flash.event.color === 'fire' ? 'rack-ignition' : 'field-collapse', group.x + flash.anchor.image.x * group.scaleX);
        }
      }
      const visible = age >= 0 && age < flash.event.life;
      flash.image.setVisible(visible);
      if (visible) flash.image.setFrame(flash.event.color + '/' + Math.min(17, Math.floor(18 * age / flash.event.life)))
        .setPosition(flash.anchor.image.x, flash.anchor.image.y).setAlpha(reduced ? .56 : 1);
    }
    const flash = flashes[latest];
    for (const [i, spark] of sparks.entries()) {
      const age = flash ? time - flash.event.time - .014 * (i % 3) : -1;
      const life = .18 + .026 * (i % 4);
      spark.setVisible(age >= 0 && age < life);
      if (age < 0 || age >= life) continue;
      const angle = i * 2.40 + latest * 1.71 + side * Math.PI;
      const speed = flash.event.size * (2.3 + (i % 4) * .36);
      spark.setPosition(flash.anchor.image.x + Math.cos(angle) * age * speed, flash.anchor.image.y + Math.sin(angle) * age * speed)
        .setRotation(angle).setScale((.29 + .055 * (i % 3)) * (1 - age / life * .46)).setAlpha(1 - age / life);
    }
  }
  draw(0);
  transients.add(group);
  const clock = scene.tweens.addCounter({
    from: 0, to: shot.duration, duration: length * 1000,
    onUpdate: t => draw(t.getValue() ?? 0), onComplete: () => group.destroy(),
  });
  group.once('destroy', () => { transients.delete(group); clock.remove(); });
  return true;
}

/** Eject the Crown's live aimed gun when its own combat module is destroyed. */
export function shedCrownTurret(scene: Phaser.Scene, enemy: Phaser.Physics.Arcade.Sprite, index: number,
  transients: Set<Phaser.GameObjects.GameObject>): boolean {
  const view = enemy.getData('modulesView') as Container | undefined;
  const gun = (view?.getData('turrets') as Image[] | undefined)?.[index];
  if (!gun?.visible || !scene.textures.exists(plumeKey)) return false;
  const matrix = gun.getWorldTransformMatrix();
  const wreck = scene.add.container(matrix.tx, matrix.ty).setDepth(enemy.depth + .06).setData('shedTurret', index);
  const metal = scene.add.image(0, 0, gun.texture.key, gun.frame.name).setScale(matrix.scaleX, matrix.scaleY).setRotation(matrix.rotation);
  const flash = scene.add.image(0, 0, plumeKey, 'fire/0').setScale(.47);
  wreck.add([metal, flash]);
  transients.add(wreck);
  const direction = matrix.tx >= enemy.x ? 1 : -1, spin = matrix.rotation;
  const clock = scene.tweens.addCounter({ from: 0, to: 1, duration: 700,
    onUpdate: t => {
      const a = t.getValue() ?? 0;
      metal.setPosition(25 * direction * a, 15 * a).setRotation(spin + direction * a * 1.9).setAlpha(clamp((1 - a) * 3));
      flash.setFrame('fire/' + Math.min(17, Math.floor(a * 27))).setVisible(a < .66);
    }, onComplete: () => wreck.destroy() });
  wreck.once('destroy', () => { transients.delete(wreck); clock.remove(); });
  return true;
}
