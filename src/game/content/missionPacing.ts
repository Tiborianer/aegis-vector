import { isFinaleMission } from './finale';
import type { FinaleBossStage, FinalePhase, MissionId } from '../simulation/types';

export const QUIET_ENDING_MS = 6_000;

export function commandArrivalAt(mission: MissionId, duration: number): number {
  const lead = mission === 'coastal' ? 18_000 : mission === 'fortress' ? 25_000 : mission === 'carrierSiege' ? 30_000 : 20_000;
  const authored = mission === 'minefield' ? duration * .785 : duration - lead;
  // Short local playtests still need time for the full command arrival animation.
  return Math.max(0, Math.min(authored, duration - QUIET_ENDING_MS - 3_000));
}

export function arrivalsOpen(mission: MissionId, elapsed: number, duration: number, phase?: FinalePhase, stage?: FinaleBossStage, bossHealth = 1): boolean {
  if (!isFinaleMission(mission)) return elapsed < duration - QUIET_ENDING_MS;
  if (phase === 'cleared') return false;
  if (phase !== 'boss') return true;
  return mission === 'lastLight' ? stage !== 'nullArchitect' : bossHealth > .33;
}

/** Legacy directors could bank a late waypoint before their mandatory formation.
 * Replay its entrance with the banked resources, leaving the quiet window intact. */
export function resumeArrivalTime(mission: MissionId, elapsed: number, duration: number, commandSpawned: boolean): number {
  return !commandSpawned && !isFinaleMission(mission) && elapsed >= duration - QUIET_ENDING_MS
    ? commandArrivalAt(mission, duration) : elapsed;
}
