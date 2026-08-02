import type { PickupType, UpgradeType, UtilityPickupType, WeaponLevels } from '../simulation/types';

const PERMANENT_TYPES: UpgradeType[] = ['spread', 'missile', 'laser', 'drone', 'shield'];
const UTILITY_TYPES: UtilityPickupType[] = ['repair', 'overdrive', 'tractor', 'emp'];

export function chooseSmartPickup(
  weapons: WeaponLevels,
  shieldBaseMax: number,
  random: () => number = Math.random,
): PickupType {
  const eligible = PERMANENT_TYPES.filter((type) => type === 'shield' ? shieldBaseMax < 3 : weapons[type] < 3);
  if (eligible.length > 0 && random() < 0.65) return eligible[Math.floor(random() * eligible.length)] ?? eligible[0];
  return UTILITY_TYPES[Math.floor(random() * UTILITY_TYPES.length)] ?? 'repair';
}

export function isUtilityPickup(type: PickupType): type is UtilityPickupType {
  return UTILITY_TYPES.includes(type as UtilityPickupType);
}
