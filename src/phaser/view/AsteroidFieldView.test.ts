import { afterEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
vi.mock('phaser', () => ({ default: {} }));
import { AsteroidFieldView } from './AsteroidFieldView';

function fieldHarness(reducedMotion = false) {
  vi.stubGlobal('window', { matchMedia: () => ({ matches: reducedMotion }) });
  const textures = new Set<string>();
  const images: View[] = [];
  const generated = vi.fn();
  class View {
    x: number; y: number; rotation = 0; depth = 0; visible = true; alpha = 1; width = 0; height = 0;
    tilePositionY = 0; tilePositionX = 0; destroyed = false;
    constructor(x: number, y: number, public key: string) { this.x = x; this.y = y; }
    setDisplaySize(width: number, height: number) { this.width = width; this.height = height; return this; }
    setOrigin() { return this; }
    setRotation(rotation: number) { this.rotation = rotation; return this; }
    setDepth(depth: number) { this.depth = depth; return this; }
    setVisible(visible: boolean) { this.visible = visible; return this; }
    setAlpha(alpha: number) { this.alpha = alpha; return this; }
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
    destroy() { this.destroyed = true; }
  }
  const image = (x: number, y: number, key: string) => {
    const view = new View(x, y, key); images.push(view); return view;
  };
  const context = {
    beginPath: vi.fn(), closePath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), arc: vi.fn(),
    save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(), clip: vi.fn(),
    fill: vi.fn(), fillRect: vi.fn(), stroke: vi.fn(),
    createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    putImageData: vi.fn(),
    createLinearGradient: () => ({ addColorStop: vi.fn() }), createRadialGradient: () => ({ addColorStop: vi.fn() }),
  };
  const scene = {
    textures: {
      exists: (key: string) => textures.has(key),
      createCanvas: (key: string) => { generated(key); textures.add(key); return { getContext: () => context, refresh: vi.fn() }; },
    },
    add: { image, tileSprite: (x: number, y: number, _w: number, _h: number, key: string) => image(x, y, key) },
  };
  return { scene: scene as unknown as Phaser.Scene, images, generated };
}

afterEach(() => vi.unstubAllGlobals());

describe('native asteroid scenery renderer', () => {
  it('creates no collision objects, bakes eleven textures once and stays hidden outside the finale', () => {
    const harness = fieldHarness();
    const field = new AsteroidFieldView(harness.scene, 'high');
    expect(harness.images).toHaveLength(26);
    expect(harness.generated).toHaveBeenCalledTimes(11);
    expect(harness.images.every((view) => !view.visible)).toBe(true);
    field.setVisible(true);
    expect(harness.images.filter((view) => view.visible)).toHaveLength(25);
    expect(harness.images.every((view) => view.depth < 0)).toBe(true);
    field.setVisible(false);
    expect(harness.images.every((view) => !view.visible)).toBe(true);
    new AsteroidFieldView(harness.scene, 'low');
    expect(harness.generated).toHaveBeenCalledTimes(11);
  });

  it('moves and rotates through the actual view adapter, and resets repeatably between missions', () => {
    const harness = fieldHarness();
    const field = new AsteroidFieldView(harness.scene, 'balanced');
    field.setVisible(true);
    const first = harness.images.find((view) => view.key.includes('asteroid'))!;
    const initial = { y: first.y, rotation: first.rotation };
    for (let frame = 0; frame < 100; frame++) field.update(20, .4, 0);
    expect(first.y).not.toBe(initial.y);
    expect(first.rotation).not.toBe(initial.rotation);
    field.setVisible(false); field.setVisible(true);
    expect({ y: first.y, rotation: first.rotation }).toEqual(initial);
    field.destroy();
    expect(harness.images.every((view) => view.destroyed)).toBe(true);
  });

  it('honors reduced motion even when high quality is explicitly requested', () => {
    const harness = fieldHarness(true);
    const field = new AsteroidFieldView(harness.scene, 'high');
    field.setVisible(true);
    const rocks = harness.images.filter((view) => view.key.includes('asteroid'));
    const initial = rocks.map(({ x, rotation }) => ({ x, rotation }));
    for (let frame = 0; frame < 700; frame++) field.update(20, .5, 1);
    expect(rocks.map(({ x, rotation }) => ({ x, rotation }))).toEqual(initial);
    expect(harness.images.find((view) => view.key.includes('meteor'))!.visible).toBe(false);
  });
});
