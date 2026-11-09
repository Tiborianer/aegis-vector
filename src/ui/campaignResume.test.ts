import { describe, expect, it } from 'vitest';
import { CampaignModel } from '../game/simulation/CampaignModel';
import { campaignResumeLabel, missionLaunchLabel } from './campaignResume';
import { MISSIONS, getMissionById } from '../game/content/missions';

describe('campaign resume labels', () => {
  it('uses sortie numbers rather than branch catalogue indexes', () => {
    for (const [currentMissionId, missionIndex, number] of [
      ['aurora', 2, 2], ['fortress', 3, 3], ['dreadnought', 7, 6], ['lastLight', 8, 7],
    ] as const) {
      expect(campaignResumeLabel({ ...CampaignModel.fresh('pilot'), currentMissionId, missionIndex }))
        .toBe(`RESUME // MISSION ${number}`);
    }
  });
  it('names an unfinished route decision or story instead of implying another mission', () => {
    expect(campaignResumeLabel({ ...CampaignModel.fresh('pilot'), phase: 'route' })).toBe('RESUME // CHOOSE ROUTE 1 OF 2');
    expect(campaignResumeLabel({ ...CampaignModel.fresh('pilot'), phase: 'route', currentMissionId: 'fortress' })).toBe('RESUME // CHOOSE ROUTE 2 OF 2');
    expect(campaignResumeLabel({ ...CampaignModel.fresh('pilot'), phase: 'story' })).toBe('RESUME // STORY TRANSMISSION');
  });
  it('reserves the final-assault launch label for Last Light, not the penultimate Dreadnought', () => {
    expect(missionLaunchLabel(getMissionById('dreadnought'))).toBe('LAUNCH MISSION 6');
    for (const mission of MISSIONS) {
      expect(missionLaunchLabel(mission)).toBe(mission.id === 'lastLight' ? 'BEGIN FINAL ASSAULT' : `LAUNCH MISSION ${mission.number}`);
    }
  });
});
