import Phaser from 'phaser';
import type { ChargeLevel } from '../../coop/wingArc';
import { FIELD_EDGE, fieldLight, SHIELD_BREAK_MS, SHIELD_RESTORE_MS, type ShieldStyle } from './shieldStyles';

/** These short line segments are mirrored alongside the pilot on the guest. */
export class PlayerShieldView {
  private readonly field: Phaser.GameObjects.Graphics;
  private readonly nose: Phaser.GameObjects.Graphics;
  private readonly reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private lastHitAt = -Infinity;
  private lastBreakAt = -Infinity;
  private lastRestoreAt = -Infinity;
  private direction = -Math.PI/2;
  private previousCells?: number;
  private level: ChargeLevel = 0;
  constructor(scene: Phaser.Scene, _style: ShieldStyle) {
    this.field = scene.add.graphics().setDepth(6.25).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.nose = scene.add.graphics().setDepth(6.4).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
  }
  get objects(): Phaser.GameObjects.GameObject[] { return [this.field, this.nose]; }
  charge(level: ChargeLevel): void { this.level = level; }
  reset(): void {
    this.lastHitAt = this.lastBreakAt = this.lastRestoreAt = -Infinity;
    this.previousCells = undefined;
    this.level = 0;
    for (const view of [this.field, this.nose]) view.clear().setVisible(false);
  }
  hit(time: number, direction = -Math.PI/2, broken = false): void {
    this.direction = direction;
    this.lastHitAt = time;
    this.lastRestoreAt = -Infinity;
    if (broken) this.lastBreakAt = time;
  }
  update(x: number, y: number, angle: number, cells: number, maximum: number, time: number, visible: boolean): void {
    if (this.previousCells !== undefined && cells > this.previousCells) {
      this.lastBreakAt = this.lastHitAt = -Infinity;
      this.lastRestoreAt = time;
    }
    this.previousCells = cells;
    const breaking = Math.max(0, 1 - (time - this.lastBreakAt) / SHIELD_BREAK_MS);
    const restoring = Math.max(0, 1 - (time - this.lastRestoreAt) / SHIELD_RESTORE_MS);
    const g = this.field.clear().setPosition(x,y).setRotation(angle).setVisible(visible && (cells > 0 || breaking > 0));
    const nose = this.nose.clear().setPosition(x,y).setRotation(angle).setVisible(visible && this.level > 0);
    if (nose.visible) {
      nose.lineStyle(this.level === 2 ? 3 : 2, this.level === 2 ? 0xffdea0 : 0x9efbff, .98)
        .lineBetween(-3, -40, 0, -45).lineBetween(0, -45, 3, -40);
      if (this.level === 2) nose.lineStyle(2, 0xffffff, .92).lineBetween(0,-48,0,-53);
    }
    if (!g.visible) return;
    const count = FIELD_EDGE.length - 1;
    for (const side of [-1, 1]) for (let i=0; i<count; i++) {
      const [ax,ay] = FIELD_EDGE[i], [bx,by] = FIELD_EDGE[i+1];
      const theta = Math.atan2(ay+by, side*(ax+bx));
      const flash = fieldLight(this.direction, theta, time-this.lastHitAt);
      const chargeWave = restoring * Math.max(0, 1 - Math.abs((1-restoring) - (count-i)/count)*3.5);
      const base = cells > 0 ? .17 + .07 * cells/Math.max(1,maximum) : 0;
      const alpha = Math.min(1, base + flash*.87 + chargeWave*.9 + breaking*.4);
      const gap = breaking && !this.reduced ? (1-breaking)*.62 : .09;
      const factor = breaking && !this.reduced ? 1 + (1-breaking)*.29 : 1;
      const x1 = (ax + (bx-ax)*gap)*side*factor, y1 = (ay + (by-ay)*gap)*factor;
      const x2 = bx*side*factor, y2 = by*factor;
      const color = breaking ? 0xffb783 : restoring ? 0xa4ffe6 : 0x80e9ff;
      g.lineStyle(4, color, alpha*.20).lineBetween(x1,y1,x2,y2);
      g.lineStyle(flash > .4 ? 3.5 : 1.35, flash > .55 ? 0xf3ffff : color, alpha).lineBetween(x1,y1,x2,y2);
    }
    // Small stern ticks count remaining cells without occupying the weapon nose.
    for (let i=0; i<Math.min(7,cells); i++) {
      const xx=(i-(Math.min(7,cells)-1)/2)*4;
      g.lineStyle(1.8, 0xb3f5ff, .8).lineBetween(xx,38,xx,41);
    }
  }
  destroy(): void { this.field.destroy(); this.nose.destroy(); }
}
