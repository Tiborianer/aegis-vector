import { describe, expect, it } from 'vitest';
import { finaleBossKind, finaleProgress, finaleWaypointPosition, isFinaleMission } from './finale';

describe('finale sequence presentation', () => {
  it('maps the persistent sequence cursor to exactly one boss', () => {
    expect(finaleBossKind('coastal')).toBeUndefined();
    expect(finaleBossKind('dreadnought')).toBe('boss');
    expect(finaleBossKind('lastLight')).toBe('seraph');
    expect(finaleBossKind('lastLight', 'nullArchitect')).toBe('nullArchitect');
    expect(isFinaleMission('lastLight')).toBe(true);
  });

  it('keeps Last Light progress continuous across the Seraph-to-Architect transition', () => {
    const snapshot = { missionId: 'lastLight', finalePhase: 'approach', stageElapsedMs: 35_000, bossHealthRatio: 1 } as const;
    expect(finaleProgress(snapshot)).toBeCloseTo(0.15);
    expect(finaleProgress({ ...snapshot, finalePhase: 'boss', finaleBossStage: 'seraph' })).toBeCloseTo(0.15);
    expect(finaleProgress({ ...snapshot, finalePhase: 'boss', finaleBossStage: 'seraph', bossHealthRatio: 0 })).toBeCloseTo(0.55);
    expect(finaleProgress({ ...snapshot, finalePhase: 'boss', finaleBossStage: 'nullArchitect' })).toBeCloseTo(0.55);
    expect(finaleProgress({ ...snapshot, finalePhase: 'boss', finaleBossStage: 'nullArchitect', bossHealthRatio: 0 })).toBe(1);
    expect(finaleProgress({ ...snapshot, finalePhase: 'cleared' })).toBe(1);
    expect(finaleWaypointPosition('lastLight', 1)).toBe(0.15);
    expect(finaleWaypointPosition('lastLight', 2)).toBe(0.55);
  });

  it('preserves the Dreadnought approach and 66-percent-health waypoint positions', () => {
    const snapshot = { missionId: 'dreadnought', finalePhase: 'approach', stageElapsedMs: 90_000, bossHealthRatio: 1 } as const;
    expect(finaleProgress(snapshot)).toBeCloseTo(0.18);
    expect(finaleProgress({ ...snapshot, finalePhase: 'boss', bossHealthRatio: 0.66 })).toBeCloseTo(finaleWaypointPosition('dreadnought', 2));
    expect(finaleProgress({ ...snapshot, missionId: 'coastal' })).toBeUndefined();
    expect(finaleWaypointPosition('coastal', 2)).toBe(0.66);
  });
});
