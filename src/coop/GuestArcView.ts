import type Phaser from 'phaser';
import { ASSET_KEYS } from '../game/assets/manifest';
import { getArcVolley, WORLD_WIDTH } from '../game/content/balance';
import { ARC_BOLT_SPEED, arcPattern, wingArcTrigger, type ArcPart, type WingArcState } from './wingArc';

interface Bolt {
  image?: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  target?: { x: number; y: number; time: number; frame: number };
}
interface Volley {
  press: number;
  index: number;
  bolts: Bolt[];
}

/** Guest-only pictures. These objects never enter a physics group or touch the game model. */
export class GuestArcView {
  private volleys = new Map<string, Volley>();
  private clock = 0;
  private nextAt = 0;
  private total = 0;

  constructor(private scene: Phaser.Scene, private muzzle: (x: number, y: number, gold: boolean) => void) {}

  update(delta: number, state: WingArcState, fire: boolean, level: number, x: number, y: number): void {
    this.clock += delta;
    if (fire && this.clock >= this.nextAt) {
      this.nextAt = this.clock + state.intervalMs;
      const id = wingArcTrigger.next(state.session);
      this.total++;
      const gold = state.overdrive || (state.helios && this.total % 8 === 0);
      const texture = gold ? ASSET_KEYS.playerBulletOverdrive : ASSET_KEYS.playerBullet;
      const bolts = arcPattern(getArcVolley(level).angles, state.split).map(part => ({
        image: this.scene.add.image(x + part.x, y + part.y, texture).setRotation(part.angle).setDepth(4),
        vx: Math.sin(part.angle) * ARC_BOLT_SPEED, vy: -Math.cos(part.angle) * ARC_BOLT_SPEED,
      }));
      this.volleys.set(id, { press: wingArcTrigger.press, index: wingArcTrigger.volley, bolts });
      this.muzzle(x, y - 42, gold);
      if (wingArcTrigger.firstSound(id))
        window.dispatchEvent(new CustomEvent('aegis:sound', { detail: { cue: 'arc-fire', wingArc: id } }));
      // Keep identities after an image leaves the screen so a late reply cannot fire it again.
      if (this.volleys.size > 128) {
        const [oldest, volley] = this.volleys.entries().next().value!;
        volley.bolts.forEach(bolt => bolt.image?.destroy());
        this.volleys.delete(oldest);
      }
    }
    const dt = Math.min(delta, 50) / 1000;
    const now = performance.now();
    for (const volley of this.volleys.values()) for (const bolt of volley.bolts) {
      const image = bolt.image;
      if (!image) continue;
      image.x += bolt.vx * dt;
      image.y += bolt.vy * dt;
      if (bolt.target) {
        const age = Math.min(0.12, (now - bolt.target.time) / 1000);
        // Ease onto the confirmed trajectory without jumping backwards through the muzzle.
        const limit = ARC_BOLT_SPEED * 0.65 * dt;
        image.x += Math.max(-limit, Math.min(limit, bolt.target.x + bolt.vx * age - image.x));
        image.y += Math.max(-limit, Math.min(limit, bolt.target.y + bolt.vy * age - image.y));
      }
      if (image.y < -80 || image.x < -80 || image.x > WORLD_WIDTH + 80) this.retire(bolt);
    }
  }

  /** Match the host's flash or bolt to the corresponding local visual, including expired ones. */
  match([id, pellet]: ArcPart, x: number, y: number, texture: string | undefined, time: number, frame: number): boolean {
    const volley = this.volleys.get(id);
    if (!volley) return false;
    if (pellet < 0) return true;
    const bolt = volley.bolts[pellet];
    if (!bolt) return false; // An upgrade the guest had not received yet added a pellet.
    bolt.target = { x, y, time, frame };
    if (bolt.image && texture && bolt.image.texture.key !== texture && this.scene.textures.exists(texture))
      bolt.image.setTexture(texture);
    return true;
  }

  confirm(state: WingArcState, frame: number): void {
    if (state.press === wingArcTrigger.press && state.volley > wingArcTrigger.volley)
      this.nextAt = this.clock + state.intervalMs;
    wingArcTrigger.synchronize(state);
    this.total = Math.max(this.total, state.total);
    for (const volley of this.volleys.values()) {
      const decided = state.press > volley.press ||
        (state.press === volley.press && (state.volley >= volley.index || !state.held));
      if (decided) for (const bolt of volley.bolts)
        if (bolt.image && bolt.target?.frame !== frame) this.retire(bolt);
    }
  }

  private retire(bolt: Bolt): void {
    bolt.image?.destroy();
    bolt.image = undefined;
  }

  clear(): void {
    for (const volley of this.volleys.values()) volley.bolts.forEach(bolt => this.retire(bolt));
    this.volleys.clear();
    this.clock = this.nextAt = this.total = 0;
  }
}
