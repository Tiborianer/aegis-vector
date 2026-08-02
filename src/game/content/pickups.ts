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
  recentOptions: readonly UpgradeType[] = [],
  previousPair?: readonly [UpgradeType, UpgradeType],
): ArmamentOffer {
  const random = seededRandom(campaignSeed ^ Math.imul(carrierIndex + 1, 0x9e3779b1));
  const locked = WEAPON_TYPES.filter((type) => weapons[type] === 0);
  if (carrierIndex === 0 && locked.length >= 2) {
    const first = locked[Math.floor(random() * locked.length)];
    const secondPool = locked.filter((type) => type !== first);
    const second = secondPool[Math.floor(random() * secondPool.length)];
    return { carrierIndex, options: [first, second], expiresAfterMs: 12_000 };
  }

  const eligible = PERMANENT_TYPES.filter((type) => isPermanentEligible(type, weapons, shieldBaseMax));
  const minimumWeaponLevel = Math.min(...WEAPON_TYPES.filter((type) => weapons[type] < 5).map((type) => weapons[type]));
  const strategy = carrierIndex % 2 === 0 ? 'growth' : 'diversity';
  const shieldWasRecent = previousPair?.includes('shield') ?? false;

  const weightFor = (type: UpgradeType): number => {
    if (type === 'shield') return shieldWasRecent ? 0 : 1;
    const level = weapons[type];
    let weight = 1;
    if (strategy === 'growth') weight = level > 0 ? 3 : 1.5;
    else if (level === 0) weight = 3;
    else if (level === minimumWeaponLevel) weight = 2;
    if (recentOptions.includes(type)) weight *= 0.3;
    return weight;
  };

  const pick = (excluded?: UpgradeType): UpgradeType => weightedPick(
    eligible.filter((type) => type !== excluded),
    weightFor,
    random,
  ) ?? eligible.find((type) => type !== excluded) ?? eligible[0] ?? 'spread';

  let first = pick();
  let second = pick(first);
  if (previousPair && samePair([first, second], previousPair)) {
    const alternatives = eligible.filter((type) => type !== first && type !== second);
    const replacement = weightedPick(alternatives, weightFor, random);
    if (replacement) second = replacement;
    else {
      const alternativeFirst = weightedPick(eligible.filter((type) => type !== first), weightFor, random);
      if (alternativeFirst) first = alternativeFirst;
    }
  }
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
  lastUtility?: UtilityPickupType,
  allowExcessEmpScore = false,
): UtilityPickupType {
  const weights: Record<UtilityPickupType, number> = {
    repair: hull <= hullMax / 2 ? 5 : hull < hullMax ? 3 : 0.75,
    emp: empCharges <= 0 ? 4 : empCharges < empMax ? 2 : allowExcessEmpScore ? 0.75 : 0,
    overdrive: 2,
    tractor: 2,
  };
  if (lastUtility) weights[lastUtility] *= 0.4;
  return weightedPick(UTILITY_TYPES, (type) => weights[type], random) ?? 'overdrive';
}

export function isUtilityPickup(type: UpgradeType | UtilityPickupType): type is UtilityPickupType {
  return UTILITY_TYPES.includes(type as UtilityPickupType);
}

function isPermanentEligible(type: UpgradeType, weapons: WeaponLevels, shieldBaseMax: number): boolean {
  return type === 'shield' ? shieldBaseMax < 3 : weapons[type] < 5;
}

function weightedPick<T>(items: readonly T[], weightFor: (item: T) => number, random: () => number): T | undefined {
  const weights = items.map((item) => Math.max(0, weightFor(item)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return undefined;
  let cursor = random() * total;
  for (let index = 0; index < items.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) return items[index];
  }
  return items.at(-1);
}

function samePair(left: readonly UpgradeType[], right: readonly UpgradeType[]): boolean {
  return left.length === right.length && left.every((type) => right.includes(type));
}
