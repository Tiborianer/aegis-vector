import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
vi.mock('phaser', () => ({ default: {} }));
import { SurfacePlane } from './DimensionalEnvironment';

function surfaceHarness() {
  const sources: Record<string, { width: number; height: number }> = {
    minefield: { width: 1280, height: 1280 }, fortress: { width: 1024, height: 1536 },
  };
  const contexts: { drawImage: ReturnType<typeof vi.fn>; refresh: ReturnType<typeof vi.fn>; gradient: ReturnType<typeof vi.fn> }[] = [];
  const images: FakeImage[] = [];
  class FakeImage {
    x = 0; y = 0; depth = 0; flipY = false; alpha = 1; visible = true; width = 0; height = 0;
    constructor(public texture: string) {}
    setOrigin() { return this; }
    setDisplaySize(width: number, height: number) { this.width = width; this.height = height; return this; }
    setDepth(value: number) { this.depth = value; return this; }
    setFlipY(value: boolean) { this.flipY = value; return this; }
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
    setTexture(value: string) { this.texture = value; return this; }
    setTint() { return this; }
    setAlpha(value: number) { this.alpha = value; return this; }
    setVisible(value: boolean) { this.visible = value; return this; }
    destroy() {}
  }
  const scene = {
    textures: {
      exists: (key: string) => Boolean(sources[key]),
      get: (key: string) => ({ getSourceImage: () => sources[key] }),
      createCanvas: (key: string, width: number, height: number) => {
        sources[key] = { width, height };
        const drawImage = vi.fn(); const refresh = vi.fn(); const gradient = vi.fn();
        contexts.push({ drawImage, refresh, gradient });
        const context = { save: vi.fn(), restore: vi.fn(), drawImage, fillRect: vi.fn(),
          createLinearGradient: () => ({ addColorStop: gradient }) };
        return { getContext: () => context, refresh };
      },
    },
    add: { image: (_x: number, _y: number, key: string) => {
      const image = new FakeImage(key); images.push(image); return image;
    } },
  };
  return { scene: scene as unknown as Phaser.Scene, images, contexts, sources };
}

describe('forward-only scenery renderer', () => {
  it('never flips either scenery image through multiple scroll cycles', () => {
    const harness = surfaceHarness();
    const plane = new SurfacePlane(harness.scene, 'minefield', 1380, -18);
    for (let step = 0; step < 600; step++) {
      plane.update(19, 0);
      expect(harness.images.every((image) => image.flipY === false)).toBe(true);
      const [upper, lower] = [...harness.images].sort((a,b) => a.y-b.y);
      expect(lower.depth).toBeGreaterThan(upper.depth);
      expect(upper.y+upper.height).toBeGreaterThan(lower.y);
    }
    expect(plane.snapshot().orientation).toBe('authored-forward');
    expect(harness.contexts).toHaveLength(1);
    expect(harness.contexts[0].drawImage).toHaveBeenCalledWith(harness.sources.minefield, 0, 0);
    expect(harness.contexts[0].refresh).toHaveBeenCalledTimes(1);
    expect(harness.contexts[0].gradient.mock.calls).toEqual([
      [0, 'rgba(0,0,0,1)'], [.25, 'rgba(0,0,0,.84)'], [.75, 'rgba(0,0,0,.16)'], [1, 'rgba(0,0,0,0)'],
    ]);
  });

  it('refreshes aspect ratio on mission changes and reuses prepared textures', () => {
    const harness = surfaceHarness();
    const plane = new SurfacePlane(harness.scene, 'minefield', 1380, -18);
    plane.setTexture('fortress');
    expect(harness.images.map((image) => image.height)).toEqual([2070,2070]);
    expect(plane.snapshot().flipY).toEqual([false,false]);
    expect(plane.snapshot().blendHeight).toBe(207);
    expect(harness.contexts).toHaveLength(2);
    plane.setTexture('minefield');
    expect(harness.contexts).toHaveLength(2);
    expect(harness.images.map((image) => image.height)).toEqual([1380,1380]);
    expect(plane.snapshot().offset).toBe(0);
  });

  it('softens both cloud edges so the translucent overlap has no hard trailing cut', () => {
    const harness = surfaceHarness();
    new SurfacePlane(harness.scene, 'minefield', 1640, -12, true);
    expect(harness.contexts[0].gradient.mock.calls.slice(4)).toEqual([
      [0, 'rgba(0,0,0,0)'], [.25, 'rgba(0,0,0,.16)'], [.75, 'rgba(0,0,0,.84)'], [1, 'rgba(0,0,0,1)'],
    ]);
    expect(harness.images.every((image) => image.texture.endsWith('-soft-tail'))).toBe(true);
  });
});
