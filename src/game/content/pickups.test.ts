import { describe, expect, it } from 'vitest';
import { chooseArmamentOffer, chooseUtilityPickup, shouldDropUtility } from './pickups';

describe('armament and utility drops', () => {
  it('creates a deterministic pair for a campaign carrier', () => {
    const weapons = { spread: 1, missile: 0, laser: 0, drone: 0, ion: 0 } as const;
    const first = chooseArmamentOffer(weapons, 1, 42, 0);
    const retry = chooseArmamentOffer(weapons, 1, 42, 0);
    expect(first).toEqual(retry);
    expect(first.options[0]).not.toBe(first.options[1]);
    expect(first.options.every((option) => ['missile', 'laser', 'drone', 'ion'].includes(option))).toBe(true);
  });

  it('never offers a maximized armament', () => {
    const offer = chooseArmamentOffer(
      { spread: 5, missile: 5, laser: 5, drone: 4, ion: 5 },
      3,
      87,
      4,
    );
    expect(offer.options).toContain('drone');
    expect(offer.options).not.toContain('shield');
  });

  it('guarantees utility pity after eighteen dry kills', () => {
    expect(shouldDropUtility('ace', 17, () => 0.99)).toBe(false);
    expect(shouldDropUtility('ace', 18, () => 0.99)).toBe(true);
  });

  it('favors repair when hull is damaged', () => {
    expect(chooseUtilityPickup(1, 3, 1, 2, () => 0)).toBe('repair');
  });
});
