import type Phaser from 'phaser';
import { FORMATION_PARTS, type CommonCraft, type SquadronPaint } from '../../game/assets/fleetArt';
import { FORMATION_SHOTS, type BreakupIndex } from '../../game/assets/formationBreakups';
import { NEUTRAL_BANK } from '../../game/assets/visuals';

type Point = { x: number; y: number };
type Anchor = [number, number];
export function localImpact(ship: Phaser.Physics.Arcade.Sprite, impact: Point): Point {
  const x = impact.x - ship.x, y = impact.y - ship.y;
  const c = Math.cos(ship.rotation), s = Math.sin(ship.rotation);
  return { x: (x * c + y * s) / ship.scaleX, y: (-x * s + y * c) / ship.scaleY };
}
export function playFormationCut(scene: Phaser.Scene, kind: CommonCraft, ship: Phaser.Physics.Arcade.Sprite,
  paint: SquadronPaint, index: Exclude<BreakupIndex, 0>, side: number, transients: Set<Phaser.GameObjects.GameObject>,
  sound: (cue: 'rack-ignition' | 'field-collapse', x: number) => void): boolean {
  if (!scene.textures.exists(FORMATION_PARTS) || !scene.textures.exists('wreck-plumes')) return false;
  const texture = scene.textures.get(FORMATION_PARTS);
  const { meta } = texture.customData as { meta?: { anchors: Record<string, Anchor> } };
  const anchors = meta?.anchors;
  if (!anchors) return false;
  const bank = Number.isInteger(+ship.frame.name) ? +ship.frame.name : NEUTRAL_BANK;
  const logical = side < 0 ? [0,1,2,3,4,5,6] : [1,0,3,2,4,6,5];
  const cut = FORMATION_SHOTS[kind].cuts[index - 1];
  const { x, y } = ship, velocity = (ship.body as Phaser.Physics.Arcade.Body).velocity;
  const vx = velocity.x, vy = velocity.y;
  // The host sends these same child frames, positions and plume phases through WorldMirror.
  const group = scene.add.container(x, y).setDepth(ship.depth + .05).setRotation(ship.rotation)
    .setScale(ship.scaleX, ship.scaleY).setAlpha(ship.alpha)
    .setData('formationCut', cut.name).setData('finishDuringExtraction', true);
  const pieces = logical.map((part, slot) => {
    const anchor = anchors[`${kind}/${bank}/${part}`];
    if (!anchor) return;
    const art = scene.add.image(anchor[0], anchor[1], FORMATION_PARTS, `${kind}/${paint}/${bank}/${part}`);
    group.add(art);
    return { art, anchor, path: cut.paths[slot] };
  });
  const cues = cut.cues.map(([at, part, color, size]) => {
    const image = scene.add.image(0, 0, 'wreck-plumes', color + '/0').setVisible(false).setScale(size);
    group.add(image);
    return { image, at, part, color, played: false };
  });
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? .47 : 1;
  transients.add(group);
  const timeline = scene.tweens.addCounter({
    from: 0, to: cut.duration, duration: cut.duration * 1000,
    onUpdate(tween) {
      const t = tween.getValue() ?? 0;
      group.setPosition(x + vx * t, y + vy * t);
      for (const piece of pieces) {
        if (!piece) continue;
        const [at, dx, dy, spin, roll] = piece.path;
        const age = Math.max(0, t-at), travel = motion * age;
        piece.art.setPosition(piece.anchor[0] + dx * side * travel, piece.anchor[1] + dy * travel)
          .setRotation(spin * side * travel).setScale(.28 + .72 * Math.abs(Math.cos(roll * travel)), 1)
          .setAlpha(Math.min(1, (cut.duration - t) / (cut.duration * .32)));
      }
      for (const cue of cues) {
        const age = t-cue.at, anchor = pieces[cue.part];
        if (!anchor || age < 0 || age >= .4) { cue.image.setVisible(false); continue; }
        cue.image.setVisible(true).setPosition(anchor.art.x, anchor.art.y)
          .setFrame(cue.color + '/' + Math.min(17, Math.floor(age/.4*18))).setAlpha(motion);
        if (!cue.played) {
          cue.played = true;
          if (cue.at > .08) sound(cue.color === 'fire' ? 'rack-ignition' : 'field-collapse', group.x + anchor.art.x * group.scaleX);
        }
      }
    },
    onComplete: () => group.destroy(),
  });
  group.once('destroy', () => { transients.delete(group); timeline.remove(); });
  return true;
}
