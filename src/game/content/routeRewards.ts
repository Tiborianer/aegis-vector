import type { CampaignRoute, CampaignSnapshot, CombatModifiers, LateRouteRewardId, MissionId, RouteRewardId } from '../simulation/types';

export interface RouteRewardDefinition<T extends string = RouteRewardId | LateRouteRewardId> {
  id: T;
  route: CampaignRoute;
  missionId: MissionId;
  name: string;
  destination: string;
  objective: string;
  effect: string;
  description: string;
}

export const ROUTE_REWARDS: Readonly<Record<CampaignRoute, RouteRewardDefinition<RouteRewardId>>> = {
  salvage: {
    id: 'arc-resonator', route: 'salvage', missionId: 'minefield',
    name: 'ARC RESONATOR',
    destination: 'Minefield Run', objective: 'Break through the mine belt and destroy the Warden.', effect: '+12% ARC damage',
    description: 'Permanent +12% ARC cannon damage. Stacks with purchased weapon upgrades.',
  },
  storm: {
    id: 'aegis-bastion', route: 'storm', missionId: 'aurora',
    name: 'AEGIS BASTION',
    destination: 'Aurora Reach', objective: 'Escort the polar convoy and recover its shield relay.', effect: '+1 shield cell',
    description: 'Permanent +1 shield cell, in addition to the three collectible base cells.',
  },
};

export const LATE_ROUTE_REWARDS: Readonly<Record<CampaignRoute, RouteRewardDefinition<LateRouteRewardId>>> = {
  storm: {
    id: 'vector-vanes', route: 'storm', missionId: 'stormbreak', destination: 'Stormbreak Pursuit',
    objective: 'Chase the carrier wing and intercept its live directive.',
    name: 'VECTOR VANES', effect: '+8% lateral speed', description: 'Fly 8% faster sideways for the rest of the campaign.',
  },
  salvage: {
    id: 'salvagers-license', route: 'salvage', missionId: 'graveyard', destination: 'Graveyard Salvage',
    objective: 'Defeat the salvage command ship and recover its original memory.',
    name: 'SALVAGER’S LICENSE', effect: '20 C off sortie modules', description: 'Each pilot saves 20 credits on their sortie module in every subsequent hangar.',
  },
};

export function destinationsAfter(mission?: MissionId): Readonly<Record<CampaignRoute, RouteRewardDefinition>> {
  return mission === 'fortress' ? LATE_ROUTE_REWARDS : ROUTE_REWARDS;
}

export function securedRewards(state: CampaignSnapshot): string[] {
  return [...Object.values(ROUTE_REWARDS), ...Object.values(LATE_ROUTE_REWARDS)]
    .filter(reward => reward.id === state.routeReward || reward.id === state.lateRouteReward)
    .map(reward => `${reward.name} · ${reward.effect}`);
}

export function sortiePrice(cost: number, reward?: LateRouteRewardId): number {
  return Math.max(0, cost - (reward === 'salvagers-license' ? 20 : 0));
}

export function routeRewardForClear(missionId: MissionId, route?: CampaignRoute): RouteRewardId | undefined {
  return route && ROUTE_REWARDS[route].missionId === missionId ? ROUTE_REWARDS[route].id : undefined;
}

/** Derive from earned state each time; retry/respec must never accumulate the bonus. */
export function applyRouteReward(modifiers: CombatModifiers, reward?: RouteRewardId, lateReward?: LateRouteRewardId): CombatModifiers {
  return {
    ...modifiers,
    arcDamageMultiplier: reward === 'arc-resonator' ? 1.12 : 1,
    shieldCapacityBonus: reward === 'aegis-bastion' ? 1 : 0,
    lateralSpeedMultiplier: lateReward === 'vector-vanes' ? 1.08 : 1,
  };
}
