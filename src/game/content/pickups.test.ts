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

  it('applies the utility repeat penalty across a thousand deterministic draws', () => {
    const counts = { repair: 0, overdrive: 0, tractor: 0, emp: 0 };
    for (let seed = 0; seed < 1_000; seed += 1) {
      let value = seed + 1;
      const random = () => {
        value = Math.imul(value ^ (value >>> 15), 1 | value);
        return ((value >>> 0) % 10_000) / 10_000;
      };
      counts[chooseUtilityPickup(3, 3, 0, 2, random, 'emp')] += 1;
    }
    expect(counts.emp).toBeLessThan(counts.overdrive + counts.tractor);
    expect(counts.repair).toBeGreaterThan(0);
  });

  it('varies permanent pairs across campaigns while keeping each retry stable', () => {
    const weapons = { spread: 2, missile: 1, laser: 0, drone: 0, ion: 0 } as const;
    const pairs = new Set<string>();
    for (let seed = 1; seed <= 1_000; seed += 1) {
      const offer = chooseArmamentOffer(weapons, 1, seed, 3, ['spread'], ['spread', 'missile']);
      expect(offer.options[0]).not.toBe(offer.options[1]);
      expect(chooseArmamentOffer(weapons, 1, seed, 3, ['spread'], ['spread', 'missile'])).toEqual(offer);
      pairs.add([...offer.options].sort().join(':'));
    }
    expect(pairs.size).toBeGreaterThan(3);
  });
});
