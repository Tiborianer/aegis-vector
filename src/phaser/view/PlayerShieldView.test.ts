import { afterEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
vi.mock('phaser', () => ({ default: {
  BlendModes: { ADD: 1 }, Geom: { Point: class { constructor(public x: number, public y: number) {} } },
} }));
import { PlayerShieldView } from './PlayerShieldView';

function shieldHarness(reducedMotion = false, missingCanvas = false) {
  vi.stubGlobal('window', { matchMedia: () => ({ matches: reducedMotion }) });
  class View {
    visible = true; destroyed = false; x = 0; y = 0; rotation = 0; alpha = 1; width = 0; height = 0;
    commands: Array<{ name: string; args: unknown[] }> = [];
    setDepth() { return this; }
    setBlendMode() { return this; }
    setVisible(visible: boolean) { this.visible = visible; return this; }
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
    setRotation(rotation: number) { this.rotation = rotation; return this; }
    setAlpha(alpha: number) { this.alpha = alpha; return this; }
    setDisplaySize(width: number, height: number) { this.width = width; this.height = height; return this; }
    clear() { this.commands = []; return this; }
    record(name: string, args: unknown[]) { this.commands.push({ name, args }); return this; }
    lineStyle(...args: unknown[]) { return this.record('lineStyle', args); }
    fillStyle(...args: unknown[]) { return this.record('fillStyle', args); }
    fillPoints(...args: unknown[]) { return this.record('fillPoints', args); }
    strokePoints(...args: unknown[]) { return this.record('strokePoints', args); }
    strokeCircle(...args: unknown[]) { return this.record('strokeCircle', args); }
    strokeEllipse(...args: unknown[]) { return this.record('strokeEllipse', args); }
    beginPath() { return this.record('beginPath', []); }
    arc(...args: unknown[]) { return this.record('arc', args); }
    moveTo(...args: unknown[]) { return this.record('moveTo', args); }
    lineTo(...args: unknown[]) { return this.record('lineTo', args); }
    strokePath() { return this.record('strokePath', []); }
    destroy() { this.destroyed = true; }
  }
  const images: View[] = [], graphics: View[] = [], textures = new Set<string>();
  const putImageData = vi.fn(), refresh = vi.fn();
  const createCanvas = vi.fn((key: string) => {
    if (missingCanvas) return null;
    textures.add(key);
    return { getContext: () => ({
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData,
    }), refresh };
  });
  const scene = {
    textures: { exists: (key: string) => textures.has(key), createCanvas },
    add: {
      image: () => { const image = new View(); images.push(image); return image; },
      graphics: () => { const g = new View(); graphics.push(g); return g; },
    },
  };
  return { scene: scene as unknown as Phaser.Scene, images, graphics, createCanvas, putImageData, refresh };
}
afterEach(() => vi.unstubAllGlobals());

describe('round shield view', () => {
  it('bakes the Fresnel material once, remains round and tracks the fighter', () => {
    const h = shieldHarness();
    const shield = new PlayerShieldView(h.scene, 'bubble');
    new PlayerShieldView(h.scene, 'bubble');
    expect(h.createCanvas).toHaveBeenCalledTimes(1);
    expect(h.putImageData).toHaveBeenCalledTimes(1);
    shield.update(240, 500, .15, 2, 3, 1000, true);
    expect(h.images[0]).toMatchObject({ width: 130, height: 130, x: 240, y: 498, visible: true });
    expect(h.graphics[0].commands.some((command) => command.name === 'fillStyle')).toBe(false);
    expect(h.graphics[0].commands.some((command) => command.name === 'strokeCircle')).toBe(true);
  });

  it('hides both layers at zero or outside gameplay and disposes both on teardown', () => {
    const h = shieldHarness();
    const shield = new PlayerShieldView(h.scene, 'bubble');
    shield.hit(1000);
    for (const [cells, visible] of [[0, true], [3, false]] as const) {
      shield.update(240, 500, 0, cells, 3, 1000, visible);
      expect(h.images[0].visible).toBe(false);
      expect(h.graphics[0].visible).toBe(false);
      expect(h.graphics[0].commands).toEqual([]);
    }
    shield.destroy();
    expect(h.images[0].destroyed).toBe(true);
    expect(h.graphics[0].destroyed).toBe(true);
  });

  it('draws a transient curved impact wave without expanding the round boundary', () => {
    const h = shieldHarness();
    const shield = new PlayerShieldView(h.scene, 'bubble');
    shield.hit(1000);
    shield.update(240, 500, 0, 2, 3, 1100, true);
    const wave = h.graphics[0].commands.find((command) => command.name === 'strokeEllipse')!;
    expect(wave).toBeDefined();
    expect(Number(wave.args[2])).toBeLessThanOrEqual(108);
    expect(h.images[0].alpha).toBeLessThanOrEqual(1);
    shield.update(240, 500, 0, 2, 3, 1500, true);
    expect(h.graphics[0].commands.some((command) => command.name === 'strokeEllipse')).toBe(false);
  });

  it.each([0, 45000])('clears a late-run hit before a restart or checkpoint clock resumes at %i ms', (restartAt) => {
    const h = shieldHarness();
    const shield = new PlayerShieldView(h.scene, 'bubble');
    shield.hit(90000);
    shield.update(240, 500, 0, 2, 3, 90100, true);
    expect(h.graphics[0].commands.some((command) => command.name === 'strokeEllipse')).toBe(true);
    shield.reset();
    shield.update(240, 500, 0, 3, 3, restartAt, true);
    expect(h.graphics[0].commands.some((command) => command.name === 'strokeEllipse')).toBe(false);
    shield.hit(restartAt + 200);
    shield.update(240, 500, 0, 2, 3, restartAt + 250, true);
    expect(h.graphics[0].commands.some((command) => command.name === 'strokeEllipse')).toBe(true);
  });

  it('freezes decorative currents under reduced motion and retains explicit hex selection', () => {
    const h = shieldHarness(true);
    const shield = new PlayerShieldView(h.scene, 'bubble');
    shield.update(240, 500, 0, 2, 3, 1000, true);
    const first = h.graphics[0].commands;
    shield.update(240, 500, 0, 2, 3, 6000, true);
    expect(h.graphics[0].commands).toEqual(first);
    shield.setStyle('hex');
    shield.update(240, 500, 0, 2, 3, 6000, true);
    expect(h.images[0].visible).toBe(false);
    expect(h.graphics[0].commands.some((command) => command.name === 'fillPoints')).toBe(true);
  });

  it('falls back to just energy arcs if the canvas texture cannot be allocated', () => {
    const h = shieldHarness(false, true);
    const shield = new PlayerShieldView(h.scene, 'bubble');
    shield.update(240, 500, 0, 2, 3, 1000, true);
    expect(h.images[0].visible).toBe(false);
    expect(h.graphics[0].visible).toBe(true);
  });
});
