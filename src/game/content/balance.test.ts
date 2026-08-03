import { describe, expect, it } from 'vitest';
import { ENEMIES } from './balance';
import { getThreatTuning } from './encounters';
import type { Difficulty, MissionId } from '../simulation/types';

describe('campaign durability profiles', () => {
  it('matches the requested per-mission health table before threat escalation', () => {
    const expected: Record<Difficulty, Record<MissionId, number>> = {
      cadet: { coastal: 0.86, minefield: 1.08, fortress: 1.3, stormbreak: 1.4, graveyard: 1.4, carrierSiege: 1.58, dreadnought: 1.75 },
      pilot: { coastal: 0.9, minefield: 1.18, fortress: 1.45, stormbreak: 1.62, graveyard: 1.62, carrierSiege: 1.82, dreadnought: 2.05 },
      ace: { coastal: 1, minefield: 1.32, fortress: 1.65, stormbreak: 1.85, graveyard: 1.85, carrierSiege: 2.12, dreadnought: 2.4 },
    };
    for (const difficulty of ['cadet', 'pilot', 'ace'] as const) {
      for (const mission of ['coastal', 'minefield', 'fortress', 'stormbreak', 'graveyard', 'carrierSiege', 'dreadnought'] as const) {
        expect(getThreatTuning(0, difficulty, mission).enemyHealth).toBeCloseTo(expected[difficulty][mission]);
      }
    }
  });

  it('keeps Bulwark and Warden base durability independent from carrier reinforcement', () => {
    expect(ENEMIES.bulwark.health).toBe(30);
    expect(ENEMIES.warden.health).toBe(220);
  });
});
