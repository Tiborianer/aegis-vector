import type { MissionDefinition } from '../simulation/types';

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
    id: 'dreadnought',
    number: 4,
    music: 'boss',
    sector: 'FINAL VECTOR',
    title: 'DREADNOUGHT',
    durationMs: 120_000,
    briefing: 'The fortress core is exposed. Bring down the Dreadnought and secure the Pelagos Array.',
    newThreats: ['THREE-PHASE FORTRESS ASSAULT'],
    completionCredits: 0,
    finale: true,
    visualProfile: 'dreadnought',
  },
];

export function getMission(index: number): MissionDefinition {
  const mission = MISSIONS[index];
  if (!mission) throw new Error(`Unknown mission index: ${index}`);
  return mission;
}
