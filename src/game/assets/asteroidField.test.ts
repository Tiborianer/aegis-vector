import { describe, expect, it } from 'vitest';
import { asteroidAlpha, asteroidFrame, asteroidShape, ASTEROID_FIELD_HEIGHT, ASTEROID_FLIGHT_SPEED, ASTEROID_REDUCED_MOTION_FACTOR, ASTEROID_TEXTURE_COUNT, distantMeteorFrame, makeAsteroidField, sceneryRandom } from './asteroidField';
import { WORLD_WIDTH } from '../content/balance';

describe('Last Light asteroid field', () => {
  it('is deterministic without touching gameplay randomness', () => {
    const a = sceneryRandom(571); const b = sceneryRandom(571);
    expect(Array.from({ length: 20 }, a)).toEqual(Array.from({ length: 20 }, b));
    expect(makeAsteroidField('high')).toEqual(makeAsteroidField('high'));
  });
  it('has nine distinct sculpted silhouettes with craters and fissures', () => {
    const shapes = Array.from({ length: ASTEROID_TEXTURE_COUNT }, (_, i) => asteroidShape(i + 1));
    expect(new Set(shapes.map((shape) => JSON.stringify(shape.outline))).size).toBe(9);
    for (const shape of shapes) {
      expect(shape.outline.length).toBeGreaterThanOrEqual(13);
      expect(shape.craters.length).toBeGreaterThanOrEqual(7);
      expect(shape.fissures).toHaveLength(3);
      expect(shape.outline.every(({ x, y }) => Math.abs(x) <= 1 && Math.abs(y) <= 1)).toBe(true);
      expect(shape.craters.every(({ x, y, radius }) => Math.hypot(x, y) + radius < .9)).toBe(true);
    }
  });
  it('has varied sizes and slow bidirectional rotations on three scenery-only planes', () => {
    const field = makeAsteroidField('high');
    expect(field).toHaveLength(24);
    expect(new Set(field.map((rock) => rock.layer)).size).toBe(3);
    expect(new Set(field.map((rock) => rock.shape)).size).toBe(9);
    expect(field.some((rock) => rock.spin < 0)).toBe(true);
    expect(field.some((rock) => rock.spin > 0)).toBe(true);
    expect(Math.min(...field.map((rock) => rock.size))).toBeLessThan(35);
    expect(Math.max(...field.map((rock) => rock.size))).toBeGreaterThan(200);
    for (const rock of field) {
      expect(Math.abs(rock.spin)).toBeLessThan(.05);
      expect(rock.depth).toBeLessThan(0);
      expect(rock.speed).toBeGreaterThanOrEqual(ASTEROID_FLIGHT_SPEED[rock.layer].minimum);
      expect(rock.speed).toBeLessThan(ASTEROID_FLIGHT_SPEED[rock.layer].minimum + ASTEROID_FLIGHT_SPEED[rock.layer].variation);
      if (rock.layer === 'near') {
        expect(rock.x + rock.size / 2 < 300 || rock.x - rock.size / 2 > WORLD_WIDTH - 300).toBe(true);
      }
    }
  });
  it('wraps outside the playfield without teleporting visible fragments', () => {
    for (const rock of makeAsteroidField('high')) {
      for (let time = 0; time < 180_000; time += 100) {
        const frame = asteroidFrame(rock, time, 0, false);
        const next = asteroidFrame(rock, time + 100, 0, false);
        if (next.y < frame.y) {
          expect(frame.y - rock.size / 2).toBeGreaterThan(720);
          expect(next.y + rock.size / 2).toBeLessThan(0);
          expect(frame.y - next.y).toBeCloseTo(ASTEROID_FIELD_HEIGHT - rock.speed * .1);
        }
      }
    }
  });
  it('sells fast flight with depth-separated translation, not faster spinning', () => {
    const field = makeAsteroidField('high');
    const fastestDistant = Math.max(...field.filter((rock) => rock.layer === 'distant').map((rock) => rock.speed));
    const fastestMiddle = Math.max(...field.filter((rock) => rock.layer === 'middle').map((rock) => rock.speed));
    for (const rock of field) {
      if (rock.layer === 'middle') expect(rock.speed).toBeGreaterThan(fastestDistant * 2);
      if (rock.layer === 'near') expect(rock.speed).toBeGreaterThan(fastestMiddle * 1.8);
      const start = asteroidFrame(rock, 0, 0, false);
      const next = asteroidFrame(rock, 500, 0, false);
      expect(next.y - start.y).toBeCloseTo(rock.speed * .5);
      expect(next.rotation - start.rotation).toBeCloseTo(rock.spin * .5);
    }
  });
  it('supports lower budgets and removes spin/parallax for reduced motion', () => {
    expect(makeAsteroidField('low')).toHaveLength(10);
    expect(makeAsteroidField('balanced')).toHaveLength(17);
    for (const rock of makeAsteroidField('low')) {
      expect(asteroidFrame(rock, 15_000, .5, true).rotation).toBe(rock.rotation);
      expect(asteroidFrame(rock, 15_000, .5, true).x).toBe(rock.x);
      const start = asteroidFrame(rock, 0, 0, true);
      const next = asteroidFrame(rock, 1_000, 0, true);
      expect(next.y - start.y).toBeCloseTo(rock.speed * ASTEROID_REDUCED_MOTION_FACTOR);
      expect(next.y - start.y).toBeLessThan(5);
    }
  });
  it('dials back contrast during dense fire and never pulses its opacity', () => {
    for (const rock of makeAsteroidField('high')) {
      expect(asteroidAlpha(rock, 1)).toBeLessThan(asteroidAlpha(rock, 0));
      expect(asteroidAlpha(rock, 0)).toBeLessThan(.8);
      expect(asteroidAlpha(rock, -1)).toBe(asteroidAlpha(rock, 0));
      expect(asteroidAlpha(rock, 2)).toBe(asteroidAlpha(rock, 1));
    }
  });
  it('keeps the distant meteor rare, subtle and disabled in reduced motion', () => {
    expect(distantMeteorFrame(5_000, false).visible).toBe(false);
    expect(distantMeteorFrame(13_300, false)).toMatchObject({ visible: true, alpha: .18 });
    expect(distantMeteorFrame(13_300, true).visible).toBe(false);
    expect(distantMeteorFrame(15_000, false).visible).toBe(false);
  });
});
