import { WEAPON_MAX_LEVEL } from '../content/balance';
import { isFinaleMission } from '../content/finale';
import type { EncounterCheckpointSnapshot, MissionId, MissionWaypointSnapshot, UpgradeType, WeaponType } from './types';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const finiteNonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
const counter = (value: unknown): value is number => finiteNonnegative(value) && Number.isInteger(value);
const upgradeTypes = new Set<UpgradeType>(['spread', 'missile', 'laser', 'drone', 'ion', 'shield']);
const utilityTypes = new Set(['repair', 'overdrive', 'tractor', 'emp']);

/** Clone the deterministic encounter cursor without creating any render objects. */
export function restoreEncounterCursor(checkpoint: EncounterCheckpointSnapshot): EncounterCheckpointSnapshot {
  return {
    ...checkpoint,
    armamentOfferHistory: checkpoint.armamentOfferHistory.map((pair) => [pair[0], pair[1]] as const),
  };
}

export function cloneMissionWaypoint(waypoint: MissionWaypointSnapshot): MissionWaypointSnapshot {
  return {
    ...waypoint,
    game: { ...waypoint.game, weapons: { ...waypoint.game.weapons } },
    encounter: restoreEncounterCursor(waypoint.encounter),
  };
}

/** Reject an incomplete checkpoint rather than silently restoring spent defenses or broken cursors. */
export function sanitizeMissionWaypoint(candidate: unknown, missionId: MissionId): MissionWaypointSnapshot | undefined {
  if (!isRecord(candidate) || candidate.missionId !== missionId || (candidate.waypointId !== 1 && candidate.waypointId !== 2)) return undefined;
  const game = candidate.game;
  const encounter = candidate.encounter;
  if (!isRecord(game) || !isRecord(encounter) || !isRecord(game.weapons)) return undefined;
  if (!finiteNonnegative(candidate.capturedAtMs) || !finiteNonnegative(game.stageElapsedMs) || candidate.capturedAtMs !== game.stageElapsedMs) return undefined;
  for (const key of ['score', 'kills', 'creditsEarned', 'shotsFired', 'shotsHit', 'damageTaken', 'shieldBaseMax', 'hull', 'shield', 'empCharges', 'emergencyCapacitorTriggers']) {
    if (!counter(game[key])) return undefined;
  }
  const shieldBonus = game.shieldCapacityBonus ?? 0;
  if (shieldBonus !== 0 && shieldBonus !== 1) return undefined;
  if ((game.shieldBaseMax as number) < 1 || (game.shieldBaseMax as number) > 3 || (game.hull as number) < 1 || (game.hull as number) > 6 || (game.shield as number) > (game.shieldBaseMax as number) + shieldBonus || (game.empCharges as number) > 4 || (game.emergencyCapacitorTriggers as number) > 2) return undefined;
  if (game.creditRemainder !== undefined && (!finiteNonnegative(game.creditRemainder) || game.creditRemainder >= 1)) return undefined;
  for (const key of ['phoenixAvailable', 'reserveShieldAvailable', 'secondWindAvailable', 'naniteLatticeAvailable', 'sortieNanitesAvailable', 'fortressRamAvailable']) {
    if (typeof game[key] !== 'boolean') return undefined;
  }
  for (const type of Object.keys(WEAPON_MAX_LEVEL) as WeaponType[]) {
    const level = game.weapons[type];
    if (!counter(level) || level < (type === 'spread' ? 1 : 0) || level > WEAPON_MAX_LEVEL[type]) return undefined;
  }
  for (const key of ['waveIndex', 'nextCarrierIndex', 'killsSinceUtilityDrop', 'commandRemaining', 'finaleApproachWave']) {
    if (!counter(encounter[key])) return undefined;
  }
  // Retry removes all render enemies. A retained required-target count would softlock completion.
  if (encounter.commandRemaining !== 0) return undefined;
  for (const key of ['minibossSpawned', 'commandSpawned', 'bulwarkIntroduced', 'bossSpawned']) {
    if (typeof encounter[key] !== 'boolean') return undefined;
  }
  if (!counter(encounter.lastThreatLevel) || encounter.lastThreatLevel < 1 || encounter.lastThreatLevel > 5) return undefined;
  if (encounter.lastUtility !== undefined && !utilityTypes.has(encounter.lastUtility as string)) return undefined;
  if (!Array.isArray(encounter.armamentOfferHistory) || encounter.armamentOfferHistory.length > 512) return undefined;
  if (!encounter.armamentOfferHistory.every((pair) => Array.isArray(pair) && pair.length === 2 && pair.every((item) => upgradeTypes.has(item)))) return undefined;
  if (candidate.bossHealthRatio !== undefined && (!finiteNonnegative(candidate.bossHealthRatio) || candidate.bossHealthRatio <= 0 || candidate.bossHealthRatio > 1)) return undefined;

  if (isFinaleMission(missionId)) {
    if (game.finalePhase !== 'boss') return undefined;
    if (missionId === 'lastLight') {
      const expectedStage = candidate.waypointId === 1 ? 'seraph' : 'nullArchitect';
      if (game.finaleBossStage !== expectedStage) return undefined;
      if (encounter.bossSpawned) return undefined;
      // Last Light only saves at clean boss boundaries, never halfway through either boss.
      if (candidate.bossHealthRatio !== undefined && candidate.bossHealthRatio !== 1) return undefined;
    } else if (game.finaleBossStage !== undefined) return undefined;
  } else if (game.finalePhase !== undefined || game.finaleBossStage !== undefined || candidate.bossHealthRatio !== undefined) return undefined;

  return cloneMissionWaypoint(candidate as unknown as MissionWaypointSnapshot);
}
