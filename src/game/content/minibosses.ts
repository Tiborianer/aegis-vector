import type { MiniBossDefinition, MissionId } from '../simulation/types';

export const MINIBOSSES: readonly MiniBossDefinition[] = [
  {
    kind: 'razorwing',
    name: 'RAZORWING ACE',
    missions: ['coastal'],
    progress: 0.62,
    baseHealth: 72,
    score: 1_600,
    credits: 10,
  },
  {
    kind: 'gatekeeper',
    name: 'GATEKEEPER FRIGATE',
    missions: ['fortress'],
    progress: 0.6,
    baseHealth: 160,
    score: 3_000,
    credits: 15,
  },
  {
    kind: 'pursuer',
    name: 'CROWN PURSUER',
    missions: ['stormbreak', 'graveyard'],
    progress: 0.6,
    baseHealth: 190,
    score: 3_400,
    credits: 18,
  },
];

export function minibossForMission(missionId: MissionId): MiniBossDefinition | undefined {
  return MINIBOSSES.find((definition) => definition.missions.includes(missionId));
}
