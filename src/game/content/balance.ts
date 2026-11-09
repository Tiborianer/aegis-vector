import type { Difficulty, EnemyKind, WeaponLevel, WeaponType } from '../simulation/types';

export const WORLD_WIDTH = 1280;
export const WORLD_HEIGHT = 720;
export const PLAYER_COMBAT_MIN_Y = WORLD_HEIGHT * 0.29;
export const STATIONARY_PICKUP_SAFE_Y = PLAYER_COMBAT_MIN_Y + 52;
export const PICKUP_HORIZONTAL_MARGIN = 64;
export const SHIELD_RECHARGE_MS = 7_000;
export const MAX_ACTIVE_ENEMIES = 16;
export const MAX_HOSTILE_PROJECTILES = 48;
export const MAX_ACTIVE_MINES = 6;
/** A short burst or overlapping collider must not read as two shield hits. */
export const SHIELD_HIT_GRACE_MS = 850;
export const KINETIC_SHIELD_HIT_GRACE_MS = 1_000;
export const ACTIVE_TRACTOR_RADIUS = 360;
export const ACTIVE_TRACTOR_CREDIT_MULTIPLIER = 1.25;

/** ARC gains one bolt per battlefield level; other weapon progressions stay at five. */
export const WEAPON_MAX_LEVEL: Record<WeaponType, WeaponLevel> = {
  spread: 7, missile: 5, laser: 5, drone: 5, ion: 5,
};

export interface ArcVolley {
  angles: number[];
  damage: number;
  intervalMs: number;
}

/** Smooth growth instead of the old first-upgrade jump from one to three bolts. */
export function getArcVolley(level: number): ArcVolley {
  const count = Number.isFinite(level) ? Math.max(1, Math.min(WEAPON_MAX_LEVEL.spread, Math.floor(level))) : 1;
  return {
    angles: Array.from({ length: count }, (_, index) => (index - (count - 1) / 2) * 0.075),
    damage: 1 + Math.max(0, count - 3) * 0.05,
    intervalMs: 142 - (count - 1) * 8,
  };
}

export interface NovaVolley {
  count: number;
  damage: number;
  intervalMs: number;
  splashRadius: number;
  splashDamageMultiplier: number;
}

/** Homing is NOVA's advantage; it should not also outclass aimed weapons in damage. */
export function getNovaVolley(level: number): NovaVolley {
  const normalized = Number.isFinite(level) ? Math.max(0, Math.min(5, Math.floor(level))) : 0;
  return {
    count: normalized === 0 ? 0 : normalized >= 5 ? 3 : normalized >= 2 ? 2 : 1,
    damage: normalized === 0 ? 0 : 3.2 + normalized * 0.55,
    intervalMs: 1_240 - normalized * 80,
    splashRadius: normalized >= 5 ? 45 : 0,
    splashDamageMultiplier: 0.35,
  };
}

export interface DifficultyTuning {
  enemyHealth: number;
  enemyBulletSpeed: number;
  enemyFireRate: number;
  dropChance: number;
  scoreScale: number;
  threatCurve: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyTuning> = {
  cadet: {
    enemyHealth: 0.82,
    enemyBulletSpeed: 0.78,
    enemyFireRate: 0.72,
    dropChance: 0.26,
    scoreScale: 0.85,
    threatCurve: 0.6,
  },
  pilot: {
    enemyHealth: 1,
    enemyBulletSpeed: 1,
    enemyFireRate: 1,
    dropChance: 0.2,
    scoreScale: 1,
    threatCurve: 0.78,
  },
  ace: {
    enemyHealth: 1.22,
    enemyBulletSpeed: 1.18,
    enemyFireRate: 1.25,
    dropChance: 0.16,
    scoreScale: 1.25,
    threatCurve: 1.2,
  },
};

export interface EnemyTuning {
  health: number;
  speed: number;
  score: number;
  credits: number;
  fireMs: number;
}

export const ENEMIES: Record<EnemyKind, EnemyTuning> = {
  scout: { health: 2, speed: 145, score: 100, credits: 1, fireMs: 2_400 },
  interceptor: { health: 4, speed: 190, score: 180, credits: 2, fireMs: 1_900 },
  bomber: { health: 11, speed: 82, score: 420, credits: 4, fireMs: 1_450 },
  elite: { health: 20, speed: 96, score: 850, credits: 8, fireMs: 1_050 },
  charger: { health: 6, speed: 118, score: 320, credits: 5, fireMs: 9_999 },
  sniper: { health: 7, speed: 90, score: 380, credits: 5, fireMs: 3_500 },
  mineLayer: { health: 13, speed: 72, score: 520, credits: 5, fireMs: 1_700 },
  shieldCarrier: { health: 16, speed: 68, score: 620, credits: 5, fireMs: 2_300 },
  bulwark: { health: 30, speed: 58, score: 750, credits: 6, fireMs: 2_600 },
  phantom: { health: 8, speed: 175, score: 480, credits: 6, fireMs: 2_500 },
  artillery: { health: 16, speed: 62, score: 720, credits: 7, fireMs: 3_400 },
  reclaimer: { health: 9, speed: 135, score: 560, credits: 6, fireMs: 9_999 },
  skimmer: { health: 9, speed: 145, score: 340, credits: 6, fireMs: 2_400 },
  weaver: { health: 14, speed: 72, score: 560, credits: 8, fireMs: 3_100 },
  prism: { health: 8, speed: 108, score: 390, credits: 5, fireMs: 2_900 },
  leech: { health: 12, speed: 62, score: 520, credits: 6, fireMs: 3_600 },
  razorwing: { health: 110, speed: 148, score: 1_600, credits: 10, fireMs: 1_650 },
  gatekeeper: { health: 240, speed: 44, score: 3_000, credits: 15, fireMs: 1_250 },
  pursuer: { health: 285, speed: 66, score: 3_400, credits: 18, fireMs: 1_400 },
  carrierBoss: { health: 465, speed: 38, score: 8_000, credits: 40, fireMs: 900 },
  warden: { health: 310, speed: 42, score: 5_000, credits: 35, fireMs: 850 },
  boss: { health: 930, speed: 46, score: 18_000, credits: 0, fireMs: 680 },
  seraph: { health: 780, speed: 44, score: 14_000, credits: 30, fireMs: 1_000 },
  nullArchitect: { health: 1_000, speed: 38, score: 22_000, credits: 0, fireMs: 900 },
};

export const WEAPON_LABELS: Record<WeaponType, { short: string; name: string; color: number; css: string }> = {
  spread: { short: 'ARC', name: 'Arc Cannon', color: 0x35e8ff, css: '#35e8ff' },
  missile: { short: 'NOVA', name: 'Nova Missiles', color: 0xffb640, css: '#ffb640' },
  laser: { short: 'LANCE', name: 'Lance Laser', color: 0xf06cff, css: '#f06cff' },
  drone: { short: 'WING', name: 'Wing Drones', color: 0x65ffb1, css: '#65ffb1' },
  ion: { short: 'ION', name: 'Ion Conductor', color: 0xb79cff, css: '#b79cff' },
};
