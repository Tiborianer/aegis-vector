import type Phaser from 'phaser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GuestArcView } from './GuestArcView';
import { arcInterval, wingArcTrigger as trigger, type WingArcState } from './wingArc';

const state = (change: Partial<WingArcState> = {}): WingArcState => ({
  session: trigger.session, press: trigger.press, volley: 0, held: true, intervalMs: 142,
  split: false, overdrive: false, helios: false, total: 0, ...change,
});

function setup() {
  function image(x: number, y: number, key: string) {
    return { x, y, texture: { key }, destroy: vi.fn(), setRotation() { return this; },
      setDepth() { return this; }, setTexture(key: string) { this.texture.key = key; } };
  }
  const add = vi.fn(image), flash = vi.fn();
  const view = new GuestArcView({ add: { image: add }, textures: { exists: () => true } } as unknown as Phaser.Scene, flash);
  return { view, add, flash };
}

describe('wingmate ARC presentation', () => {
  beforeEach(() => {
    trigger.connect();
    vi.stubGlobal('window', new EventTarget());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('latches a short tap until the next frame without rearming from keyboard repeat', () => {
    trigger.set(true, true); trigger.set(true, true); trigger.set(false, true);
    expect(trigger.press).toBe(1);
    expect(trigger.awaitingRelease).toBe(true);
    expect(trigger.takeTap()).toBe(true);
    expect(trigger.takeTap()).toBe(false);
    expect(trigger.awaitingRelease).toBe(false);
    trigger.set(true, false); trigger.set(false, false);
    expect(trigger.takeTap()).toBe(false);
  });

  it('retires a denied tap without taking the next press or duplicating a hit-before-snapshot bolt', () => {
    const { view, add } = setup();
    trigger.set(true, true);
    view.update(16, state(), true, 1, 780, 610);
    const first = add.mock.results[0].value;
    trigger.set(false, true);
    view.confirm(state({ held: false }), 10);
    expect(first.destroy).toHaveBeenCalledOnce();
    trigger.set(true, true);
    view.update(16, state(), true, 1, 780, 610);
    expect(add).toHaveBeenCalledTimes(1); // still cooling down
    view.update(145, state(), true, 1, 780, 610);
    const nextID = [trigger.session, 2, 1].join('/');
    view.confirm(state({ volley: 1 }), 20);
    expect(add.mock.results[1].value.destroy).toHaveBeenCalledOnce();
    expect(view.match([nextID, 0], 780, 550, undefined, 21, 5)).toBe(true);
    expect(view.match([nextID, -1], 780, 568, undefined, 21, 5)).toBe(true);
    expect(view.match(['unpredicted', 0], 780, 550, undefined, 21, 5)).toBe(false);
  });

  it('keeps one moving image on late confirmation, follows authoritative removal and preserves extra host pellets', () => {
    const { view, add } = setup();
    trigger.set(true, true);
    view.update(16, state(), true, 1, 780, 610);
    const id = [trigger.session, 1, 1].join('/');
    for (let i = 0; i < 10; i++) view.update(16, state(), false, 1, 780, 610);
    const bolt = add.mock.results[0].value, oldY = bolt.y, time = performance.now();
    expect(view.match([id, 0], 780, 560, 'confirmed', time, 4)).toBe(true);
    expect(view.match([id, 1], 790, 560, undefined, time, 4)).toBe(false);
    view.confirm(state({ volley: 1 }), 4);
    view.update(16, state(), false, 1, 780, 610);
    expect(bolt.y).toBeLessThan(oldY);
    expect(bolt.texture.key).toBe('confirmed');
    expect(add).toHaveBeenCalledOnce();
    expect(bolt.destroy).not.toHaveBeenCalled();
    view.confirm(state({ volley: 1 }), 5);
    expect(bolt.destroy).toHaveBeenCalledOnce();
  });

  it('accepts an early host volley once and gives a reconnect a new identity', () => {
    const { view, flash } = setup();
    trigger.set(true, true);
    const first = [trigger.session, 1, 1].join('/');
    expect(trigger.firstSound(first)).toBe(true);
    view.confirm(state({ volley: 1, total: 1 }), 10);
    view.update(16, state(), true, 1, 100, 300);
    expect(flash).not.toHaveBeenCalled();
    expect(trigger.firstSound(first)).toBe(false);
    trigger.connect(); trigger.set(true, true);
    const fresh = trigger.next(trigger.session);
    expect(fresh).not.toBe(first);
    expect(trigger.firstSound(fresh)).toBe(true);
    expect(arcInterval(94, 0.5)).toBe(62);
  });
});
