import { publicAssetUrl } from '../assets/publicAsset';
import type { SortieModuleDefinition, SortieModuleId } from '../simulation/types';

const MODULE_DEFINITIONS = [
  { id: 'reserve-emp', name: 'RESERVE EMP', description: 'Begin the next mission with one additional EMP charge.', cost: 40, icon: '' },
  { id: 'armament-scanner', name: 'ARMAMENT SCANNER', description: 'Preview the first Armament Carrier offer before launch.', cost: 35, icon: '' },
  { id: 'emergency-nanites', name: 'EMERGENCY NANITES', description: 'Automatically restore one hull when reaching critical integrity.', cost: 50, icon: '' },
  { id: 'wingman-beacon', name: 'WINGMAN BEACON', description: 'Deploy one temporary support drone for the next mission.', cost: 65, icon: '' },
] satisfies SortieModuleDefinition[];

export const SORTIE_MODULES: SortieModuleDefinition[] = MODULE_DEFINITIONS.map((module) => ({
  ...module,
  icon: publicAssetUrl(`ui/upgrades/${module.id}.png`),
}));

export function getSortieModule(id: SortieModuleId): SortieModuleDefinition {
  const module = SORTIE_MODULES.find((candidate) => candidate.id === id);
  if (!module) throw new Error(`Unknown sortie module: ${id}`);
  return module;
}
