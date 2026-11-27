import type { CombatModifiers, MissionId, WeaponLevels, WeaponType } from '../simulation/types';

export const COMMON_CRAFT = ['scout', 'interceptor', 'bomber', 'charger', 'sniper'] as const;
export type CommonCraft = typeof COMMON_CRAFT[number];
export const isCommonCraft = (kind: string): kind is CommonCraft => COMMON_CRAFT.some(craft => craft === kind);
export const PAINT = ['patrol', 'hazard', 'night'] as const;
export type SquadronPaint = typeof PAINT[number];
const markings: Record<MissionId, SquadronPaint> = {
  coastal: 'patrol', minefield: 'hazard', aurora: 'night', fortress: 'patrol',
  stormbreak: 'hazard', graveyard: 'night', carrierSiege: 'hazard', dreadnought: 'night', lastLight: 'patrol',
};
export const missionPaint = (id: MissionId): SquadronPaint => markings[id] ?? 'patrol';
export const paintedHull = (kind: CommonCraft, paint: SquadronPaint): string => `formation-${kind}-${paint}`;
export const paintedWreck = (kind: CommonCraft, paint: SquadronPaint): string => `breakup-${kind}-${paint}`;
export const KESTREL_EQUIPMENT = 'kestrel-equipment';
export const FORMATION_PARTS = 'formation-parts';
export const ROADMAP_ART = 'graphics-v2/roadmap/';

// Blender sheet order. Zero has no fitting; rank seven retains the stage-three silhouette.
export const HARDPOINTS = ['spread', 'laser', 'missile', 'drone', 'ion'] as const satisfies readonly WeaponType[];
export const equipmentStage = (rank: number): number => rank <= 0 ? 0 : rank < 3 ? 1 : rank < 5 ? 2 : 3;
type HardwareModifiers = Pick<CombatModifiers, 'overdriveReactor' | 'heliosBattery' | 'utilityDurationMultiplier' |
  'shieldCapacityBonus' | 'reserveShield' | 'repulsorShield' | 'aegisHarmonics' | 'guardianPulse' | 'shieldRechargeMs'>;
export function equipmentRows(weapons: WeaponLevels, shieldBase: number, modifiers: HardwareModifiers): number[] {
  const rows: number[] = [];
  HARDPOINTS.forEach((family, index) => {
    const stage = equipmentStage(weapons[family]);
    if (stage) rows.push(index * 3 + stage - 1);
  });
  if (shieldBase + modifiers.shieldCapacityBonus > 1 || modifiers.reserveShield || modifiers.repulsorShield ||
      modifiers.aegisHarmonics || modifiers.guardianPulse || modifiers.shieldRechargeMs < 7_000) rows.push(15);
  if (modifiers.overdriveReactor || modifiers.heliosBattery || modifiers.utilityDurationMultiplier > 1) rows.push(16);
  return rows;
}
