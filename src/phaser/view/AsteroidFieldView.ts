import Phaser from 'phaser';
import {
  asteroidAlpha, asteroidFrame, ASTEROID_REDUCED_MOTION_FACTOR, ASTEROID_TEXTURE_COUNT,
  distantMeteorFrame, makeAsteroidField, sceneryRandom,
  type AsteroidDefinition,
} from '../../game/assets/asteroidField';
import { asteroidRelief } from '../../game/assets/asteroidRelief';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../../game/content/balance';
import type { GraphicsQuality } from '../../game/simulation/types';

/** Runtime-generated native scenery, not a recoloured copy of the prior level.
 * Shading/craters are baked once; runtime only moves and rotates the sprites. */
function prepareAsteroid(scene: Phaser.Scene, index: number): string {
  const key = `last-light-sculpted-asteroid-v3-${index}`;
  if (scene.textures.exists(key)) return key;
  const texture = scene.textures.createCanvas(key, 360, 360);
  if (!texture) return '__WHITE';
  const context = texture.getContext();
  const material = context.createImageData(360, 360);
  material.data.set(asteroidRelief(index + 1, 360));
  context.putImageData(material, 0, 0);
  texture.refresh();
  return key;
}

function prepareStars(scene: Phaser.Scene): string {
  const key = 'last-light-deep-space-v1';
  if (scene.textures.exists(key)) return key;
  const texture = scene.textures.createCanvas(key, 1280, 1280);
  if (!texture) return '__BLACK';
  const context = texture.getContext();
  context.fillStyle = '#030711'; context.fillRect(0, 0, 1280, 1280);
  // Broad remote dust haze without atmospheric cloud cover or a hull surface.
  for (const [x, y, radius, color] of [[210, 300, 520, 'rgba(30,57,82,.30)'], [1030, 930, 480, 'rgba(42,37,65,.25)']] as const) {
    const haze = context.createRadialGradient(x, y, 0, x, y, radius);
    haze.addColorStop(0, color); haze.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = haze; context.fillRect(0, 0, 1280, 1280);
  }
  const random = sceneryRandom(773391);
  for (let i = 0; i < 340; i++) {
    const x = random() * 1280; const y = random() * 1280;
    const radius = i < 14 ? 1.25 : .30 + random() * .75;
    const alpha = i < 14 ? .48 : .12 + random() * .32;
    context.fillStyle = `rgba(${i % 4 === 0 ? '184,174,155' : '162,190,209'},${alpha})`;
    context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
    if (i < 14) {
      context.fillStyle = 'rgba(126,176,209,.04)';
      context.beginPath(); context.arc(x, y, 4, 0, Math.PI * 2); context.fill();
    }
  }
  texture.refresh(); return key;
}

function prepareMeteor(scene: Phaser.Scene): string {
  const key = 'last-light-distant-meteor-v1';
  if (scene.textures.exists(key)) return key;
  const texture = scene.textures.createCanvas(key, 180, 12);
  if (!texture) return '__WHITE';
  const context = texture.getContext();
  const trail = context.createLinearGradient(0, 0, 178, 0);
  trail.addColorStop(0, 'rgba(92,139,158,0)');
  trail.addColorStop(.8, 'rgba(122,163,183,.6)');
  trail.addColorStop(1, 'rgba(201,214,220,.85)');
  context.fillStyle = trail;
  context.beginPath(); context.moveTo(0, 6); context.lineTo(178, 4); context.lineTo(178, 8); context.fill();
  texture.refresh(); return key;
}

export class AsteroidFieldView {
  private readonly stars: Phaser.GameObjects.TileSprite;
  private readonly rocks: Array<{ definition: AsteroidDefinition; view: Phaser.GameObjects.Image }>;
  private readonly meteor: Phaser.GameObjects.Image;
  private readonly reducedMotion: boolean;
  private elapsedMs = 0;
  private enabled = false;

  constructor(scene: Phaser.Scene, quality: GraphicsQuality) {
    this.reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rockKeys = Array.from({ length: ASTEROID_TEXTURE_COUNT }, (_, i) => prepareAsteroid(scene, i));
    this.stars = scene.add.tileSprite(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH + 100, WORLD_HEIGHT + 100, prepareStars(scene))
      .setDepth(-19).setVisible(false);
    this.rocks = makeAsteroidField(quality).map((definition) => ({ definition,
      view: scene.add.image(definition.x, definition.y, rockKeys[definition.shape])
        .setDisplaySize(definition.size, definition.size * definition.stretch)
        .setRotation(definition.rotation).setDepth(definition.depth).setAlpha(definition.alpha).setVisible(false),
    }));
    this.meteor = scene.add.image(-200, -200, prepareMeteor(scene)).setOrigin(1, .5).setRotation(.20).setDepth(-18).setVisible(false);
  }

  setVisible(visible: boolean): void {
    this.enabled = visible; this.elapsedMs = 0;
    this.stars.setVisible(visible);
    this.rocks.forEach(({ view }) => view.setVisible(visible));
    this.meteor.setVisible(false);
    if (visible) this.update(0, 0, 0);
  }

  update(deltaMs: number, follow: number, projectileDensity: number): void {
    if (!this.enabled) return;
    this.elapsedMs += Math.max(0, Math.min(50, deltaMs));
    this.stars.tilePositionY = -this.elapsedMs * (this.reducedMotion ? .0003 : .004);
    this.stars.tilePositionX = this.reducedMotion ? 0 : follow * 4;
    for (const { definition, view } of this.rocks) {
      const frame = asteroidFrame(definition, this.elapsedMs, follow, this.reducedMotion);
      view.setPosition(frame.x, frame.y).setRotation(frame.rotation).setAlpha(asteroidAlpha(definition, projectileDensity));
    }
    const meteor = distantMeteorFrame(this.elapsedMs, this.reducedMotion);
    this.meteor.setVisible(meteor.visible).setPosition(meteor.x, meteor.y).setAlpha(meteor.alpha * (1 - projectileDensity * .6));
  }

  destroy(): void {
    this.stars.destroy(); this.meteor.destroy(); this.rocks.forEach(({ view }) => view.destroy());
  }

  snapshot(): object {
    return { visible: this.enabled, kind: 'deep-space-asteroid-field', elapsedMs: this.elapsedMs,
      reducedMotion: this.reducedMotion, count: this.rocks.length, collision: false,
      rocks: this.rocks.map(({ definition, view }) => ({ id: definition.id, layer: definition.layer,
        size: definition.size, speed: definition.speed * (this.reducedMotion ? ASTEROID_REDUCED_MOTION_FACTOR : 1),
        x: view.x, y: view.y, rotation: view.rotation, depth: view.depth, alpha: view.alpha })),
    };
  }
}
