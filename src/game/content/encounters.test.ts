import { describe, expect, it } from 'vitest';
import { auroraWave, carrierKind, carrierMilestones, EncounterDirector, getThreatLevel, getThreatTuning, globalCarrierIndex, isCoastalOpening, MISSION_DIFFICULTY, THREAT_PHASES } from './encounters';
import { DIFFICULTY } from './balance';
import { getMissionById } from './missions';

describe('EncounterDirector', () => {
  it('maps every mission fifth to the intended threat level', () => {
    expect([0, 0.2, 0.4, 0.6, 0.8].map(getThreatLevel)).toEqual([1, 2, 3, 4, 5]);
  });

  it('keeps deterministic wave positions across retries', () => {
    const first = new EncounterDirector(12345, 'pilot', 'fortress');
    const retry = new EncounterDirector(12345, 'pilot', 'fortress');
    expect(first.between(8, 3, 100, 1_100)).toBe(retry.between(8, 3, 100, 1_100));
  });

  it('restores the same Aurora formations and offers without replaying earlier waves', () => {
    const director = new EncounterDirector(177, 'pilot', 'aurora');
    const restored = new EncounterDirector(177, 'pilot', 'aurora');
    const kinds = new Set<string>();
    for (let index = 0; index < 48; index++) {
      const wave = auroraWave(director, index, index / 48);
      expect(wave).toEqual(auroraWave(restored, index, index / 48));
      wave.forEach(({ kind, x, y }) => { kinds.add(kind); expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true); });
      expect(wave.filter(({ kind }) => kind === 'leech').length).toBeLessThanOrEqual(1);
      expect(wave.filter(({ kind }) => kind === 'prism').length).toBeLessThanOrEqual(2);
    }
    expect(kinds.has('prism')).toBe(true);
    expect(kinds.has('leech')).toBe(true);
    expect(carrierMilestones('aurora')).toEqual(carrierMilestones('minefield'));
    for (const index of [0, 1, 2]) expect(globalCarrierIndex('aurora', index)).toBe(globalCarrierIndex('minefield', index));
    expect([0, 1, 2].map((index) => carrierKind('aurora', index))).toEqual(['prism', 'leech', 'elite']);
    for (const difficulty of ['cadet', 'pilot', 'ace'] as const) {
      expect(getThreatTuning(.66, difficulty, 'aurora')).toEqual(getThreatTuning(.66, difficulty, 'minefield'));
    }
  });

  it('offers the first Coastal carrier at 23.4 seconds without changing subsequent milestones', () => {
    expect(carrierMilestones('coastal')).toEqual([.12, .52, .84]);
    expect(carrierMilestones('coastal')[0] * getMissionById('coastal').durationMs).toBe(23_400);
    expect(carrierMilestones('minefield')).toEqual([.18, .42, .65]);
    expect(carrierMilestones('fortress')).toEqual([.15, .33, .51, .69]);
  });

  it('slows Coastal opening bullets by ten percent on all difficulties, recovering by 30 percent', () => {
    for (const difficulty of ['cadet', 'pilot', 'ace'] as const) {
      for (const mission of ['coastal', 'minefield', 'fortress', 'stormbreak', 'graveyard', 'carrierSiege', 'dreadnought', 'lastLight'] as const) {
        for (const progress of [0, .1, .199, .2, .25, .3, .8, 1]) {
          const baseline = (1 + (THREAT_PHASES[getThreatLevel(progress) - 1].bulletSpeed - 1) * DIFFICULTY[difficulty].threatCurve)
            * (1 + (MISSION_DIFFICULTY[difficulty][mission].pressureScale - 1) * .35);
          const factor = mission !== 'coastal' || progress >= .3 ? 1 : progress <= .2 ? .9 : .95;
          expect(getThreatTuning(progress, difficulty, mission).bulletSpeed).toBeCloseTo(baseline * factor);
          expect(isCoastalOpening(mission, progress)).toBe(mission === 'coastal' && progress < .2);
        }
      }
    }
    expect(300 * getThreatTuning(0, 'pilot', 'coastal').bulletSpeed).toBeCloseTo(258.66);
  });

  it('separates mission durability from projectile pressure', () => {
    const coastal = getThreatTuning(0, 'cadet', 'coastal');
    const fortress = getThreatTuning(0, 'pilot', 'fortress');
    expect(coastal.enemyHealth).toBeCloseTo(0.78);
    expect(coastal.pressureScale).toBeCloseTo(0.85);
    expect(fortress.enemyHealth).toBeCloseTo(1.7);
    expect(fortress.pressureScale).toBeCloseTo(1.08);
  });

  it('uses difficulty-specific escalation intervals and budgets', () => {
    const cadet = getThreatTuning(0.99, 'cadet', 'fortress');
    const pilot = getThreatTuning(0.99, 'pilot', 'fortress');
    const ace = getThreatTuning(0.99, 'ace', 'fortress');
    expect([cadet.waveIntervalMs, pilot.waveIntervalMs, ace.waveIntervalMs]).toEqual([3_800, 3_600, 3_200]);
    expect([cadet.waveBudget, pilot.waveBudget, ace.waveBudget]).toEqual([7, 9, 11]);
    expect(cadet.enemyHealth).toBeCloseTo((1 + 0.99 * 0.6 * 0.6) * 1.5);
  });

  it('keeps Last Light approaches deterministic without spawning replayable Armament Carriers', () => {
    expect(carrierMilestones('lastLight')).toEqual([]);
    for (const difficulty of ['cadet', 'pilot', 'ace'] as const) {
      const initial = new EncounterDirector(42, difficulty, 'lastLight');
      const restored = new EncounterDirector(42, difficulty, 'lastLight');
      expect(initial.between(4, 7, 64, 1_216)).toBe(restored.between(4, 7, 64, 1_216));
      expect(initial.tuning(0.5).enemyHealth).toBeGreaterThan(getThreatTuning(0.5, difficulty, 'dreadnought').enemyHealth);
      expect(initial.tuning(0.5).bulletSpeed).toEqual(getThreatTuning(0.5, difficulty, 'dreadnought').bulletSpeed);
    }
  });

  it('makes the opening slower and smaller while preserving later wave variety', () => {
    for (const difficulty of ['cadet', 'pilot', 'ace'] as const) {
      const opening = getThreatTuning(0, difficulty, 'coastal');
      const later = getThreatTuning(0, difficulty, 'minefield');
      expect(opening.waveIntervalMs).toBe(later.waveIntervalMs + 1_000);
      expect(opening.waveBudget).toBe(later.waveBudget - 1);
      expect(opening.fireRate).toBeLessThan(later.fireRate);
      expect(getThreatTuning(0.2, difficulty, 'coastal').waveIntervalMs).toBe(getThreatTuning(0.2, difficulty, 'minefield').waveIntervalMs + 600);
      expect(getThreatTuning(0.4, difficulty, 'coastal').waveBudget).toBe(getThreatTuning(0.4, difficulty, 'minefield').waveBudget);
    }
  });

  it('increases enemy durability smoothly throughout each mission without a phase jump', () => {
    for (const difficulty of ['cadet', 'pilot', 'ace'] as const) {
      for (const mission of ['coastal', 'minefield', 'fortress', 'stormbreak', 'graveyard', 'carrierSiege', 'dreadnought', 'lastLight'] as const) {
        let previous = getThreatTuning(0, difficulty, mission).enemyHealth;
        for (let step = 1; step <= 100; step += 1) {
          const current = getThreatTuning(step / 100, difficulty, mission).enemyHealth;
          expect(current).toBeGreaterThan(previous);
          expect(current - previous).toBeLessThan(0.03);
          previous = current;
        }
        expect(getThreatTuning(1, difficulty, mission).enemyHealth).toBeGreaterThan(getThreatTuning(0, difficulty, mission).enemyHealth * 1.3);
      }
    }
  });

  it('clamps invalid progress so new enemies never receive invalid health', () => {
    expect(getThreatTuning(NaN, 'pilot', 'coastal')).toEqual(getThreatTuning(0, 'pilot', 'coastal'));
    expect(getThreatTuning(-1, 'pilot', 'coastal')).toEqual(getThreatTuning(0, 'pilot', 'coastal'));
    expect(getThreatTuning(2, 'pilot', 'coastal')).toEqual(getThreatTuning(1, 'pilot', 'coastal'));
  });
});
