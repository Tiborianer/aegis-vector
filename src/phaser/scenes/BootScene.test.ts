import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: { Scene: class {} } }));
vi.mock('../view/generateTextures', () => ({ generateTextures: vi.fn() }));
import { BootScene } from './BootScene';
import { generateTextures } from '../view/generateTextures';
import { CLOUD_KEY, ENVIRONMENT_IDS, SHIP_SIZES, shipFrameSize, shipKey } from '../../game/assets/visuals';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('approved artwork boot and internal recovery', () => {
  it('preloads every new ship and surface even when an old URL requests Classic', () => {
    vi.stubGlobal('window', { location: { search: '?visuals=classic' } });
    const scene = new BootScene();
    const image = vi.fn(), spritesheet = vi.fn();
    Object.assign(scene, { load: { image, spritesheet } });
    scene.preload();
    expect(spritesheet).toHaveBeenCalledTimes(Object.keys(SHIP_SIZES).length);
    expect(image).toHaveBeenCalledTimes(3 + ENVIRONMENT_IDS.length + 1);
    expect(image).toHaveBeenCalledWith(CLOUD_KEY, expect.any(String));
    for (const kind of Object.keys(SHIP_SIZES) as Array<keyof typeof SHIP_SIZES>) {
      const [frameWidth, frameHeight] = shipFrameSize(kind);
      expect(spritesheet).toHaveBeenCalledWith(shipKey(kind), expect.any(String), { frameWidth, frameHeight });
    }
  });
  it.each([undefined, 'seraph-wing-left', 'seraph-wing-right', 'crown-turret'])(
    'checks original source modules before procedural fallback generation (%s)', (missing) => {
      vi.stubGlobal('window', { location: { search: '?visuals=dimensional' } });
      const dataset: Record<string, string> = { visualFallback: 'true' };
      vi.stubGlobal('document', { documentElement: { dataset } });
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
      let generated = false;
      vi.mocked(generateTextures).mockImplementation(() => { generated = true; });
      const scene = new BootScene();
      const set = vi.fn(), start = vi.fn();
      Object.assign(scene, {
        textures: { exists: (key: string) => generated || key !== missing, get: () => ({ frameTotal: 17 }) },
        registry: { set }, scene: { start },
      });
      scene.create();
      expect(set).toHaveBeenCalledWith('visualStyle', missing ? 'classic' : 'dimensional');
      expect(start).toHaveBeenCalledWith('battle');
      expect(warning).toHaveBeenCalledTimes(missing ? 1 : 0);
      expect(dataset.visualFallback).toBe(missing ? 'true' : undefined);
    });
});
