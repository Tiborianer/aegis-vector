import type Phaser from 'phaser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MissionId } from '../../game/simulation/types';

const field = vi.hoisted(() => ({ setVisible: vi.fn(), update: vi.fn(), destroy: vi.fn(), snapshot: vi.fn(() => ({ kind: 'deep-space-asteroid-field' })) }));
const construct = vi.hoisted(() => vi.fn());
const surface = vi.hoisted(() => ({ visible: vi.fn(), update: vi.fn(), destroy: vi.fn(), snapshot: vi.fn(() => ({ kind: 'aurora' })) }));
const constructSurface = vi.hoisted(() => vi.fn());
vi.mock('./DimensionalEnvironment', () => ({ SurfacePlane: class {
  constructor(...args: unknown[]) { constructSurface(...args); }
  visible = surface.visible; update = surface.update; destroy = surface.destroy; snapshot = surface.snapshot;
} }));
vi.mock('./AsteroidFieldView', () => ({ AsteroidFieldView: class {
  constructor(...args: unknown[]) { construct(...args); }
  setVisible = field.setVisible;
  update = field.update;
  destroy = field.destroy;
  snapshot = field.snapshot;
} }));
import { ClassicSpaceEnvironment } from './ClassicSpaceEnvironment';

function harness() {
  const scene = {} as Phaser.Scene;
  // Low quality deliberately keeps the foreground hidden. All other Classic
  // layers, including the horizon graphics and ambient wash, begin visible.
  const layers = [true, true, true, true, false, true, true].map((visible) => ({
    visible, setVisible: vi.fn(function (this: { visible: boolean }, next: boolean) { this.visible = next; }),
  }));
  return { scene, layers, environment: new ClassicSpaceEnvironment(scene, 'low', layers) };
}

beforeEach(() => vi.clearAllMocks());

describe('Classic finale space adapter', () => {
  it('leaves all other Classic missions unchanged and allocates no asteroid renderer', () => {
    const { layers, environment } = harness();
    expect(layers.every((layer) => layer.setVisible.mock.calls.length === 0)).toBe(true);
    for (const mission of ['coastal', 'minefield', 'fortress', 'stormbreak', 'graveyard', 'carrierSiege', 'dreadnought'] as MissionId[]) {
      environment.setMission(mission);
      expect(environment.update(16, 640, .7)).toBe(false);
      expect(layers.map(({ visible }) => visible)).toEqual([true, true, true, true, false, true, true]);
    }
    expect(construct).not.toHaveBeenCalled();
    expect(field.update).not.toHaveBeenCalled();
    expect(environment.snapshot()).toMatchObject({ mission: 'dreadnought', classicLayers: [true, true, true, true, false, true, true], asteroidField: undefined });
  });

  it('hides every inherited layer in Last Light and uses the shared quality-aware renderer', () => {
    const { scene, layers, environment } = harness();
    environment.setMission('lastLight');
    expect(layers.every(({ visible }) => !visible)).toBe(true);
    expect(construct).toHaveBeenCalledExactlyOnceWith(scene, 'low');
    expect(field.setVisible).toHaveBeenCalledWith(true);
    expect(environment.update(16, 1000, .6)).toBe(true);
    expect(field.update).toHaveBeenLastCalledWith(16, (1000 - 640) / 1280 * (1 - Math.exp(-16 / 700)), .6);
    expect(environment.snapshot()).toMatchObject({ mission: 'lastLight', classicLayers: Array(7).fill(false), asteroidField: { kind: 'deep-space-asteroid-field' } });
  });

  it('restores exact original layer visibility after the finale and reuses the field on retry', () => {
    const { layers, environment } = harness();
    environment.setMission('lastLight');
    environment.update(40, 1100, 0);
    environment.setMission('fortress');
    expect(layers.map(({ visible }) => visible)).toEqual([true, true, true, true, false, true, true]);
    expect(field.setVisible).toHaveBeenLastCalledWith(false);
    const calls = field.update.mock.calls.length;
    expect(environment.update(40, 1100, 0)).toBe(false);
    expect(field.update).toHaveBeenCalledTimes(calls);
    environment.setMission('lastLight');
    environment.update(0, 640, 0);
    expect(field.update).toHaveBeenLastCalledWith(0, 0, 0);
    expect(field.setVisible).toHaveBeenLastCalledWith(true);
    expect(construct).toHaveBeenCalledTimes(1);
  });

  it('clamps delayed-frame travel and disposes only its own field', () => {
    const { layers, environment } = harness();
    environment.destroy();
    expect(field.destroy).not.toHaveBeenCalled();
    environment.setMission('lastLight');
    environment.update(5000, 640, 0);
    expect(field.update).toHaveBeenLastCalledWith(50, 0, 0);
    environment.update(-16, 640, 0);
    expect(field.update).toHaveBeenLastCalledWith(0, 0, 0);
    environment.destroy();
    expect(field.destroy).toHaveBeenCalledTimes(1);
    expect(layers).toHaveLength(7);
  });
  it('shares the new Aurora surface with Classic and restores ordinary scenery afterward', () => {
    const { scene, layers, environment } = harness();
    environment.setMission('aurora');
    expect(constructSurface).toHaveBeenCalledExactlyOnceWith(scene, 'dimensional-surface-aurora', 1380, -18);
    expect(layers.every(({ visible }) => !visible)).toBe(true);
    expect(environment.update(1000, 640, .8)).toBe(true);
    expect(surface.update.mock.calls.at(-1)?.[0]).toBeCloseTo(1.4);
    expect(surface.update.mock.calls.at(-1)?.[1]).toBe(-0);
    expect(construct).not.toHaveBeenCalled();
    environment.setMission('coastal');
    expect(surface.visible).toHaveBeenLastCalledWith(false);
    expect(environment.update(16, 640, 0)).toBe(false);
    expect(layers.map(({ visible }) => visible)).toEqual([true, true, true, true, false, true, true]);
    environment.destroy();
    expect(surface.destroy).toHaveBeenCalledTimes(1);
  });
});
