import { describe, expect, it } from 'vitest';
import { asteroidRelief } from './asteroidRelief';

describe('baked procedural rock relief', () => {
  it('has a stable transparent silhouette and varied stone lighting', () => {
    const pixels = asteroidRelief(3, 64);
    expect(pixels).toEqual(asteroidRelief(3, 64));
    expect(pixels).not.toEqual(asteroidRelief(4, 64));
    const values: number[] = [];
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const offset = (y * 64 + x) * 4;
      if (x === 0 || y === 0 || x === 63 || y === 63) expect(pixels[offset + 3]).toBe(0);
      if (pixels[offset + 3] > 128) values.push(pixels[offset]);
    }
    expect(values.length).toBeGreaterThan(900);
    expect(values.length).toBeLessThan(2600);
    expect(new Set(values).size).toBeGreaterThan(65);
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(75);
  });
});
