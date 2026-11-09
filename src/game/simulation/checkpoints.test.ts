import { describe, expect, it } from 'vitest';
import { getMissionById } from '../content/missions';
import { buildCombatModifiers } from '../content/upgrades';
import { GameModel } from './GameModel';
import { cloneMissionWaypoint, restoreEncounterCursor, sanitizeMissionWaypoint } from './checkpoints';
import type { MissionWaypointSnapshot } from './types';

function lastLightWaypoint(id: 1 | 2 = 1): MissionWaypointSnapshot {
  const model = new GameModel();
  model.start({ difficulty: 'pilot', mission: getMissionById('lastLight'), score: 2_000, weapons: { spread: 7, missile: 5, laser: 3, drone: 2, ion: 2 }, shieldBaseMax: 3, modifiers: buildCombatModifiers([]), campaignSeed: 42 });
  model.tick(35_000);
  model.setFinalePhase('boss');
  if (id === 2) model.advanceFinaleBoss();
  return {
    missionId: 'lastLight', waypointId: id, capturedAtMs: model.stageElapsedMs, game: model.exportCheckpoint(),
    encounter: { waveIndex: 4, nextCarrierIndex: 0, killsSinceUtilityDrop: 2, armamentOfferHistory: [['spread', 'ion']], minibossSpawned: false, commandSpawned: false, commandRemaining: 0, bulwarkIntroduced: false, finaleApproachWave: 4, bossSpawned: false, lastThreatLevel: 1 },
  };
}

describe('checkpoint validation and cursor recovery', () => {
  it('accepts both clean Last Light boundaries and preserves the exact boss stage', () => {
    for (const id of [1, 2] as const) {
      const waypoint = lastLightWaypoint(id);
      expect(sanitizeMissionWaypoint(waypoint, 'lastLight')).toEqual(waypoint);
    }
  });

  it('rejects a wrong boss at a waypoint, a mid-boss capture, and a cleared mission', () => {
    const waypoint = lastLightWaypoint(2);
    waypoint.game.finaleBossStage = 'seraph';
    expect(sanitizeMissionWaypoint(waypoint, 'lastLight')).toBeUndefined();
    waypoint.game.finaleBossStage = 'nullArchitect';
    waypoint.bossHealthRatio = 0.5;
    expect(sanitizeMissionWaypoint(waypoint, 'lastLight')).toBeUndefined();
    waypoint.bossHealthRatio = 1;
    waypoint.game.finalePhase = 'cleared';
    expect(sanitizeMissionWaypoint(waypoint, 'lastLight')).toBeUndefined();
  });

  it('cannot secure a defeated fighter or an uncleared Last Light encounter', () => {
    const waypoint = lastLightWaypoint(2);
    waypoint.game.hull = 0;
    expect(sanitizeMissionWaypoint(waypoint, 'lastLight')).toBeUndefined();
    waypoint.game.hull = 2;
    waypoint.encounter.commandRemaining = 1;
    expect(sanitizeMissionWaypoint(waypoint, 'lastLight')).toBeUndefined();
    waypoint.encounter.commandRemaining = 0;
    waypoint.encounter.bossSpawned = true;
    expect(sanitizeMissionWaypoint(waypoint, 'lastLight')).toBeUndefined();
  });

  it('rejects malformed saves without throwing or restoring unknown one-use defenses', () => {
    const valid = lastLightWaypoint();
    const malformed: unknown[] = [null, [], {}, { ...valid, game: undefined }, { ...valid, encounter: { ...valid.encounter, armamentOfferHistory: undefined } }, { ...valid, encounter: { ...valid.encounter, armamentOfferHistory: [['unknown', 'spread']] } }, { ...valid, game: { ...valid.game, phoenixAvailable: undefined } }, { ...valid, game: { ...valid.game, kills: Number.NaN } }, { ...valid, game: { ...valid.game, creditsEarned: Number.POSITIVE_INFINITY } }, { ...valid, capturedAtMs: valid.capturedAtMs + 1 }];
    for (const candidate of malformed) expect(sanitizeMissionWaypoint(candidate, 'lastLight')).toBeUndefined();
    expect(sanitizeMissionWaypoint(valid, 'dreadnought')).toBeUndefined();
  });

  it('validates the extra earned shield cell while accepting old checkpoints without a bonus field', () => {
    const valid = lastLightWaypoint();
    delete valid.game.shieldCapacityBonus;
    expect(sanitizeMissionWaypoint(valid, 'lastLight')).toEqual(valid);
    valid.game.shield = 4;
    expect(sanitizeMissionWaypoint(valid, 'lastLight')).toBeUndefined();
    valid.game.shieldCapacityBonus = 1;
    expect(sanitizeMissionWaypoint(valid, 'lastLight')).toEqual(valid);
    valid.game.shieldCapacityBonus = 2;
    expect(sanitizeMissionWaypoint(valid, 'lastLight')).toBeUndefined();
  });

  it('rejects a regular-mission checkpoint with a command target that retry cannot recreate', () => {
    const waypoint = lastLightWaypoint();
    waypoint.missionId = 'coastal';
    waypoint.game.finalePhase = undefined;
    waypoint.game.finaleBossStage = undefined;
    waypoint.encounter.commandSpawned = true;
    waypoint.encounter.commandRemaining = 1;
    expect(sanitizeMissionWaypoint(waypoint, 'coastal')).toBeUndefined();
    waypoint.encounter.commandRemaining = 0;
    expect(sanitizeMissionWaypoint(waypoint, 'coastal')).toEqual(waypoint);
  });

  it('clones nested equipment and deterministic offer history rather than sharing mutable state', () => {
    const original = lastLightWaypoint(2);
    const copy = cloneMissionWaypoint(original);
    copy.game.weapons.spread = 1;
    copy.encounter.armamentOfferHistory[0] = ['missile', 'shield'];
    expect(original.game.weapons.spread).toBe(7);
    expect(original.encounter.armamentOfferHistory[0]).toEqual(['spread', 'ion']);
    expect(restoreEncounterCursor(original.encounter)).toEqual(original.encounter);
    expect(restoreEncounterCursor(original.encounter).armamentOfferHistory).not.toBe(original.encounter.armamentOfferHistory);
  });
});
