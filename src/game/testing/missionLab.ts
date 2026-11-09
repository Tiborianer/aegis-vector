import { WEAPON_MAX_LEVEL } from '../content/balance';
import { MISSIONS } from '../content/missions';
import { CampaignModel } from '../simulation/CampaignModel';
import type { CampaignSnapshot, Difficulty, MissionId, WeaponLevels } from '../simulation/types';

export type MissionLabLoadout = 'starter' | 'combat' | 'max';

export interface MissionLabOptions {
  mission?: MissionId;
  difficulty: Difficulty;
  godMode: boolean;
  loadout: MissionLabLoadout;
}

const missionId = (value: unknown): MissionId | undefined => MISSIONS.find(({ id }) => id === value)?.id;
const difficulty = (value: unknown): Difficulty => value === 'cadet' || value === 'ace' ? value : 'pilot';
const loadout = (value: unknown): MissionLabLoadout => value === 'starter' || value === 'max' ? value : 'combat';

export const isMissionLab = (query: string): boolean => new URLSearchParams(query).get('lab') === '1';

/** Lab configuration is URL-scoped: it never reads or modifies campaign storage. */
export function readMissionLabOptions(query: string): MissionLabOptions {
  const params = new URLSearchParams(query);
  return {
    mission: missionId(params.get('mission')),
    difficulty: difficulty(params.get('difficulty')),
    godMode: params.get('god') !== '0',
    loadout: loadout(params.get('loadout')),
  };
}

/** Start from a clean query so story, accelerated timers, old artwork overrides
 * and other development flags cannot accidentally change a selected test run. */
export function missionLabUrl(baseHref: string, options: Partial<MissionLabOptions> = {}): string {
  const url = new URL(baseHref);
  url.search = '';
  url.hash = '';
  url.searchParams.set('lab', '1');
  url.searchParams.set('debug', '1');
  url.searchParams.set('graphics', '1');
  const selectedMission = missionId(options.mission);
  if (selectedMission) url.searchParams.set('mission', selectedMission);
  url.searchParams.set('god', options.godMode === false ? '0' : '1');
  url.searchParams.set('difficulty', difficulty(options.difficulty));
  url.searchParams.set('loadout', loadout(options.loadout));
  return url.href;
}

/** Each sortie starts from an independent, reproducible snapshot. This must not
 * be merged with a saved campaign or grant route rewards, purchases or unlocks. */
export function createMissionLabCampaign(options: MissionLabOptions): CampaignSnapshot {
  const selectedMission = missionId(options.mission) ?? 'coastal';
  const selectedLoadout = loadout(options.loadout);
  const fresh = CampaignModel.fresh(difficulty(options.difficulty));
  const weapons: WeaponLevels = selectedLoadout === 'max' ? { ...WEAPON_MAX_LEVEL }
    : selectedLoadout === 'combat' ? { spread: 3, missile: 2, laser: 1, drone: 1, ion: 1 }
      : { ...fresh.weapons };
  return {
    ...fresh,
    currentMissionId: selectedMission,
    missionIndex: MISSIONS.findIndex(({ id }) => id === selectedMission),
    campaignSeed: 73101,
    weapons,
    shieldBaseMax: selectedLoadout === 'max' ? 3 : selectedLoadout === 'combat' ? 2 : 1,
  };
}
