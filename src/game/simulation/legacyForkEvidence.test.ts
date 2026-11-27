import { expect, it } from 'vitest';
import { CampaignModel } from './CampaignModel';
import { ROUTE_MAP_NODES, routeNodeStatus } from '../../ui/campaignMap';

const lateBranches = [
  { route: 'salvage', mission: 'graveyard', chapter: 'project-crown', reward: 'salvagers-license' },
  { route: 'storm', mission: 'stormbreak', chapter: 'stillwater-directive', reward: 'vector-vanes' },
] as const;

it.each(lateBranches)('requires a recorded $mission clear before migrating a legacy late reward', branch => {
  for (const version of [6, 7, 8]) {
    const legacy = {
      ...CampaignModel.fresh('pilot'), version, currentMissionId: branch.mission, phase: 'hangar',
      route: branch.route, lateRouteReward: branch.reward,
    };
    // These schema versions never wrote a late reward field. Even a matching
    // value paired with a stale chapter from another phase proves no clear.
    const before = CampaignModel.restore({ ...legacy, pendingStoryChapter: branch.chapter })!;
    expect(before.lateRouteReward).toBeUndefined();
    expect(CampaignModel.restore(before)?.lateRouteReward).toBeUndefined();

    const after = CampaignModel.restore({ ...legacy, lateRouteReward: undefined,
      phase: 'story', pendingStoryChapter: branch.chapter })!;
    expect(after.lateRouteReward).toBe(branch.reward);
    expect(CampaignModel.restore(after)?.lateRouteReward).toBe(branch.reward);
  }
});

it('shows an unrecorded late fork on the map for a pre-fork Dreadnought save', () => {
  const restored = CampaignModel.restore({ ...CampaignModel.fresh('pilot'), version: 2, missionIndex: 3 })!;
  expect(restored.currentMissionId).toBe('dreadnought');
  expect(restored.lateRouteReward).toBeUndefined();
  for (const branch of lateBranches) {
    const node = ROUTE_MAP_NODES.find(node => node.id === branch.mission)!;
    expect(routeNodeStatus(node, restored)).toBe('unrecorded');
  }
});
