import { DIFFICULTY, SHIELD_RECHARGE_MS, STAGE_DURATION_MS } from '../content/balance';
import type { DamageResult, Difficulty, GameMode, GameSnapshot, UpgradeType, WeaponLevels } from './types';

const emptyWeapons = (): WeaponLevels => ({ spread: 1, missile: 0, laser: 0, drone: 0 });

export class GameModel {
  mode: GameMode = 'briefing';
  difficulty: Difficulty = 'pilot';
  hull = 3;
  readonly hullMax = 3;
  shield = 1;
  shieldMax = 1;
  weapons = emptyWeapons();
  score = 0;
  highScore = 0;
  multiplier = 1;
  kills = 0;
  stageElapsedMs = 0;
  stageDurationMs = STAGE_DURATION_MS;
  bossActive = false;
  bossHealthRatio = 1;

  private lastDamageAt = Number.NEGATIVE_INFINITY;
  private invulnerableUntil = 0;
  private comboUntil = 0;
  private comboKills = 0;

  constructor(highScore = 0) {
    this.highScore = highScore;
  }

  start(difficulty: Difficulty, stageDurationMs = STAGE_DURATION_MS): void {
    this.mode = 'playing';
    this.difficulty = difficulty;
    this.hull = this.hullMax;
    this.shieldMax = 1;
    this.shield = this.shieldMax;
    this.weapons = emptyWeapons();
    this.score = 0;
    this.multiplier = 1;
    this.kills = 0;
    this.stageElapsedMs = 0;
    this.stageDurationMs = stageDurationMs;
    this.bossActive = false;
    this.bossHealthRatio = 1;
    this.lastDamageAt = Number.NEGATIVE_INFINITY;
    this.invulnerableUntil = 0;
    this.comboUntil = 0;
    this.comboKills = 0;
  }

  tick(deltaMs: number): boolean {
    if (this.mode !== 'playing') return false;

    this.stageElapsedMs += deltaMs;
    if (this.multiplier > 1 && this.stageElapsedMs >= this.comboUntil) {
      this.multiplier = 1;
      this.comboKills = 0;
    }

    if (this.shield < this.shieldMax && this.stageElapsedMs - this.lastDamageAt >= SHIELD_RECHARGE_MS) {
      this.shield = this.shieldMax;
      return true;
    }

    return false;
  }

  takeDamage(): DamageResult {
    if (this.mode !== 'playing' || this.stageElapsedMs < this.invulnerableUntil) return 'ignored';

    this.lastDamageAt = this.stageElapsedMs;
    if (this.shield > 0) {
      this.shield -= 1;
      this.invulnerableUntil = this.stageElapsedMs + 420;
      return 'shield';
    }

    this.hull -= 1;
    this.invulnerableUntil = this.stageElapsedMs + 1_250;
    if (this.hull <= 0) {
      this.hull = 0;
      this.mode = 'gameover';
      return 'destroyed';
    }
    return 'hull';
  }

  upgrade(type: UpgradeType): { upgraded: boolean; level: number } {
    if (type === 'shield') {
      if (this.shieldMax >= 3) {
        this.addFlatScore(1_000);
        return { upgraded: false, level: this.shieldMax };
      }
      this.shieldMax += 1;
      this.shield = this.shieldMax;
      return { upgraded: true, level: this.shieldMax };
    }

    if (this.weapons[type] >= 3) {
      this.addFlatScore(750);
      return { upgraded: false, level: this.weapons[type] };
    }
    this.weapons[type] += 1;
    return { upgraded: true, level: this.weapons[type] };
  }

  registerKill(baseScore: number): number {
    this.kills += 1;
    this.comboKills += 1;
    this.multiplier = Math.min(5, 1 + Math.floor(this.comboKills / 5));
    this.comboUntil = this.stageElapsedMs + 2_700;
    const awarded = Math.round(baseScore * this.multiplier * DIFFICULTY[this.difficulty].scoreScale);
    this.addFlatScore(awarded);
    return awarded;
  }

  addFlatScore(points: number): void {
    this.score += points;
    this.highScore = Math.max(this.highScore, this.score);
  }

  setPaused(paused: boolean): void {
    if (this.mode === 'gameover' || this.mode === 'victory') return;
    this.mode = paused ? 'paused' : 'playing';
  }

  setBoss(healthRatio: number): void {
    this.bossActive = healthRatio > 0;
    this.bossHealthRatio = Math.max(0, Math.min(1, healthRatio));
  }

  restoreShield(): void {
    this.shield = this.shieldMax;
    this.lastDamageAt = Number.NEGATIVE_INFINITY;
  }

  win(): void {
    this.mode = 'victory';
    this.bossActive = false;
    this.bossHealthRatio = 0;
  }

  snapshot(): GameSnapshot {
    const remaining = this.shield >= this.shieldMax
      ? 0
      : Math.max(0, SHIELD_RECHARGE_MS - (this.stageElapsedMs - this.lastDamageAt));
    return {
      mode: this.mode,
      difficulty: this.difficulty,
      hull: this.hull,
      hullMax: this.hullMax,
      shield: this.shield,
      shieldMax: this.shieldMax,
      shieldRechargeRemainingMs: remaining,
      weapons: { ...this.weapons },
      score: this.score,
      highScore: this.highScore,
      multiplier: this.multiplier,
      kills: this.kills,
      stageElapsedMs: this.stageElapsedMs,
      stageDurationMs: this.stageDurationMs,
      bossActive: this.bossActive,
      bossHealthRatio: this.bossHealthRatio,
    };
  }
}
