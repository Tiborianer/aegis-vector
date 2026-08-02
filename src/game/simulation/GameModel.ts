import { DEFAULT_COMBAT_MODIFIERS } from '../content/upgrades';
import { getThreatLevel } from '../content/encounters';
import type {
  CombatModifiers,
  DamageResult,
  GameMode,
  GameSnapshot,
  KillResult,
  MissionId,
  MissionStartConfig,
  UpgradeResult,
  UpgradeType,
  UtilityPickupType,
  WeaponLevel,
  WeaponLevels,
  WeaponOverdriveState,
} from './types';

const emptyWeapons = (): WeaponLevels => ({ spread: 1, missile: 0, laser: 0, drone: 0, ion: 0 });

export class GameModel {
  mode: GameMode = 'briefing';
  difficulty: MissionStartConfig['difficulty'] = 'pilot';
  mission: { id: MissionId; number: number; title: string } = {
    id: 'coastal',
    number: 1,
    title: 'COASTAL INTERCEPT',
  };
  hull = 3;
  hullMax = 3;
  shield = 1;
  shieldMax = 1;
  shieldBaseMax = 1;
  weapons = emptyWeapons();
  score = 0;
  highScore = 0;
  multiplier = 1;
  kills = 0;
  creditsEarned = 0;
  empCharges = 1;
  empMax = 2;
  shotsFired = 0;
  shotsHit = 0;
  damageTaken = 0;
  stageElapsedMs = 0;
  stageDurationMs = 195_000;
  bossActive = false;
  bossName = '';
  bossHealthRatio = 1;
  campaignSeed = 1;
  modifiers: CombatModifiers = { ...DEFAULT_COMBAT_MODIFIERS };

  private lastDamageAt = Number.NEGATIVE_INFINITY;
  private invulnerableUntil = 0;
  private comboUntil = 0;
  private comboKills = 0;
  private overdriveUntil = 0;
  private reactorUntil = 0;
  private tractorUntil = 0;
  private chronoUntil = 0;
  private phoenixAvailable = false;
  private reserveShieldAvailable = false;
  private secondWindAvailable = false;
  private emergencyCapacitorTriggers = 0;

  constructor(highScore = 0) {
    this.highScore = highScore;
  }

  start(config: MissionStartConfig): void {
    this.mode = 'playing';
    this.difficulty = config.difficulty;
    this.mission = {
      id: config.mission.id,
      number: config.mission.number,
      title: config.mission.title,
    };
    this.modifiers = { ...config.modifiers };
    this.campaignSeed = config.campaignSeed;
    this.hullMax = Math.min(5, 3 + this.modifiers.hullBonus);
    this.hull = this.hullMax;
    this.shieldBaseMax = Math.max(1, Math.min(3, config.shieldBaseMax));
    this.shieldMax = this.shieldBaseMax;
    this.shield = this.shieldMax;
    this.weapons = { ...config.weapons };
    this.score = Math.max(0, config.score);
    this.multiplier = 1;
    this.kills = 0;
    this.creditsEarned = 0;
    this.empMax = 2 + this.modifiers.empCapacityBonus;
    this.empCharges = 1;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.damageTaken = 0;
    this.stageElapsedMs = 0;
    this.stageDurationMs = config.debugDurationMs ?? config.mission.durationMs;
    this.bossActive = false;
    this.bossName = '';
    this.bossHealthRatio = 1;
    this.lastDamageAt = Number.NEGATIVE_INFINITY;
    this.invulnerableUntil = 0;
    this.comboUntil = 0;
    this.comboKills = 0;
    this.overdriveUntil = 0;
    this.reactorUntil = 0;
    this.tractorUntil = 0;
    this.chronoUntil = 0;
    this.phoenixAvailable = this.modifiers.phoenixProtocol;
    this.reserveShieldAvailable = this.modifiers.reserveShield;
    this.secondWindAvailable = this.modifiers.secondWind;
    this.emergencyCapacitorTriggers = 0;
  }

  tick(deltaMs: number): boolean {
    if (this.mode !== 'playing') return false;
    this.stageElapsedMs += deltaMs;
    if (this.multiplier > 1 && this.stageElapsedMs >= this.comboUntil) {
      this.multiplier = 1;
      this.comboKills = 0;
    }

    if (this.shield < this.shieldMax && this.stageElapsedMs - this.lastDamageAt >= this.modifiers.shieldRechargeMs) {
      this.shield = this.shieldMax;
      return true;
    }
    return false;
  }

  takeDamage(): DamageResult {
    if (this.mode !== 'playing' || this.stageElapsedMs < this.invulnerableUntil) return 'ignored';
    this.lastDamageAt = this.stageElapsedMs;
    this.damageTaken += 1;
    if (this.shield > 0) {
      this.shield -= 1;
      this.invulnerableUntil = this.stageElapsedMs + (this.modifiers.kineticReversal ? 750 : 420);
      if (this.shield === 0 && this.reserveShieldAvailable) {
        this.reserveShieldAvailable = false;
        this.shield = 1;
        return 'reserve';
      }
      return 'shield';
    }

    this.hull -= 1;
    this.invulnerableUntil = this.stageElapsedMs + this.modifiers.hullInvulnerabilityMs;
    if (this.modifiers.emergencyCapacitor && this.emergencyCapacitorTriggers < 2) {
      this.emergencyCapacitorTriggers += 1;
      this.empCharges = Math.min(this.empMax, this.empCharges + 1);
      this.tractorUntil = Math.max(this.tractorUntil, this.stageElapsedMs + 3_000);
    }
    if (this.hull === 1 && this.secondWindAvailable) {
      this.secondWindAvailable = false;
      this.shield = this.shieldMax;
      this.invulnerableUntil = Math.max(this.invulnerableUntil, this.stageElapsedMs + 1_200);
      return 'secondWind';
    }
    if (this.hull <= 0 && this.phoenixAvailable) {
      this.phoenixAvailable = false;
      this.hull = 1;
      this.invulnerableUntil = this.stageElapsedMs + 2_000;
      return 'phoenix';
    }
    if (this.hull <= 0) {
      this.hull = 0;
      this.mode = 'gameover';
      return 'destroyed';
    }
    return 'hull';
  }

  upgrade(type: UpgradeType): UpgradeResult {
    if (type === 'shield') {
      if (this.shieldBaseMax >= 3) {
        this.addFlatScore(1_000);
        return { upgraded: false, level: this.shieldMax };
      }
      this.shieldBaseMax += 1;
      this.shieldMax = this.shieldBaseMax;
      this.shield = this.shieldMax;
      return { upgraded: true, level: this.shieldMax };
    }

    if (this.weapons[type] >= 5) {
      this.addFlatScore(750);
      return { upgraded: false, level: this.weapons[type] };
    }
    this.weapons[type] = (this.weapons[type] + 1) as WeaponLevel;
    return { upgraded: true, level: this.weapons[type] };
  }

  collectUtility(type: UtilityPickupType): { applied: boolean; scoreAwarded: number } {
    if (type === 'repair') {
      if (this.hull >= this.hullMax) {
        this.addFlatScore(500);
        return { applied: false, scoreAwarded: 500 };
      }
      this.hull += 1;
      return { applied: true, scoreAwarded: 0 };
    }
    if (type === 'overdrive') {
      const duration = 10_000 * this.modifiers.utilityDurationMultiplier;
      const cap = 20_000 * this.modifiers.utilityDurationMultiplier;
      const remaining = Math.max(0, this.overdriveUntil - this.stageElapsedMs);
      this.overdriveUntil = this.stageElapsedMs + Math.min(cap, remaining + duration);
      return { applied: true, scoreAwarded: 0 };
    }
    if (type === 'tractor') {
      this.tractorUntil = this.stageElapsedMs + 12_000 * this.modifiers.utilityDurationMultiplier;
      return { applied: true, scoreAwarded: 0 };
    }
    if (this.empCharges < this.empMax) {
      this.empCharges += 1;
      return { applied: true, scoreAwarded: 0 };
    }
    if (this.modifiers.utilityDurationMultiplier > 1) {
      this.addFlatScore(500);
      return { applied: false, scoreAwarded: 500 };
    }
    return { applied: false, scoreAwarded: 0 };
  }

  activateEmp(): boolean {
    if (this.mode !== 'playing' || this.empCharges <= 0) return false;
    this.empCharges -= 1;
    if (this.modifiers.chronoRelay) this.chronoUntil = this.stageElapsedMs + 5_000;
    return true;
  }

  registerShot(count = 1): void {
    this.shotsFired += Math.max(0, count);
  }

  registerHit(): void {
    this.shotsHit += 1;
  }

  registerKill(baseScore: number, baseCredits: number): KillResult {
    this.kills += 1;
    this.comboKills += 1;
    this.multiplier = Math.min(this.modifiers.comboMax, 1 + Math.floor(this.comboKills / 5));
    this.comboUntil = this.stageElapsedMs + this.modifiers.comboWindowMs;
    const points = Math.round(baseScore * this.multiplier * this.difficultyScoreScale());
    const credits = Math.round(baseCredits * this.modifiers.creditMultiplier);
    this.creditsEarned += credits;
    this.addFlatScore(points);

    const overdriveTriggered = this.modifiers.overdriveReactor && this.comboKills === 10;
    if (overdriveTriggered) this.reactorUntil = this.stageElapsedMs + 6_000;
    const fabricatedPickup = this.modifiers.fieldFabricator && this.kills % 30 === 0
      ? this.hull < this.hullMax ? 'repair' : 'overdrive'
      : undefined;
    return { points, credits, overdriveTriggered, fabricatedPickup };
  }

  addFlatScore(points: number): void {
    this.score += points;
    this.highScore = Math.max(this.highScore, this.score);
  }

  setPaused(paused: boolean): void {
    if (this.mode === 'gameover' || this.mode === 'victory' || this.mode === 'complete') return;
    this.mode = paused ? 'paused' : 'playing';
  }

  setBoss(name: string, healthRatio: number): void {
    this.bossActive = healthRatio > 0;
    this.bossName = name;
    this.bossHealthRatio = Math.max(0, Math.min(1, healthRatio));
  }

  restoreShield(): void {
    this.shield = this.shieldMax;
    this.lastDamageAt = Number.NEGATIVE_INFINITY;
  }

  complete(finalVictory = false): void {
    this.mode = finalVictory ? 'victory' : 'complete';
    this.bossActive = false;
    this.bossHealthRatio = 0;
  }

  get fireIntervalMultiplier(): number {
    const pickupBoost = this.stageElapsedMs < this.overdriveUntil ? 0.7 : 1;
    const reactorBoost = this.stageElapsedMs < this.reactorUntil ? 0.75 : 1;
    return this.modifiers.fireIntervalMultiplier * pickupBoost * reactorBoost;
  }

  get weaponOverdriveState(): WeaponOverdriveState {
    const cell = this.stageElapsedMs < this.overdriveUntil;
    const reactor = this.stageElapsedMs < this.reactorUntil;
    if (cell && reactor) return 'stacked';
    if (cell) return 'cell';
    if (reactor) return 'reactor';
    return 'inactive';
  }

  get damageMultiplier(): number {
    return this.modifiers.damageMultiplier;
  }

  get tractorRadius(): number {
    return Math.max(this.modifiers.passiveTractorRadius, this.stageElapsedMs < this.tractorUntil ? 220 : 0);
  }

  get empDamageMultiplier(): number {
    return this.modifiers.empDamageMultiplier;
  }

  get chronoScale(): number {
    return this.stageElapsedMs < this.chronoUntil ? 0.55 : 1;
  }

  snapshot(): GameSnapshot {
    const remaining = this.shield >= this.shieldMax
      ? 0
      : Math.max(0, this.modifiers.shieldRechargeMs - (this.stageElapsedMs - this.lastDamageAt));
    return {
      mode: this.mode,
      difficulty: this.difficulty,
      missionId: this.mission.id,
      missionNumber: this.mission.number,
      missionTitle: this.mission.title,
      hull: this.hull,
      hullMax: this.hullMax,
      shield: this.shield,
      shieldMax: this.shieldMax,
      shieldBaseMax: this.shieldBaseMax,
      shieldRechargeRemainingMs: remaining,
      weapons: { ...this.weapons },
      score: this.score,
      highScore: this.highScore,
      multiplier: this.multiplier,
      kills: this.kills,
      creditsEarned: this.creditsEarned,
      empCharges: this.empCharges,
      empMax: this.empMax,
      overdriveRemainingMs: Math.max(0, this.overdriveUntil - this.stageElapsedMs),
      reactorOverdriveRemainingMs: Math.max(0, this.reactorUntil - this.stageElapsedMs),
      weaponOverdriveState: this.weaponOverdriveState,
      tractorRemainingMs: Math.max(0, this.tractorUntil - this.stageElapsedMs),
      shotsFired: this.shotsFired,
      shotsHit: this.shotsHit,
      damageTaken: this.damageTaken,
      stageElapsedMs: this.stageElapsedMs,
      stageDurationMs: this.stageDurationMs,
      bossActive: this.bossActive,
      bossName: this.bossName,
      bossHealthRatio: this.bossHealthRatio,
      threatLevel: getThreatLevel(this.stageElapsedMs / Math.max(1, this.stageDurationMs)),
      chronoRemainingMs: Math.max(0, this.chronoUntil - this.stageElapsedMs),
      reserveShieldAvailable: this.reserveShieldAvailable,
      secondWindAvailable: this.secondWindAvailable,
    };
  }

  private difficultyScoreScale(): number {
    if (this.difficulty === 'cadet') return 0.85;
    if (this.difficulty === 'ace') return 1.25;
    return 1;
  }
}
