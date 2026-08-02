import { describe, expect, it } from 'vitest';
import { EncounterDirector, getThreatLevel, getThreatTuning } from './encounters';

describe('EncounterDirector', () => {
  it('maps every mission fifth to the intended threat level', () => {
    expect([0, 0.2, 0.4, 0.6, 0.8].map(getThreatLevel)).toEqual([1, 2, 3, 4, 5]);
  });

  it('keeps deterministic wave positions across retries', () => {
    const first = new EncounterDirector(12345, 'pilot', 'fortress');
    const retry = new EncounterDirector(12345, 'pilot', 'fortress');
    expect(first.between(8, 3, 100, 1_100)).toBe(retry.between(8, 3, 100, 1_100));
  });

  it('applies only sixty-five percent escalation on Cadet', () => {
    expect(getThreatTuning(0.99, 'cadet', 'coastal').enemyHealth).toBeCloseTo(1 + 0.28 * 0.65);
  });
});
