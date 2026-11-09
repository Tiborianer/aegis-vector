import { describe, expect, it } from 'vitest';
import { applyRouteReward, ROUTE_REWARDS, routeRewardForClear } from './routeRewards';
import { buildCombatModifiers } from './upgrades';

describe('earned route rewards', () => {
  it('awards only the mission on the selected route, never a shared or unfinished leg', () => {
    expect(routeRewardForClear('minefield', 'salvage')).toBe('arc-resonator');
    expect(routeRewardForClear('aurora', 'storm')).toBe('aegis-bastion');
    expect(routeRewardForClear('minefield', 'storm')).toBeUndefined();
    expect(routeRewardForClear('aurora', 'salvage')).toBeUndefined();
    expect(routeRewardForClear('minefield')).toBeUndefined();
    for (const mission of ['coastal', 'fortress', 'stormbreak', 'graveyard', 'carrierSiege', 'dreadnought', 'lastLight'] as const) {
      for (const route of ['storm', 'salvage'] as const) expect(routeRewardForClear(mission, route)).toBeUndefined();
    }
  });

  it('derives unique bonuses without accumulating or changing other purchased upgrades', () => {
    const purchased = buildCombatModifiers(['amplified-munitions', 'quick-charge-loop']);
    for (const { id } of Object.values(ROUTE_REWARDS)) {
      const first = applyRouteReward(purchased, id);
      expect(applyRouteReward(first, id)).toEqual(first);
      expect(first.damageMultiplier).toBe(purchased.damageMultiplier);
      expect(first.shieldRechargeMs).toBe(purchased.shieldRechargeMs);
      expect(purchased.arcDamageMultiplier).toBe(1);
      expect(purchased.shieldCapacityBonus).toBe(0);
    }
    expect(applyRouteReward(purchased, 'arc-resonator').arcDamageMultiplier).toBe(1.12);
    expect(applyRouteReward(purchased, 'arc-resonator').shieldCapacityBonus).toBe(0);
    expect(applyRouteReward(purchased, 'aegis-bastion').arcDamageMultiplier).toBe(1);
    expect(applyRouteReward(purchased, 'aegis-bastion').shieldCapacityBonus).toBe(1);
  });
});
