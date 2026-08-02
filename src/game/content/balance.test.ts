import { describe, expect, it } from 'vitest';
import { ENEMIES } from './balance';
import { getThreatTuning } from './encounters';
import type { Difficulty, MissionId } from '../simulation/types';

describe('campaign durability profiles', () => {
  it('matches the requested per-mission health table before threat escalation', () => {
    const expected: Record<Difficulty, Record<MissionId, number>> = {
      cadet: { coastal: 0.86, minefield: 1.08, fortress: 1.3, dreadnought: 1.48 },
      pilot: { coastal: 0.9, minefield: 1.18, fortress: 1.45, dreadnought: 1.68 },
      ace: { coastal: 1, minefield: 1.32, fortress: 1.65, dreadnought: 1.92 },
    };
    for (const difficulty of ['cadet', 'pilot', 'ace'] as const) {
      for (const mission of ['coastal', 'minefield', 'fortress', 'dreadnought'] as const) {
        expect(getThreatTuning(0, difficulty, mission).enemyHealth).toBeCloseTo(expected[difficulty][mission]);
      }
    }
  });

  it('keeps Bulwark and Warden base durability independent from carrier reinforcement', () => {
    expect(ENEMIES.bulwark.health).toBe(30);
    expect(ENEMIES.warden.health).toBe(220);
  });
});
