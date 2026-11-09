import type { CampaignRoute, CombatModifiers, MissionId, RouteRewardId } from '../simulation/types';

export interface RouteRewardDefinition {
  id: RouteRewardId;
  route: CampaignRoute;
  missionId: MissionId;
  name: string;
  description: string;
}

export const ROUTE_REWARDS: Readonly<Record<CampaignRoute, RouteRewardDefinition>> = {
  salvage: {
    id: 'arc-resonator', route: 'salvage', missionId: 'minefield',
    name: 'ARC RESONATOR',
    description: 'Permanent +12% ARC cannon damage. Stacks with purchased weapon upgrades.',
  },
  storm: {
    id: 'aegis-bastion', route: 'storm', missionId: 'aurora',
    name: 'AEGIS BASTION',
    description: 'Permanent +1 shield cell, in addition to the three collectible base cells.',
  },
};

export function routeRewardForClear(missionId: MissionId, route?: CampaignRoute): RouteRewardId | undefined {
  return route && ROUTE_REWARDS[route].missionId === missionId ? ROUTE_REWARDS[route].id : undefined;
}

/** Derive from earned state each time; retry/respec must never accumulate the bonus. */
export function applyRouteReward(modifiers: CombatModifiers, reward?: RouteRewardId): CombatModifiers {
  return {
    ...modifiers,
    arcDamageMultiplier: reward === 'arc-resonator' ? 1.12 : 1,
    shieldCapacityBonus: reward === 'aegis-bastion' ? 1 : 0,
  };
}
