import Phaser from 'phaser';
import { squadInput } from './input';
import { GuestArcView } from './GuestArcView';
import { wingArcTrigger, type ArcPart, type WingArcState } from './wingArc';
import type { GameSnapshot } from '../game/simulation/types';
import { PLAYER_COMBAT_MIN_Y, WORLD_HEIGHT, WORLD_WIDTH } from '../game/content/balance';

interface Drawing {
  id: number;
  kind: 'image' | 'graphics' | 'text' | 'ellipse' | 'rectangle';
  x: number;
  y: number;
  z: number;
  r: number;
  sx: number;
  sy: number;
  a: number;
  key?: string;
  frame?: string | number;
  text?: string;
  color?: number;
  corners?: [number, number, number, number];
  fillAlpha?: number;
  strokeAlpha?: number;
  flipX?: boolean;
  flipY?: boolean;
  line?: number;
  lw?: number;
  width?: number;
  height?: number;
  ox?: number;
  oy?: number;
  commands?: number[];
  track?: boolean;
  add?: boolean;
  arc?: ArcPart;
}
export interface WorldFrame {
  seq: number;
  state: GameSnapshot;
  items: Drawing[];
  self: number;
  wingArc?: WingArcState;
}
export const connection: {
  role?: 'host' | 'guest';
  publish?: (frame: WorldFrame) => void;
  receive?: (frame: WorldFrame) => void;
  connected: boolean;
  guestInFlight: boolean;
} = { connected: false, guestInFlight: false };
const lengths: Record<number, number> = {
  0: 7,
  1: 0,
  2: 0,
  3: 4,
  4: 2,
  5: 2,
  6: 3,
  7: 2,
  8: 0,
  9: 0,
  10: 6,
  11: 6,
  14: 0,
  15: 0,
  16: 2,
  17: 2,
  18: 1,
  21: 8,
  22: 6,
};
function safeCommands(values: unknown): values is number[] {
  if (!Array.isArray(values) || values.length > 5000) return false;
  for (let i = 0; i < values.length;) {
    const op = values[i++],
      n = lengths[op];
    if (n === undefined || i + n > values.length) return false;
    for (let j = 0; j < n; j++)
      if (!Number.isFinite(values[i + j]) || Math.abs(values[i + j]) > 0xffffff) return false;
    if (
      op === 0 &&
      (values[i + 6] < 0 || values[i + 6] > 1 || Math.abs(values[i + 3]) > 100 || Math.abs(values[i + 4]) > 100)
    )
      return false;
    i += n;
  }
  return true;
}
const q = (n: number) => Math.round(n * 100) / 100;
type Visual =
  | Phaser.GameObjects.Image
  | Phaser.GameObjects.Graphics
  | Phaser.GameObjects.Text
  | Phaser.GameObjects.Ellipse
  | Phaser.GameObjects.Rectangle;
export class WorldMirror {
  private ids = new WeakMap<Phaser.GameObjects.GameObject, number>();
  private next = 0;
  private seq = 0;
  private objects = new Map<number, { obj: Visual; fromX: number; fromY: number; item: Drawing }>();
  private received = 0;
  private frame?: WorldFrame;
  private displayX = 0;
  private displayY = 0;
  private lastSeq = -1;
  private arc: GuestArcView;
  constructor(private scene: Phaser.Scene, muzzle: (x: number, y: number, gold: boolean) => void) {
    this.arc = new GuestArcView(scene, muzzle);
  }
  private id(o: Phaser.GameObjects.GameObject) {
    let id = this.ids.get(o);
    if (id === undefined) {
      id = ++this.next;
      this.ids.set(o, id);
    }
    return id;
  }
  capture(
    state: GameSnapshot,
    self: Phaser.GameObjects.Sprite,
    attachments: Set<Phaser.GameObjects.GameObject>,
    wingArc: WingArcState,
  ): WorldFrame {
    const items: Drawing[] = [];
    const collect = (o: Phaser.GameObjects.GameObject, depth: number, parentAlpha: number) => {
      if (items.length >= 600) return;
      if (o instanceof Phaser.GameObjects.Container) {
        if (o.visible && o.alpha > 0)
          o.list.forEach((child) => collect(child, depth + 0.01, parentAlpha * o.alpha));
        return;
      }
      if (
        !(
          o instanceof Phaser.GameObjects.Image ||
          o instanceof Phaser.GameObjects.Sprite ||
          o instanceof Phaser.GameObjects.Graphics ||
          o instanceof Phaser.GameObjects.Text ||
          o instanceof Phaser.GameObjects.Arc ||
          o instanceof Phaser.GameObjects.Ellipse ||
          o instanceof Phaser.GameObjects.Rectangle
        ) ||
        !o.visible ||
        o.alpha <= 0
      )
        return;
      const t = o.parentContainer ? o.getWorldTransformMatrix() : undefined;
      const d: Drawing = {
        id: this.id(o),
        kind: 'image',
        x: q(t ? t.tx : o.x),
        y: q(t ? t.ty : o.y),
        z: depth,
        r: q(t ? t.rotation : o.rotation),
        sx: q(t ? t.scaleX : o.scaleX),
        sy: q(t ? t.scaleY : o.scaleY),
        a: q(o.alpha * parentAlpha),
      };
      if (o.blendMode === Phaser.BlendModes.ADD) d.add = true;
      if (attachments.has(o)) d.track = true;
      const arc = o.data?.get('wingArc') as ArcPart | undefined;
      if (arc) d.arc = arc;
      if (o instanceof Phaser.GameObjects.Graphics) {
        const values = o.commandBuffer.map(Number);
        if (!values.length || !safeCommands(values)) return;
        d.kind = 'graphics';
        d.commands = values;
      } else if (o instanceof Phaser.GameObjects.Text) {
        d.kind = 'text';
        d.text = o.text.slice(0, 100);
        d.color = Number.parseInt(String(o.style.color).replace('#', ''), 16) || 0xd6f3ff;
      } else if (
        o instanceof Phaser.GameObjects.Arc ||
        o instanceof Phaser.GameObjects.Ellipse ||
        o instanceof Phaser.GameObjects.Rectangle
      ) {
        d.kind = o instanceof Phaser.GameObjects.Rectangle ? 'rectangle' : 'ellipse';
        d.width = q(o.width);
        d.height = q(o.height);
        d.color = o.fillColor;
        d.fillAlpha = o.isFilled ? q(o.fillAlpha) : 0;
        d.strokeAlpha = q(o.strokeAlpha);
        d.line = o.strokeColor;
        d.lw = o.isStroked ? o.lineWidth : 0;
      } else {
        d.key = o.texture.key;
        d.frame = o.frame.name;
        d.ox = q(o.originX);
        d.oy = q(o.originY);
        if (o.isTinted) d.corners = [o.tintTopLeft, o.tintTopRight, o.tintBottomLeft, o.tintBottomRight];
        if (o.flipX) d.flipX = true;
        if (o.flipY) d.flipY = true;
      }
      items.push(d);
    };
    for (const o of this.scene.children.list) {
      const d = (o as Phaser.GameObjects.Image).depth;
      if (d >= 1) collect(o, d, 1);
    }
    return { seq: ++this.seq, state, items, self: this.id(self), wingArc };
  }
  accept(f: WorldFrame): void {
    if (!Array.isArray(f?.items) || f.items.length > 600 || !f.state?.squad || f.seq <= this.lastSeq) return;
    const was = this.frame;
    this.frame = f;
    this.lastSeq = f.seq;
    this.received = performance.now();
    if (f.state.missionId !== was?.state.missionId || f.wingArc?.session !== was?.wingArc?.session ||
      (was && f.state.stageElapsedMs < was.state.stageElapsedMs))
      this.arc.clear();
    const live = new Set<number>();
    for (const it of f.items) {
      if (!it || !Number.isFinite(it.x) || !Number.isFinite(it.y) || !Number.isFinite(it.id)) continue;
      if (it.arc && this.arc.match(it.arc, it.x, it.y, it.key, this.received, f.seq)) continue;
      let v = this.objects.get(it.id);
      if (!v) {
        let obj: Visual;
        if (it.kind === 'image' && it.key && this.scene.textures.exists(it.key))
          obj = this.scene.add.image(it.x, it.y, it.key, it.frame);
        else if (it.kind === 'graphics') obj = this.scene.add.graphics();
        else if (it.kind === 'text')
          obj = this.scene.add
            .text(0, 0, '', {
              fontFamily: 'system-ui',
              fontSize: '15px',
              fontStyle: 'bold',
              stroke: '#071321',
              strokeThickness: 4,
            })
            .setOrigin(0.5);
        else if (it.kind === 'ellipse') obj = this.scene.add.ellipse(0, 0, it.width, it.height, it.color);
        else if (it.kind === 'rectangle') obj = this.scene.add.rectangle(0, 0, it.width, it.height, it.color);
        else continue;
        v = { obj, fromX: it.x, fromY: it.y, item: it };
        this.objects.set(it.id, v);
        obj.setPosition(it.x, it.y);
      }
      const obj = v.obj;
      live.add(it.id);
      v.fromX = obj.x;
      v.fromY = obj.y;
      v.item = it;
      obj
        .setDepth(it.z)
        .setRotation(it.r)
        .setScale(it.sx, it.sy)
        .setAlpha(it.a)
        .setBlendMode(it.add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
      if (obj instanceof Phaser.GameObjects.Image && it.key && this.scene.textures.exists(it.key)) {
        obj.setTexture(it.key, it.frame).setOrigin(it.ox, it.oy).setFlip(Boolean(it.flipX), Boolean(it.flipY));
        if (Array.isArray(it.corners) && it.corners.length === 4) obj.setTint(...it.corners);
        else obj.clearTint();
      }
      if (obj instanceof Phaser.GameObjects.Graphics && safeCommands(it.commands)) obj.commandBuffer = it.commands;
      if (obj instanceof Phaser.GameObjects.Text)
        obj
          .setText(it.text?.slice(0, 100) || '')
          .setColor('#' + (it.color ?? 0xffffff).toString(16).padStart(6, '0'));
      if (obj instanceof Phaser.GameObjects.Ellipse || obj instanceof Phaser.GameObjects.Rectangle) {
        if (
          it.width !== undefined &&
          it.height !== undefined &&
          (obj.width !== it.width || obj.height !== it.height)
        )
          obj.setSize(it.width, it.height);
        obj
          .setFillStyle(it.color, it.fillAlpha ?? 1)
          .setStrokeStyle(it.lw || 0, it.line || 0, it.strokeAlpha ?? 1);
      }
    }
    for (const [id, v] of this.objects)
      if (!live.has(id)) {
        v.obj.destroy();
        this.objects.delete(id);
      }
    const pilot = f.state.squad.pilots[1];
    if (f.wingArc) this.arc.confirm(f.wingArc, f.seq);
    if (
      !was ||
      was.state.missionId !== f.state.missionId ||
      Math.hypot(this.displayX - pilot.x, this.displayY - pilot.y) > 160
    ) {
      this.displayX = pilot.x;
      this.displayY = pilot.y;
    }
  }
  update(delta: number): void {
    const f = this.frame;
    if (!f?.state.squad) return;
    const pilot = f.state.squad.pilots[1],
      axis = squadInput.axes(1);
    const d = Math.max(1, Math.hypot(axis.x, axis.y)),
      dt = Math.min(50, delta) / 1000;
    const age = Math.min(0.12, (performance.now() - this.received) / 1000);
    const moving = f.state.mode === 'playing' && !pilot.down;
    const vx = moving ? (axis.x / d) * 430 : 0,
      vy = moving ? (axis.y / d) * 430 : 0;
    const blend = 1 - Math.exp(-dt * 16);
    this.displayX = Phaser.Math.Clamp(
      this.displayX + vx * dt + (pilot.x + vx * age - this.displayX) * blend,
      36,
      WORLD_WIDTH - 36,
    );
    this.displayY = Phaser.Math.Clamp(
      this.displayY + vy * dt + (pilot.y + vy * age - this.displayY) * blend,
      PLAYER_COMBAT_MIN_Y,
      WORLD_HEIGHT - 30,
    );
    const tap = wingArcTrigger.takeTap();
    if (f.wingArc && connection.connected && connection.guestInFlight && f.state.mode === 'playing') {
      const fresh = performance.now() - this.received < 1500;
      this.arc.update(delta, f.wingArc, fresh && !pilot.down && (axis.fire || tap),
        pilot.weapons.spread, this.displayX, this.displayY);
    }
    const mix = Math.min(1, age / 0.05);
    for (const [id, { obj, item, fromX, fromY }] of this.objects) {
      if (id === f.self) obj.setPosition(this.displayX, this.displayY);
      else if (item.track) obj.setPosition(item.x + this.displayX - pilot.x, item.y + this.displayY - pilot.y);
      else obj.setPosition(fromX + (item.x - fromX) * mix, fromY + (item.y - fromY) * mix);
    }
  }
  clear(): void {
    this.arc.clear();
    for (const { obj } of this.objects.values()) obj.destroy();
    this.objects.clear();
    this.frame = undefined;
    this.lastSeq = -1;
  }
}
