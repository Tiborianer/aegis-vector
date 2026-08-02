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

  it('separates mission durability from projectile pressure', () => {
    const coastal = getThreatTuning(0, 'cadet', 'coastal');
    const fortress = getThreatTuning(0, 'pilot', 'fortress');
    expect(coastal.enemyHealth).toBeCloseTo(0.86);
    expect(coastal.pressureScale).toBeCloseTo(0.95);
    expect(fortress.enemyHealth).toBeCloseTo(1.45);
    expect(fortress.pressureScale).toBeCloseTo(1.08);
  });

  it('uses difficulty-specific escalation intervals and budgets', () => {
    const cadet = getThreatTuning(0.99, 'cadet', 'fortress');
    const pilot = getThreatTuning(0.99, 'pilot', 'fortress');
    const ace = getThreatTuning(0.99, 'ace', 'fortress');
    expect([cadet.waveIntervalMs, pilot.waveIntervalMs, ace.waveIntervalMs]).toEqual([3_800, 3_600, 3_200]);
    expect([cadet.waveBudget, pilot.waveBudget, ace.waveBudget]).toEqual([7, 9, 11]);
    expect(cadet.enemyHealth).toBeCloseTo((1 + 0.28 * 0.6) * 1.3);
  });
});
