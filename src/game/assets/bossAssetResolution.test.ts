import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import manifest from '../../../public/graphics-v2/manifest.json';
import seraphBake from '../../../public/graphics-v2/modules/seraph-wings.json';
import { SHIP_SIZES, shipFrameSize, shipTextureDensity } from './visuals';
import { seraphCollisionRects, seraphWingPoint, seraphWingPose, seraphWingRotation, SERAPH_WINGS } from '../simulation/modularBoss';

const pngSize = (file: string) => {
  const bytes = readFileSync(new URL(`../../../public/graphics-v2/${file}`, import.meta.url));
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
};

describe('approved high-density boss asset contract', () => {
  it.each([['nullArchitect', 3, 2], ['seraph', 2, 1.14]] as const)(
    '%s retains its physical footprint while loading genuinely denser frames', (kind, density, worldScale) => {
      expect(shipTextureDensity(kind)).toBe(density);
      expect(shipFrameSize(kind)).toEqual(SHIP_SIZES[kind].map((size) => size * density));
      const spec = manifest.ships[kind];
      expect(spec.textureDensity).toBe(density);
      expect(spec.renderDensity).toBe(4);
      expect(pngSize(spec.file)).toEqual(shipFrameSize(kind).map((size) => size * 4));
      expect(pngSize(spec.file).every((size) => size <= 4096)).toBe(true);
      shipFrameSize(kind).forEach((size, index) =>
        expect(size * worldScale / density).toBeCloseTo(SHIP_SIZES[kind][index] * worldScale));
    });
  it('ships the selected Eclipse source, two distinct transparent wing canvases and preserved physical origins', () => {
    expect(manifest.ships.seraph.family).toBe('approvedEclipse');
    expect(seraphBake.source).toBe('assets/seraph-proposals-v1/eclipse.blend');
    expect(SERAPH_WINGS.map((wing) => wing.side)).toEqual([-1, 1]);
    for (const wing of SERAPH_WINGS) {
      expect(pngSize(wing.file)).toEqual([640, 328]);
      expect(wing.origin[0]).toBeCloseTo(.5 + wing.hinge[0] / 320, 6);
      expect(wing.origin[1]).toBeCloseTo(.5 + wing.hinge[1] / 164, 6);
    }
    expect(pngSize('modules/crown-turret.png')).toEqual([144, 144]);
  });
  it('moves wing artwork, collision plates and firing muzzles around one shared bearing, without a warning snap', () => {
    for (let time = 0; time <= 12000; time += 200) {
      const rects = seraphCollisionRects(time);
      expect(rects).toHaveLength(9);
      expect(seraphWingPose(time, true)).toEqual(seraphWingPose(time, false));
      SERAPH_WINGS.forEach((wing, index) => {
        const pivot = { x: wing.hinge[0], y: wing.hinge[1] };
        expect(seraphWingPoint(index, pivot, time)).toEqual(pivot);
        expect(Math.abs(seraphWingRotation(index, time))).toBeLessThanOrEqual(.1);
        wing.colliders.forEach((plate, i) => {
          const transformed = seraphWingPoint(index, plate, time), rect = rects[1 + index * 4 + i];
          expect(rect.x * 320).toBeCloseTo(transformed.x, 6);
          expect(rect.y * 164).toBeCloseTo(transformed.y, 6);
        });
        const muzzle = seraphWingPoint(index, { x: wing.muzzle[0], y: wing.muzzle[1] }, time);
        const pose = seraphWingPose(time, true);
        expect(Math.abs(muzzle.x)).toBeCloseTo(pose.spread, 3);
        expect(muzzle.y).toBeCloseTo(pose.barrelY + 25, 3);
      });
    }
  });
});
