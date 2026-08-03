import { describe, expect, it } from 'vitest';
import { droneFormation, droneStatus } from './drones';

describe('droneFormation', () => {
  it('uses the intended campaign progression', () => {
    expect([0, 1, 2, 3, 4, 5].map((level) => droneFormation(level as 0 | 1 | 2 | 3 | 4 | 5).length))
      .toEqual([0, 1, 2, 2, 3, 4]);
    expect(droneStatus(3)).toBe('2 DRONES // FAST VOLLEY');
    expect(droneStatus(5)).toBe('4 DRONES // RAPID VOLLEY');
  });

  it('never overlaps formation or beacon slots', () => {
    for (const level of [0, 1, 2, 3, 4, 5] as const) {
      const slots = droneFormation(level, true);
      expect(new Set(slots.map(({ x, y }) => `${x}:${y}`)).size).toBe(slots.length);
    }
  });

  it('keeps level five escorts symmetric', () => {
    const slots = droneFormation(5);
    expect(slots.map(({ x }) => x)).toEqual([-58, 58, -112, 112]);
  });
});
