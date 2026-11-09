import { getMissionById, MISSIONS } from '../game/content/missions';
import type { CampaignSnapshot, MissionDefinition } from '../game/simulation/types';

/** Dreadnought also has finale mechanics, but only Last Light ends the campaign. */
export function missionLaunchLabel(mission: Pick<MissionDefinition, 'id' | 'number'>): string {
  return mission.id === 'lastLight' ? 'BEGIN FINAL ASSAULT' : `LAUNCH MISSION ${mission.number}`;
}

/** Catalogue indexes include alternatives; display the actual sortie number. */
export function campaignResumeLabel(save: CampaignSnapshot): string {
  const mission = save.currentMissionId ? getMissionById(save.currentMissionId) : MISSIONS[save.missionIndex] ?? MISSIONS[0];
  if (save.phase === 'story') return 'RESUME // STORY TRANSMISSION';
  if (save.phase === 'route') return `RESUME // CHOOSE ROUTE ${mission.id === 'fortress' ? '2' : '1'} OF 2`;
  if (save.phase === 'mission' && save.activeWaypoint) {
    return `RESUME // ${mission.id.toUpperCase()} WAYPOINT ${save.activeWaypoint.waypointId}`;
  }
  return `RESUME // MISSION ${mission.number}`;
}
