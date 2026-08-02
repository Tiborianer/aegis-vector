import type { Difficulty, EnemyKind, WeaponType } from '../simulation/types';

export const WORLD_WIDTH = 1280;
export const WORLD_HEIGHT = 720;
export const STAGE_DURATION_MS = 330_000;
export const SHIELD_RECHARGE_MS = 7_000;

export interface DifficultyTuning {
  enemyHealth: number;
  enemyBulletSpeed: number;
  enemyFireRate: number;
  dropChance: number;
  scoreScale: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyTuning> = {
  cadet: {
    enemyHealth: 0.82,
    enemyBulletSpeed: 0.78,
    enemyFireRate: 0.72,
    dropChance: 0.26,
    scoreScale: 0.85,
  },
  pilot: {
    enemyHealth: 1,
    enemyBulletSpeed: 1,
    enemyFireRate: 1,
    dropChance: 0.2,
    scoreScale: 1,
  },
  ace: {
    enemyHealth: 1.22,
    enemyBulletSpeed: 1.18,
    enemyFireRate: 1.25,
    dropChance: 0.16,
    scoreScale: 1.25,
  },
};

export const ENEMIES: Record<EnemyKind, { health: number; speed: number; score: number; fireMs: number }> = {
  scout: { health: 2, speed: 145, score: 100, fireMs: 2_400 },
  interceptor: { health: 4, speed: 190, score: 180, fireMs: 1_900 },
  bomber: { health: 12, speed: 82, score: 420, fireMs: 1_450 },
  elite: { health: 22, speed: 96, score: 850, fireMs: 1_050 },
  boss: { health: 520, speed: 46, score: 18_000, fireMs: 680 },
};

export const WEAPON_LABELS: Record<WeaponType, { short: string; name: string; color: number; css: string }> = {
  spread: { short: 'ARC', name: 'Arc Cannon', color: 0x35e8ff, css: '#35e8ff' },
  missile: { short: 'NOVA', name: 'Nova Missiles', color: 0xffb640, css: '#ffb640' },
  laser: { short: 'LANCE', name: 'Lance Laser', color: 0xf06cff, css: '#f06cff' },
  drone: { short: 'WING', name: 'Wing Drones', color: 0x65ffb1, css: '#65ffb1' },
};

export const PICKUP_SEQUENCE: Array<WeaponType | 'shield'> = [
  'spread',
  'missile',
  'laser',
  'drone',
  'spread',
  'shield',
];
