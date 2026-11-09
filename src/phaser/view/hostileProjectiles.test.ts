import { describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: { Geom: { Point: class { constructor(public x: number, public y: number) {} } } } }));
import { generateHostileProjectileTextures } from './generateTextures';
import { HOSTILE_PROJECTILE_ART } from '../../game/assets/hostileProjectiles';
import { ASSET_KEYS } from '../../game/assets/manifest';

describe('directional hostile projectile art', () => {
  it('renders every canonical and Classic key as faceted darts without circular geometry', () => {
    const textures = new Map<string, { width: number; height: number; shapes: unknown[] }>();
    let shapes: unknown[] = [];
    const g = {
      fillStyle: vi.fn(function (_color: number, _alpha: number) { return g; }),
      fillPoints: vi.fn((points: Array<{ x: number; y: number }>) => { shapes.push(points); return g; }),
      lineStyle: vi.fn(function () { return g; }),
      lineBetween: vi.fn(function () { return g; }),
      generateTexture: (key: string, width: number, height: number) => {
        textures.set(key, { width, height, shapes: structuredClone(shapes) }); return g;
      },
      clear: () => { shapes = []; return g; },
      // Deliberately no circle, arc, ellipse or ring methods: any orb regression fails here.
    };
    generateHostileProjectileTextures(g as never);
    expect([...textures.keys()].sort()).toEqual([
      ...Object.values(HOSTILE_PROJECTILE_ART).map((art) => art.key), ASSET_KEYS.enemyBullet, ASSET_KEYS.enemyBulletHeavy,
    ].sort());
    for (const art of Object.values(HOSTILE_PROJECTILE_ART)) {
      const texture = textures.get(art.key)!;
      expect(texture.width).toBe(art.width);
      expect(texture.height).toBe(art.height);
      expect(texture.height / texture.width).toBeGreaterThan(1.6);
      expect(texture.shapes).toHaveLength(6);
      const core = texture.shapes[5] as Array<{ x: number; y: number }>;
      expect(core[3]).toEqual({ x: art.width * .5, y: art.height * .84 });
      expect(core[3].y).toBeGreaterThan(core[0].y); // Its pointed tip faces +Y.
    }
    expect(textures.get(ASSET_KEYS.enemyBullet)).toEqual(textures.get(HOSTILE_PROJECTILE_ART.standard.key));
    expect(textures.get(ASSET_KEYS.enemyBulletHeavy)).toEqual(textures.get(HOSTILE_PROJECTILE_ART.heavy.key));
    expect(g.fillStyle.mock.calls.slice(0, 2).map((call) => call[1])).toEqual([.07, .13]);
  });

  it('keeps collision cores unchanged while replacing the purple heavy orb with amber energy', () => {
    expect(HOSTILE_PROJECTILE_ART.standard.radius).toBe(5);
    expect(HOSTILE_PROJECTILE_ART.heavy.radius).toBe(8);
    expect(HOSTILE_PROJECTILE_ART.ion.radius).toBe(5);
    const heavy = HOSTILE_PROJECTILE_ART.heavy.edge;
    expect((heavy >> 16) & 255).toBeGreaterThan(heavy & 255);
    expect((heavy >> 8) & 255).toBeGreaterThan(heavy & 255);
  });
});
