import { describe, expect, it } from 'vitest';
import { chooseSmartPickup } from './pickups';

describe('chooseSmartPickup', () => {
  it('chooses an available permanent upgrade within the 65 percent branch', () => {
    const values = [0.2, 0.6];
    const pickup = chooseSmartPickup(
      { spread: 3, missile: 0, laser: 3, drone: 3 },
      3,
      () => values.shift() ?? 0,
    );
    expect(pickup).toBe('missile');
  });

  it('returns only utility pickups when all permanent upgrades are maxed', () => {
    const pickup = chooseSmartPickup({ spread: 3, missile: 3, laser: 3, drone: 3 }, 3, () => 0.99);
    expect(['repair', 'overdrive', 'tractor', 'emp']).toContain(pickup);
  });
});
