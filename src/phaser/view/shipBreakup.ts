import type Phaser from 'phaser';
import { BANK_ANGLES, NEUTRAL_BANK, shipKey } from '../../game/assets/visuals';
import { isCommonCraft, paintedWreck, type SquadronPaint } from '../../game/assets/fleetArt';
import catalog from '../../game/assets/ship-breakups.json';

type BreakupShip = keyof typeof catalog;
export const BREAKUP_SHIPS = Object.keys(catalog) as BreakupShip[];
export const isBreakupShip = (kind: string): kind is BreakupShip => Object.hasOwn(catalog, kind);
type Point = { x: number; y: number };
type Bake = { length: number; fps: number; sharedTail: number; rackIgnition?: number; fieldCollapse?: number };

export const breakupKey = (kind: BreakupShip): string => `breakup-${kind}`;
export const breakupAsset = (kind: BreakupShip): string => `graphics-v2/breakups/${kind}`;

/** Start at the incoming side, in the dying ship's pose. Mirroring the breach
 * also reverses its bank. The three entry poses converge on one debris tail. */
export function playShipBreakup(
  scene: Phaser.Scene,
  kind: BreakupShip,
  enemy: Phaser.Physics.Arcade.Sprite,
  impact: Point,
  transientViews: Set<Phaser.GameObjects.GameObject>,
  playSecondary: (cue: 'rack-ignition' | 'field-collapse', x: number) => void,
): boolean {
  const paint = enemy.getData('squadronPaint') as SquadronPaint | undefined;
  const painted = paint && isCommonCraft(kind) ? paintedWreck(kind, paint) : undefined;
  const key = painted && scene.textures.exists(painted) ? painted : breakupKey(kind);
  if ((!paint && enemy.texture.key !== shipKey(kind)) || !scene.textures.exists(key)) return false;
  const { meta: bake } = scene.textures.get(key).customData as { meta?: Bake };
  if (!bake?.length || !bake.fps || !bake.sharedTail) return false;

  const { x, y, rotation, scaleX, scaleY, alpha } = enemy;
  const localX = Math.cos(rotation) * (impact.x - x) + Math.sin(rotation) * (impact.y - y);
  const flip = Math.abs(localX) < 1 ? enemy.getData('entityId') % 2 === 0 : localX > 0;
  const angle = (BANK_ANGLES[Number(enemy.frame.name)] ?? BANK_ANGLES[NEUTRAL_BANK]) * (flip ? -1 : 1);
  const bank = angle < -15 ? -30 : angle > 15 ? 30 : 0;
  const velocity = enemy.body!.velocity;
  const vx = velocity.x, vy = velocity.y;
  const image = scene.add.image(x, y, key, `${bank}/0`)
    .setScale(scaleX, scaleY).setRotation(rotation).setFlipX(flip).setAlpha(alpha).setDepth(enemy.depth + .05);
  transientViews.add(image);
  const secondaryFrame = bake.rackIgnition ?? bake.fieldCollapse;
  const secondaryCue = bake.rackIgnition !== undefined ? 'rack-ignition' : 'field-collapse';
  let lastFrame = 0;
  const clock = scene.tweens.addCounter({
    from: 0, to: bake.length, duration: 1000 * bake.length / bake.fps,
    onUpdate: tween => {
      const value = tween.getValue() ?? 0;
      const frame = Math.min(bake.length - 1, Math.floor(value));
      const seconds = value / bake.fps;
      image.setPosition(x + vx * seconds, y + vy * seconds);
      image.setAlpha(alpha * Math.min(1, (1 - value / bake.length) / .38));
      if (frame === lastFrame) return;
      image.setFrame(`${frame < bake.sharedTail ? bank : 0}/${frame}`);
      if (secondaryFrame !== undefined && lastFrame < secondaryFrame && frame >= secondaryFrame) {
        playSecondary(secondaryCue, image.x);
      }
      lastFrame = frame;
    },
    onComplete: () => image.destroy(),
  });
  image.once('destroy', () => {
    transientViews.delete(image);
    clock.remove();
  });
  return true;
}
