import type { FinaleBossKind, FinaleBossStage, GameSnapshot, MissionId, MissionWaypointId } from '../simulation/types';
import { getMissionById } from './missions';

export function isFinaleMission(missionId: MissionId): boolean {
  return missionId === 'dreadnought' || missionId === 'lastLight';
}

/** The boss stage is the sequence cursor; nullArchitect implies Seraph is already defeated. */
export function finaleBossKind(missionId: MissionId, stage?: FinaleBossStage): FinaleBossKind | undefined {
  if (missionId === 'dreadnought') return 'boss';
  if (missionId === 'lastLight') return stage ?? 'seraph';
  return undefined;
}

export function finaleWaypointPosition(missionId: MissionId, id: MissionWaypointId): number {
  if (missionId === 'lastLight') return id === 1 ? 0.15 : 0.55;
  if (missionId === 'dreadnought') return id === 1 ? 0.18 : 0.18 + 0.82 * 0.34;
  return id === 1 ? 0.33 : 0.66;
}

/** Progress follows earned encounter milestones, not time spent waiting during boss fights. */
export function finaleProgress(snapshot: Pick<GameSnapshot, 'missionId' | 'finalePhase' | 'finaleBossStage' | 'stageElapsedMs' | 'bossHealthRatio'>): number | undefined {
  if (!isFinaleMission(snapshot.missionId)) return undefined;
  const approachEnd = finaleWaypointPosition(snapshot.missionId, 1);
  const clamp = (value: number): number => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  if (snapshot.finalePhase === 'cleared') return 1;
  if (snapshot.finalePhase !== 'boss') {
    return clamp(snapshot.stageElapsedMs / (getMissionById(snapshot.missionId).approachDurationMs ?? 30_000)) * approachEnd;
  }
  const defeatedFraction = 1 - clamp(snapshot.bossHealthRatio);
  if (snapshot.missionId === 'dreadnought') return approachEnd + (1 - approachEnd) * defeatedFraction;
  const secondBossStart = finaleWaypointPosition('lastLight', 2);
  return snapshot.finaleBossStage === 'nullArchitect'
    ? secondBossStart + (1 - secondBossStart) * defeatedFraction
    : approachEnd + (secondBossStart - approachEnd) * defeatedFraction;
}
