import type { Difficulty, EnemyKind, WeaponType } from '../simulation/types';

export const WORLD_WIDTH = 1280;
export const WORLD_HEIGHT = 720;
export const SHIELD_RECHARGE_MS = 7_000;
export const MAX_ACTIVE_ENEMIES = 16;
export const MAX_HOSTILE_PROJECTILES = 48;
export const MAX_ACTIVE_MINES = 6;

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
  bomber: { health: 12, speed: 82, score: 420, credits: 4, fireMs: 1_450 },
  elite: { health: 22, speed: 96, score: 850, credits: 8, fireMs: 1_050 },
  charger: { health: 7, speed: 118, score: 320, credits: 5, fireMs: 9_999 },
  sniper: { health: 8, speed: 90, score: 380, credits: 5, fireMs: 3_500 },
  mineLayer: { health: 14, speed: 72, score: 520, credits: 5, fireMs: 1_700 },
  shieldCarrier: { health: 18, speed: 68, score: 620, credits: 5, fireMs: 2_300 },
  bulwark: { health: 30, speed: 58, score: 750, credits: 6, fireMs: 2_600 },
  phantom: { health: 9, speed: 175, score: 480, credits: 6, fireMs: 2_500 },
  artillery: { health: 18, speed: 62, score: 720, credits: 7, fireMs: 3_400 },
  reclaimer: { health: 10, speed: 135, score: 560, credits: 6, fireMs: 9_999 },
  carrierBoss: { health: 310, speed: 38, score: 8_000, credits: 40, fireMs: 900 },
  warden: { health: 220, speed: 42, score: 5_000, credits: 35, fireMs: 850 },
  boss: { health: 620, speed: 46, score: 18_000, credits: 0, fireMs: 680 },
};

export const WEAPON_LABELS: Record<WeaponType, { short: string; name: string; color: number; css: string }> = {
  spread: { short: 'ARC', name: 'Arc Cannon', color: 0x35e8ff, css: '#35e8ff' },
  missile: { short: 'NOVA', name: 'Nova Missiles', color: 0xffb640, css: '#ffb640' },
  laser: { short: 'LANCE', name: 'Lance Laser', color: 0xf06cff, css: '#f06cff' },
  drone: { short: 'WING', name: 'Wing Drones', color: 0x65ffb1, css: '#65ffb1' },
  ion: { short: 'ION', name: 'Ion Conductor', color: 0xb79cff, css: '#b79cff' },
};
