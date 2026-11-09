import { describe, expect, it } from 'vitest';
import { canTractorPickup, chooseArmamentOffer, chooseUtilityPickup, shouldDropUtility } from './pickups';

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
      { spread: 7, missile: 5, laser: 5, drone: 4, ion: 5 },
      3,
      87,
      4,
    );
    expect(offer.options).toContain('drone');
    expect(offer.options).not.toContain('shield');
  });

  it('continues offering ARC after level five but stops at seven', () => {
    for (const spread of [5, 6] as const) {
      const weapons = { spread, missile: 5, laser: 5, drone: 4, ion: 5 } as const;
      const offer = chooseArmamentOffer(weapons, 3, 87, 4);
      expect(offer.options).toContain('spread');
      expect(offer.options).toContain('drone');
      expect(chooseArmamentOffer(weapons, 3, 87, 4)).toEqual(offer);
    }
    expect(chooseArmamentOffer({ spread: 7, missile: 5, laser: 5, drone: 4, ion: 5 }, 3, 87, 4).options).not.toContain('spread');
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

  it('keeps paired Armament choices outside Tractor control', () => {
    expect(canTractorPickup(undefined)).toBe(true);
    expect(canTractorPickup(7)).toBe(false);
  });

  it('makes Overdrive less than a third of full-capacity drops and suppresses active repeats', () => {
    const counts = { normal: 0, repeated: 0, active: 0, both: 0 };
    for (let sample = 0; sample < 10_000; sample += 1) {
      const random = () => (sample + 0.5) / 10_000;
      if (chooseUtilityPickup(3, 3, 2, 2, random) === 'overdrive') counts.normal += 1;
      if (chooseUtilityPickup(3, 3, 2, 2, random, 'overdrive') === 'overdrive') counts.repeated += 1;
      if (chooseUtilityPickup(3, 3, 2, 2, random, undefined, false, { overdrive: true }) === 'overdrive') counts.active += 1;
      if (chooseUtilityPickup(3, 3, 2, 2, random, 'overdrive', false, { overdrive: true }) === 'overdrive') counts.both += 1;
    }
    expect(counts.normal).toBeGreaterThan(2_500);
    expect(counts.normal).toBeLessThan(3_000);
    expect(counts.repeated).toBeLessThan(counts.normal / 3);
    expect(counts.active).toBeLessThan(counts.normal / 4);
    expect(counts.both).toBeLessThan(150);
  });

  it('prioritizes needed repairs and EMP rather than flooding the screen with power boosts', () => {
    const counts = { repair: 0, overdrive: 0, tractor: 0, emp: 0 };
    for (let sample = 0; sample < 10_000; sample += 1) {
      counts[chooseUtilityPickup(1, 3, 0, 2, () => (sample + 0.5) / 10_000)] += 1;
    }
    expect(counts.repair + counts.emp).toBeGreaterThan(8_000);
    expect(counts.overdrive).toBeLessThan(800);
  });
});
