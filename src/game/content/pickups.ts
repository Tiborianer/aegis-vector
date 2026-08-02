import { seededRandom } from './encounters';
import type {
  ArmamentOffer,
  Difficulty,
  UpgradeType,
  UtilityPickupType,
  WeaponLevels,
  WeaponType,
} from '../simulation/types';

const WEAPON_TYPES: WeaponType[] = ['spread', 'missile', 'laser', 'drone', 'ion'];
const PERMANENT_TYPES: UpgradeType[] = [...WEAPON_TYPES, 'shield'];
const UTILITY_TYPES: UtilityPickupType[] = ['repair', 'overdrive', 'tractor', 'emp'];

export function chooseArmamentOffer(
  weapons: WeaponLevels,
  shieldBaseMax: number,
  campaignSeed: number,
  carrierIndex: number,
): ArmamentOffer {
  const random = seededRandom(campaignSeed ^ Math.imul(carrierIndex + 1, 0x9e3779b1));
  const locked = WEAPON_TYPES.filter((type) => weapons[type] === 0);
  const developed = WEAPON_TYPES.filter((type) => weapons[type] > 0 && weapons[type] < 5)
    .sort((a, b) => weapons[b] - weapons[a]);
  const underdeveloped = WEAPON_TYPES.filter((type) => weapons[type] < 5)
    .sort((a, b) => weapons[a] - weapons[b]);

  let firstPool: UpgradeType[];
  let secondPool: UpgradeType[];
  if (carrierIndex === 0 && locked.length >= 2) {
    firstPool = [...locked];
    secondPool = [...locked];
  } else {
    firstPool = developed.length > 0 ? [...developed] : [...underdeveloped];
    secondPool = [...underdeveloped];
    if (shieldBaseMax < 3 && carrierIndex % 2 === 1) secondPool.push('shield');
  }

  const pick = (pool: UpgradeType[], excluded?: UpgradeType): UpgradeType => {
    const eligible = pool.filter((type) => type !== excluded && isPermanentEligible(type, weapons, shieldBaseMax));
    const fallback = PERMANENT_TYPES.filter((type) => type !== excluded && isPermanentEligible(type, weapons, shieldBaseMax));
    const choices = eligible.length > 0 ? eligible : fallback;
    return choices[Math.floor(random() * choices.length)] ?? 'spread';
  };
  const first = pick(firstPool);
  const second = pick(secondPool, first);
  return { carrierIndex, options: [first, second], expiresAfterMs: 12_000 };
}

export function shouldDropUtility(difficulty: Difficulty, killsSinceDrop: number, random: () => number = Math.random): boolean {
  if (killsSinceDrop >= 18) return true;
  const chance: Record<Difficulty, number> = { cadet: 0.08, pilot: 0.06, ace: 0.04 };
  return random() < chance[difficulty];
}

export function chooseUtilityPickup(
  hull: number,
  hullMax: number,
  empCharges: number,
  empMax: number,
  random: () => number = Math.random,
): UtilityPickupType {
  const weighted: UtilityPickupType[] = [];
  if (hull < hullMax) weighted.push('repair', 'repair', 'repair');
  else weighted.push('repair');
  if (empCharges < empMax) weighted.push('emp', 'emp');
  else weighted.push('emp');
  weighted.push('overdrive', 'tractor');
  return weighted[Math.floor(random() * weighted.length)] ?? 'overdrive';
}

export function isUtilityPickup(type: UpgradeType | UtilityPickupType): type is UtilityPickupType {
  return UTILITY_TYPES.includes(type as UtilityPickupType);
}

function isPermanentEligible(type: UpgradeType, weapons: WeaponLevels, shieldBaseMax: number): boolean {
  return type === 'shield' ? shieldBaseMax < 3 : weapons[type] < 5;
}
