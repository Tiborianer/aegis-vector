import { describe, expect, it } from 'vitest';
import { CampaignModel } from '../game/simulation/CampaignModel';
import { ROUTE_MAP_EDGES, ROUTE_MAP_NODES, routeNodeStatus } from './campaignMap';
describe('campaign route overview', () => {
  it('shows both early routes and independent later destinations without losing old missions', () => {
    expect(ROUTE_MAP_NODES).toHaveLength(9);
    expect(ROUTE_MAP_EDGES).toContainEqual(['coastal', 'aurora']);
    expect(ROUTE_MAP_EDGES).toContainEqual(['coastal', 'minefield']);
    expect(ROUTE_MAP_EDGES).toContainEqual(['stormbreak', 'carrierSiege']);
    expect(ROUTE_MAP_EDGES).toContainEqual(['graveyard', 'carrierSiege']);
  });
  it('marks the current mission, bypasses the other route, and never changes the save', () => {
    const state = { ...CampaignModel.fresh('pilot'), currentMissionId: 'fortress' as const, route: 'storm' as const, routeReward: 'aegis-bastion' as const };
    const before = JSON.stringify(state);
    expect(routeNodeStatus(ROUTE_MAP_NODES.find((n) => n.id === 'fortress')!, state)).toBe('current');
    expect(routeNodeStatus(ROUTE_MAP_NODES.find((n) => n.id === 'aurora')!, state)).toBe('complete');
    expect(routeNodeStatus(ROUTE_MAP_NODES.find((n) => n.id === 'minefield')!, state)).toBe('bypassed');
    expect(JSON.stringify(state)).toBe(before);
  });
  it('shows the first choice only after Coastal has been cleared', () => {
    const state = { ...CampaignModel.fresh('pilot'), phase: 'route' as const };
    expect(routeNodeStatus(ROUTE_MAP_NODES[1], state)).toBe('choice');
    expect(routeNodeStatus(ROUTE_MAP_NODES[2], state)).toBe('choice');
    expect(routeNodeStatus(ROUTE_MAP_NODES[4], state)).toBe('future');
  });
  it('does not rewrite a legacy Minefield visit into an Aurora visit', () => {
    for (const route of ['storm', undefined] as const) {
      const state = { ...CampaignModel.fresh('pilot'), currentMissionId: 'fortress' as const, route };
      expect(routeNodeStatus(ROUTE_MAP_NODES[1], state)).toBe('complete');
      expect(routeNodeStatus(ROUTE_MAP_NODES[2], state)).toBe('bypassed');
    }
  });
  it.each(['storm', 'salvage'] as const)('keeps both late choices open after an early %s choice', (earlyRoute) => {
    const state = { ...CampaignModel.fresh('pilot'), currentMissionId: 'fortress' as const, phase: 'route' as const, earlyRoute };
    for (const id of ['graveyard', 'stormbreak']) {
      expect(routeNodeStatus(ROUTE_MAP_NODES.find((node) => node.id === id)!, state)).toBe('choice');
    }
    expect(routeNodeStatus(ROUTE_MAP_NODES.find((node) => node.id === (earlyRoute === 'storm' ? 'aurora' : 'minefield'))!, state)).toBe('complete');
  });
  it.each([
    ['storm', 'storm'], ['storm', 'salvage'], ['salvage', 'storm'], ['salvage', 'salvage'],
  ] as const)('marks the correct completed and bypassed nodes for %s then %s', (earlyRoute, route) => {
    const state = { ...CampaignModel.fresh('pilot'), currentMissionId: 'carrierSiege' as const, earlyRoute, route };
    const before = JSON.stringify(state);
    for (const node of ROUTE_MAP_NODES.filter((candidate) => candidate.route)) {
      const chosen = node.column === 1 ? earlyRoute : route;
      expect(routeNodeStatus(node, state)).toBe(node.route === chosen ? 'complete' : 'bypassed');
    }
    expect(JSON.stringify(state)).toBe(before);
  });
});
