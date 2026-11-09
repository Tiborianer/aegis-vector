import Phaser from 'phaser';
import { shieldPresentation, shieldShellPixels, type ShieldStyle } from './shieldStyles';

function prepareShell(scene: Phaser.Scene): string | undefined {
  const key = 'player-ion-fresnel-shell-v1';
  if (scene.textures.exists(key)) return key;
  const texture = scene.textures.createCanvas(key, 256, 256);
  if (!texture) return undefined;
  const context = texture.getContext();
  const material = context.createImageData(256, 256);
  material.data.set(shieldShellPixels(256));
  context.putImageData(material, 0, 0);
  texture.refresh();
  return key;
}

/** View-only shell: neither style changes the fighter's collision or charges.
 * The spherical material is baked once; only a few energy arcs animate. */
export class PlayerShieldView {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly shell: Phaser.GameObjects.Image;
  private readonly hasShell: boolean;
  private readonly reducedMotion: boolean;
  private lastHitAt = -Infinity;
  constructor(scene: Phaser.Scene, private style: ShieldStyle) {
    this.reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const shellTexture = prepareShell(scene);
    this.hasShell = Boolean(shellTexture);
    this.shell = scene.add.image(0, 0, shellTexture ?? '__WHITE').setDisplaySize(130, 130)
      .setDepth(6.25).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.graphics = scene.add.graphics().setDepth(6.3).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
  }
  setStyle(style: ShieldStyle): void { this.style = style; }
  /** A new mission or checkpoint changes the combat clock's origin. */
  reset(): void { this.lastHitAt = -Infinity; }
  hit(time: number): void { this.lastHitAt = time; }
  update(x: number, y: number, angle: number, cells: number, maximum: number, time: number, visible: boolean): void {
    const state = shieldPresentation(cells, maximum, time - this.lastHitAt, visible);
    const g = this.graphics.clear().setPosition(x, y - 2).setRotation(angle).setVisible(state.visible);
    this.shell.setPosition(x, y - 2).setRotation(angle * .22)
      .setVisible(this.hasShell && state.visible && this.style === 'bubble')
      .setAlpha(Math.min(1, .68 + state.opacity + state.flash * .35));
    if (!state.visible) return;
    const glow = 0x49d9ff, core = 0xc1faff;
    if (this.style === 'bubble') {
      // Round, lightly refractive edge with separated upper/lower speculars.
      // No flat filled disk: the fighter and hostile projectiles remain clear.
      g.lineStyle(.85, glow, .13 + state.flash * .25).strokeCircle(0, 0, 56);
      for (const [start, end, width, alpha] of [[3.65, 4.65, 1.5, .24], [.55, 1.28, .85, .18]] as const) {
        g.lineStyle(width + state.flash, core, alpha + state.flash * .48)
          .beginPath().arc(0, 0, 55, start, end).strokePath();
      }
      // Slow curved currents hug the sphere instead of orbiting as hard rings.
      const flow = this.reducedMotion ? 0 : time * .000055;
      for (let band = 0; band < 2; band++) {
        g.lineStyle(.7, band ? 0xaab7ff : glow, .09 + state.flash * .12).beginPath();
        for (let point = 0; point <= 20; point++) {
          const theta = -.35 + point / 20 * 2.5 + band * Math.PI + flow;
          const px = Math.cos(theta) * 50;
          const py = Math.sin(theta) * 21 + (band ? 8 : -8);
          if (point === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.strokePath();
      }
      if (state.flash > 0) {
        // A wave traverses the curved field after a hit. It contracts at the
        // poles, giving depth without enlarging the apparent collision radius.
        const progress = this.reducedMotion ? .25 : 1 - state.flash;
        const latitude = -.86 + progress * 1.72;
        const width = 108 * Math.sqrt(1 - latitude * latitude);
        g.lineStyle(1.3, 0xebfcff, state.flash * .38)
          .strokeEllipse(0, latitude * 54, width, 7 + (1 - Math.abs(latitude)) * 12);
        g.lineStyle(4, glow, state.flash * .07).strokeCircle(0, 0, 56);
      }
    } else {
      const edge = [[0, -67], [44, -37], [53, 21], [29, 60], [-29, 60], [-53, 21], [-44, -37]].map(([px, py]) => new Phaser.Geom.Point(px, py));
      g.fillStyle(glow, state.opacity * .34).fillPoints(edge, true);
      g.lineStyle(7, glow, .04 + state.flash * .1).strokePoints(edge, true);
      g.lineStyle(1.6 + state.flash, core, .4 + state.flash * .55).strokePoints(edge, true);
      for (const side of [-1, 1]) for (let row = 0; row < 3; row++) {
        const cx = side * (row === 0 ? 29 : 38), cy = -31 + row * 28;
        const hex = Array.from({ length: 6 }, (_, i) => new Phaser.Geom.Point(cx + Math.cos(i * Math.PI / 3) * 10, cy + Math.sin(i * Math.PI / 3) * 10));
        g.lineStyle(1, glow, .13 + state.flash * .37).strokePoints(hex, true);
      }
    }
    // Charge marks remain a quiet secondary readout; they are not extra layers.
    const spacing = Math.min(.32, 1.5 / Math.max(1, maximum));
    const start = Math.PI / 2 - maximum * spacing / 2;
    for (let cell = 0; cell < maximum; cell++) {
      g.lineStyle(2, cell < cells ? core : 0x345e72, cell < cells ? .48 : .10)
        .beginPath().arc(0, 0, this.style === 'bubble' ? 63 : 70,
          start + cell * spacing, start + (cell + .65) * spacing).strokePath();
    }
  }
  destroy(): void { this.graphics.destroy(); this.shell.destroy(); }
}
