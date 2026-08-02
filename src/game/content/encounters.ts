import { DIFFICULTY } from './balance';
import type {
  Difficulty,
  EnemyKind,
  MissionId,
  ThreatLevel,
  ThreatPhase,
  ThreatTuning,
} from '../simulation/types';

export const THREAT_PHASES: readonly ThreatPhase[] = [
  { level: 1, startsAtProgress: 0, enemyHealth: 1, movementSpeed: 1, fireRate: 1, bulletSpeed: 1, waveIntervalMs: 5_400, waveBudget: 4 },
  { level: 2, startsAtProgress: 0.2, enemyHealth: 1.06, movementSpeed: 1.03, fireRate: 1.07, bulletSpeed: 1.02, waveIntervalMs: 4_800, waveBudget: 5 },
  { level: 3, startsAtProgress: 0.4, enemyHealth: 1.12, movementSpeed: 1.06, fireRate: 1.15, bulletSpeed: 1.05, waveIntervalMs: 4_200, waveBudget: 7 },
  { level: 4, startsAtProgress: 0.6, enemyHealth: 1.2, movementSpeed: 1.1, fireRate: 1.24, bulletSpeed: 1.08, waveIntervalMs: 3_700, waveBudget: 9 },
  { level: 5, startsAtProgress: 0.8, enemyHealth: 1.28, movementSpeed: 1.14, fireRate: 1.34, bulletSpeed: 1.11, waveIntervalMs: 3_200, waveBudget: 11 },
];

const MISSION_SCALE: Record<MissionId, number> = {
  coastal: 1,
  minefield: 1.08,
  fortress: 1.16,
  dreadnought: 1.22,
};

const CARRIER_MILESTONES: Record<MissionId, readonly number[]> = {
  coastal: [0.2, 0.52, 0.84],
  minefield: [0.18, 0.42, 0.65],
  fortress: [0.15, 0.33, 0.51, 0.69],
  dreadnought: [],
};

const CARRIER_OFFSETS: Record<MissionId, number> = {
  coastal: 0,
  minefield: 3,
  fortress: 7,
  dreadnought: 12,
};

export function getThreatLevel(progress: number): ThreatLevel {
  const normalized = Math.max(0, Math.min(1, progress));
  for (let index = THREAT_PHASES.length - 1; index >= 0; index -= 1) {
    const phase = THREAT_PHASES[index];
    if (normalized >= phase.startsAtProgress) return phase.level;
  }
  return 1;
}

export function getThreatTuning(progress: number, difficulty: Difficulty, missionId: MissionId): ThreatTuning {
  const phase = THREAT_PHASES[getThreatLevel(progress) - 1];
  const curve = DIFFICULTY[difficulty].threatCurve;
  const missionScale = MISSION_SCALE[missionId];
  const scale = (value: number): number => 1 + (value - 1) * curve;
  return {
    ...phase,
    enemyHealth: scale(phase.enemyHealth) * missionScale,
    movementSpeed: scale(phase.movementSpeed) * (1 + (missionScale - 1) * 0.45),
    fireRate: scale(phase.fireRate) * missionScale,
    bulletSpeed: scale(phase.bulletSpeed) * (1 + (missionScale - 1) * 0.35),
    missionScale,
  };
}

export function carrierMilestones(missionId: MissionId): readonly number[] {
  return CARRIER_MILESTONES[missionId];
}

export function globalCarrierIndex(missionId: MissionId, localIndex: number): number {
  return CARRIER_OFFSETS[missionId] + localIndex;
}

export function carrierKind(missionId: MissionId, localIndex: number): EnemyKind {
  if (missionId === 'coastal') return localIndex === 0 ? 'bomber' : localIndex === 1 ? 'charger' : 'elite';
  if (missionId === 'minefield') return localIndex === 0 ? 'mineLayer' : localIndex === 1 ? 'shieldCarrier' : 'elite';
  return localIndex % 2 === 0 ? 'elite' : 'shieldCarrier';
}

export function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export class EncounterDirector {
  constructor(
    private readonly seed: number,
    private readonly difficulty: Difficulty,
    private readonly missionId: MissionId,
  ) {}

  tuning(progress: number): ThreatTuning {
    return getThreatTuning(progress, this.difficulty, this.missionId);
  }

  between(waveIndex: number, salt: number, min: number, max: number): number {
    const missionHash = [...this.missionId].reduce((hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16_777_619), 2_166_136_261);
    const random = seededRandom(this.seed ^ missionHash ^ Math.imul(waveIndex + 1, 0x45d9f3b) ^ Math.imul(salt + 1, 0x27d4eb2d));
    return Math.floor(random() * (max - min + 1)) + min;
  }
}
