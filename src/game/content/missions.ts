import type { CampaignRoute, MissionDefinition, MissionId } from '../simulation/types';

export const MISSIONS: MissionDefinition[] = [
  {
    id: 'coastal',
    number: 1,
    music: 'mission-coastal',
    sector: 'SECTOR 01',
    title: 'COASTAL INTERCEPT',
    durationMs: 195_000,
    briefing: 'Break the first assault over the Pelagos coast. Chargers and long-range Snipers have joined the enemy screen.',
    newThreats: ['CHARGER // TELEGRAPHED DIVE', 'SNIPER // LOCK-ON BEAM'],
    completionCredits: 25,
    finale: false,
    visualProfile: 'coastal',
  },
  {
    id: 'minefield',
    number: 2,
    music: 'mission-minefield',
    sector: 'SECTOR 02',
    title: 'MINEFIELD RUN',
    durationMs: 210_000,
    briefing: 'Punch through the defensive screen. Destroy the Warden before the mine belt closes around the fleet.',
    newThreats: ['MINE LAYER // AREA DENIAL', 'SHIELD CARRIER // PROTECTION FIELD', 'WARDEN // COMMAND CRAFT'],
    completionCredits: 35,
    finale: false,
    visualProfile: 'minefield',
  },
  {
    id: 'aurora',
    number: 2,
    music: 'mission-aurora',
    sector: 'VECTOR 02-A',
    title: 'AURORA REACH',
    durationMs: 210_000,
    briefing: 'Escort the shield research convoy through Vesper’s polar aurora. Break the Prism patrols and Leech batteries before they seal the ion corridor. Recover the Aegis Bastion: one permanent additional shield cell.',
    newThreats: ['PRISM // LOCKED THREE-BOLT FAN', 'LEECH // TELEGRAPHED PRESSURE BURST'],
    completionCredits: 35,
    finale: false,
    visualProfile: 'aurora',
  },
  {
    id: 'fortress',
    number: 3,
    music: 'mission-fortress',
    sector: 'SECTOR 03',
    title: 'FORTRESS APPROACH',
    durationMs: 225_000,
    briefing: 'All hostile signatures are converging. Break the command-elite gauntlet and open a path to the aerial fortress.',
    newThreats: ['MIXED SPECIALIST WINGS', 'COMMAND-ELITE GAUNTLET'],
    completionCredits: 45,
    finale: false,
    visualProfile: 'fortress',
  },
  {
    id: 'stormbreak',
    number: 4,
    music: 'mission-stormbreak',
    sector: 'ROUTE 04-A',
    title: 'STORMBREAK PURSUIT',
    durationMs: 210_000,
    briefing: 'Chase the escaping carrier wing through the storm belt. Break its Phantom screen and silence its artillery spotters.',
    newThreats: ['PHANTOM RAIDER // FLANKING STRIKE', 'ARTILLERY SKIMMER // MARKED IMPACT'],
    completionCredits: 60,
    finale: false,
    visualProfile: 'stormbreak',
  },
  {
    id: 'graveyard',
    number: 4,
    music: 'mission-graveyard',
    sector: 'ROUTE 04-B',
    title: 'GRAVEYARD SALVAGE',
    durationMs: 210_000,
    briefing: 'Cross the wreck field before hostile reclaimers strip the fleet. Recover utility stores and destroy the salvage command ship.',
    newThreats: ['RECLAIMER DRONE // UTILITY THIEF', 'WRECK BELT // CONFINED APPROACHES'],
    completionCredits: 60,
    finale: false,
    visualProfile: 'graveyard',
  },
  {
    id: 'carrierSiege',
    number: 5,
    music: 'mission-carrier-siege',
    sector: 'SECTOR 05',
    title: 'CARRIER SIEGE',
    durationMs: 225_000,
    briefing: 'Assault the Bastion Carrier. Destroy its command systems, survive the converging wings, and expose the route to the Dreadnought.',
    newThreats: ['MIXED ROUTE SPECIALISTS', 'BASTION CARRIER // MULTIPART COMMAND TARGET'],
    completionCredits: 75,
    finale: false,
    visualProfile: 'carrierSiege',
  },
  {
    id: 'dreadnought',
    number: 6,
    music: 'mission-dreadnought',
    sector: 'SECTOR 06',
    title: 'DREADNOUGHT',
    durationMs: 150_000,
    approachDurationMs: 30_000,
    briefing: 'Break through the final escort screen, close on the fortress core, and bring down the Dreadnought.',
    newThreats: ['FINAL ESCORT APPROACH', 'THREE-PHASE FORTRESS ASSAULT'],
    completionCredits: 95,
    finale: true,
    visualProfile: 'dreadnought',
  },
  {
    id: 'lastLight',
    number: 7,
    music: 'mission-last-light',
    sector: 'FINAL VECTOR',
    title: 'LAST LIGHT',
    durationMs: 210_000,
    approachDurationMs: 35_000,
    briefing: 'Follow the exposed Crown signal beyond the Dreadnought. Break the Seraph guardian, then silence Obsidian Crown before its command net closes over Vesper.',
    newThreats: ['SKIMMER // BANKING INTERCEPTOR', 'WEAVER // STAGGERED ENERGY LATTICE', 'SERAPH // SPLIT-RING GUARDIAN', 'OBSIDIAN CROWN // SIX-GUN COMMAND CRAFT'],
    completionCredits: 0,
    finale: true,
    visualProfile: 'lastLight',
  },
];

export function getMission(index: number): MissionDefinition {
  const mission = MISSIONS[index];
  if (!mission) throw new Error(`Unknown mission index: ${index}`);
  return mission;
}

export function getMissionById(id: MissionId): MissionDefinition {
  const mission = MISSIONS.find((candidate) => candidate.id === id);
  if (!mission) throw new Error(`Unknown mission id: ${id}`);
  return mission;
}

export function nextMissionId(current: MissionId, route?: CampaignRoute, earlyRoute?: CampaignRoute): MissionId | 'route' | 'victory' {
  if (current === 'coastal') return earlyRoute ? routeMissionId(earlyRoute, 'coastal') : 'route';
  if (current === 'minefield' || current === 'aurora') return 'fortress';
  // The reward route never selects the later evidence trail for the player.
  if (current === 'fortress') return route ? routeMissionId(route, 'fortress') : 'route';
  if (current === 'stormbreak' || current === 'graveyard') return 'carrierSiege';
  if (current === 'carrierSiege') return 'dreadnought';
  if (current === 'dreadnought') return 'lastLight';
  if (current === 'lastLight') return 'victory';
  return route === 'storm' ? 'stormbreak' : 'graveyard';
}

export function routeMissionId(route: CampaignRoute, afterMission: MissionId = 'coastal'): MissionId {
  if (afterMission === 'coastal') return route === 'storm' ? 'aurora' : 'minefield';
  return route === 'storm' ? 'stormbreak' : 'graveyard';
}
