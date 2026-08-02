export type Difficulty = 'cadet' | 'pilot' | 'ace';
export type WeaponType = 'spread' | 'missile' | 'laser' | 'drone';
export type UpgradeType = WeaponType | 'shield';
export type EnemyKind = 'scout' | 'interceptor' | 'bomber' | 'elite' | 'boss';
export type GameMode = 'briefing' | 'playing' | 'paused' | 'gameover' | 'victory';
export type DamageResult = 'ignored' | 'shield' | 'hull' | 'destroyed';

export interface WeaponLevels {
  spread: number;
  missile: number;
  laser: number;
  drone: number;
}

export interface GameSnapshot {
  mode: GameMode;
  difficulty: Difficulty;
  hull: number;
  hullMax: number;
  shield: number;
  shieldMax: number;
  shieldRechargeRemainingMs: number;
  weapons: WeaponLevels;
  score: number;
  highScore: number;
  multiplier: number;
  kills: number;
  stageElapsedMs: number;
  stageDurationMs: number;
  bossActive: boolean;
  bossHealthRatio: number;
}
