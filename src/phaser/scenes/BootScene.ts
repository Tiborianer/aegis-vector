import Phaser from 'phaser';
import { generateTextures } from '../view/generateTextures';
import { publicAssetUrl } from '../../game/assets/publicAsset';
import { SHIP_SIZES, shipFrameSize, shipKey, surfaceKey, ENVIRONMENT_IDS, CLOUD_KEY, environmentAsset } from '../../game/assets/visuals';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    this.load.image('crown-turret', publicAssetUrl('graphics-v2/modules/crown-turret.png'));
    for (const side of ['left', 'right']) this.load.image(`seraph-wing-${side}`, publicAssetUrl(`graphics-v2/modules/seraph-wing-${side}.png`));
    for (const kind of Object.keys(SHIP_SIZES)) {
      const [frameWidth, frameHeight] = shipFrameSize(kind as keyof typeof SHIP_SIZES);
      this.load.spritesheet(shipKey(kind as keyof typeof SHIP_SIZES), publicAssetUrl(`graphics-v2/ships/${kind}.png`), { frameWidth, frameHeight });
    }
    for (const mission of ENVIRONMENT_IDS) this.load.image(surfaceKey(mission), publicAssetUrl(environmentAsset(mission)));
    this.load.image(CLOUD_KEY, publicAssetUrl('graphics-v2/environments/cirrus.webp'));
  }

  create(): void {
    const sourceModulesAvailable = ['crown-turret', 'seraph-wing-left', 'seraph-wing-right'].every((key) => this.textures.exists(key));
    generateTextures(this);
    const available = sourceModulesAvailable
      && Object.keys(SHIP_SIZES).every((kind) => this.textures.exists(shipKey(kind as keyof typeof SHIP_SIZES))
        && this.textures.get(shipKey(kind as keyof typeof SHIP_SIZES)).frameTotal === 17)
      && ENVIRONMENT_IDS.every((mission) => this.textures.exists(surfaceKey(mission)))
      && this.textures.exists(CLOUD_KEY);
    this.registry.set('visualStyle', available ? 'dimensional' : 'classic');
    document.documentElement.dataset.visualStyle = available ? 'dimensional' : 'classic';
    if (!available) {
      console.warn('New graphics unavailable: using built-in recovery artwork.');
      document.documentElement.dataset.visualFallback = 'true';
    } else {
      delete document.documentElement.dataset.visualFallback;
    }
    this.scene.start('battle');
  }
}
