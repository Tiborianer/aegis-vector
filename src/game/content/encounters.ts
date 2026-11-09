import { DIFFICULTY } from './balance';
import type {
  Difficulty,
  EnemyKind,
  MissionDifficultyProfile,
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

export const MISSION_DIFFICULTY: Record<Difficulty, Record<MissionId, MissionDifficultyProfile>> = {
  cadet: {
    coastal: { healthScale: 0.78, pressureScale: 0.85 },
    minefield: { healthScale: 1.14, pressureScale: 1 },
    aurora: { healthScale: 1.14, pressureScale: 1 },
    fortress: { healthScale: 1.5, pressureScale: 1.05 },
    stormbreak: { healthScale: 1.7, pressureScale: 1.05 },
    graveyard: { healthScale: 1.7, pressureScale: 1.05 },
    carrierSiege: { healthScale: 1.95, pressureScale: 1.08 },
    dreadnought: { healthScale: 2.25, pressureScale: 1.12 },
    lastLight: { healthScale: 2.45, pressureScale: 1.12 },
  },
  pilot: {
    coastal: { healthScale: 0.82, pressureScale: 0.88 },
    minefield: { healthScale: 1.3, pressureScale: 1.03 },
    aurora: { healthScale: 1.3, pressureScale: 1.03 },
    fortress: { healthScale: 1.7, pressureScale: 1.08 },
    stormbreak: { healthScale: 1.95, pressureScale: 1.1 },
    graveyard: { healthScale: 1.95, pressureScale: 1.1 },
    carrierSiege: { healthScale: 2.3, pressureScale: 1.13 },
    dreadnought: { healthScale: 2.65, pressureScale: 1.17 },
    lastLight: { healthScale: 2.85, pressureScale: 1.17 },
  },
  ace: {
    coastal: { healthScale: 0.95, pressureScale: 0.95 },
    minefield: { healthScale: 1.48, pressureScale: 1.08 },
    aurora: { healthScale: 1.48, pressureScale: 1.08 },
    fortress: { healthScale: 1.98, pressureScale: 1.16 },
    stormbreak: { healthScale: 2.25, pressureScale: 1.18 },
    graveyard: { healthScale: 2.25, pressureScale: 1.18 },
    carrierSiege: { healthScale: 2.65, pressureScale: 1.22 },
    dreadnought: { healthScale: 3.05, pressureScale: 1.28 },
    lastLight: { healthScale: 3.3, pressureScale: 1.28 },
  },
};

const WAVE_INTERVALS: Record<Difficulty, readonly number[]> = {
  cadet: [5_400, 5_000, 4_600, 4_200, 3_800],
  pilot: [5_400, 4_900, 4_400, 4_000, 3_600],
  ace: [5_400, 4_800, 4_200, 3_700, 3_200],
};

const WAVE_BUDGETS: Record<Difficulty, readonly number[]> = {
  cadet: [4, 4, 5, 6, 7],
  pilot: [4, 5, 6, 8, 9],
  ace: [4, 5, 7, 9, 11],
};

const CARRIER_MILESTONES: Record<MissionId, readonly number[]> = {
  coastal: [0.12, 0.52, 0.84],
  minefield: [0.18, 0.42, 0.65],
  aurora: [0.18, 0.42, 0.65],
  fortress: [0.15, 0.33, 0.51, 0.69],
  stormbreak: [0.18, 0.48, 0.78],
  graveyard: [0.18, 0.48, 0.78],
  carrierSiege: [0.14, 0.36, 0.58, 0.76],
  dreadnought: [],
  lastLight: [],
};

const CARRIER_OFFSETS: Record<MissionId, number> = {
  coastal: 0,
  minefield: 3,
  // Mutually exclusive level-two branches share offer positions, so choosing a
  // route never rerolls the campaign's deterministic armament progression.
  aurora: 3,
  fortress: 7,
  stormbreak: 12,
  graveyard: 15,
  carrierSiege: 18,
  dreadnought: 22,
  lastLight: 22,
};

export const COASTAL_FIRST_SALVO_WARNING_MS = 700;

export function isCoastalOpening(missionId: MissionId, progress: number): boolean {
  return missionId === 'coastal' && progress < 0.2;
}

export function getThreatLevel(progress: number): ThreatLevel {
  const normalized = Math.max(0, Math.min(1, progress));
  for (let index = THREAT_PHASES.length - 1; index >= 0; index -= 1) {
    const phase = THREAT_PHASES[index];
    if (normalized >= phase.startsAtProgress) return phase.level;
  }
  return 1;
}

export function getThreatTuning(progress: number, difficulty: Difficulty, missionId: MissionId): ThreatTuning {
  const normalized = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const phase = THREAT_PHASES[getThreatLevel(normalized) - 1];
  const curve = DIFFICULTY[difficulty].threatCurve;
  const profile = MISSION_DIFFICULTY[difficulty][missionId];
  const scale = (value: number): number => 1 + (value - 1) * curve;
  const phaseIndex = phase.level - 1;
  const opening = missionId === 'coastal' && normalized < 0.4;
  // Give new pilots more reading time, then smoothly remove the extra relief
  // between 20% and 30%. Difficulty's own pressure still applies throughout.
  const openingBulletScale = missionId === 'coastal'
    ? 0.9 + 0.1 * Math.max(0, Math.min(1, (normalized - 0.2) / 0.1)) : 1;
  return {
    ...phase,
    // Durability rises continuously with mission time, not in response to the
    // player's weapon choices. Buying an upgrade still immediately helps.
    enemyHealth: (1 + normalized * 0.6 * curve) * profile.healthScale,
    movementSpeed: scale(phase.movementSpeed) * (1 + (profile.pressureScale - 1) * 0.45),
    fireRate: scale(phase.fireRate) * profile.pressureScale,
    bulletSpeed: scale(phase.bulletSpeed) * (1 + (profile.pressureScale - 1) * 0.35) * openingBulletScale,
    waveIntervalMs: WAVE_INTERVALS[difficulty][phaseIndex] + (opening ? phaseIndex === 0 ? 1_000 : 600 : 0),
    waveBudget: Math.max(2, WAVE_BUDGETS[difficulty][phaseIndex] - (opening ? 1 : 0)),
    missionScale: profile.healthScale,
    pressureScale: profile.pressureScale,
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
  if (missionId === 'aurora') return localIndex === 0 ? 'prism' : localIndex === 1 ? 'leech' : 'elite';
  if (missionId === 'fortress') return localIndex % 2 === 0 ? 'elite' : 'shieldCarrier';
  if (missionId === 'stormbreak') return localIndex === 0 ? 'phantom' : localIndex === 1 ? 'artillery' : 'elite';
  if (missionId === 'graveyard') return localIndex === 0 ? 'reclaimer' : localIndex === 1 ? 'bulwark' : 'elite';
  if (missionId === 'carrierSiege') return localIndex % 2 === 0 ? 'artillery' : 'phantom';
  return 'elite';
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

export interface EncounterSpawn { kind: EnemyKind; x: number; y: number; phase: number }

/** Complete, seeded Aurora formations. The render adapter only spawns these;
 * cursor restoration recreates precisely the same future wings. */
export function auroraWave(director: EncounterDirector, waveIndex: number, progress: number): EncounterSpawn[] {
  const phase = Math.max(0, Math.floor(waveIndex));
  const center = director.between(phase, 81, 350, 930);
  const spawn = (kind: EnemyKind, x: number, y: number, offset = 0): EncounterSpawn => ({ kind, x, y, phase: phase + offset });
  switch (phase % 6) {
    case 0: return [spawn('scout', center - 100, -70), spawn('scout', center, -110, 1), spawn('scout', center + 100, -150, 2)];
    case 1: return [spawn('interceptor', -30, 100), spawn('interceptor', 1310, 220, 1)];
    case 2: return [spawn('prism', center, -85), spawn('scout', 300, -155, 1), spawn('scout', 980, -195, 2)];
    case 3: return [spawn('leech', center, -90), spawn('scout', center < 640 ? 970 : 310, -175, 1)];
    case 4: return progress >= .45
      ? [spawn('prism', 330, -90), spawn('prism', 950, -190, 1)]
      : [spawn('prism', center, -90), spawn('bomber', center < 640 ? 950 : 330, -180, 1)];
    default: return progress >= .60
      ? [spawn('leech', 640, -90), spawn('prism', center < 640 ? 990 : 290, -210, 1)]
      : [spawn('bomber', center, -90), spawn('scout', 300, -180, 1), spawn('scout', 980, -180, 2)];
  }
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
