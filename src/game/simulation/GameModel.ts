import { DEFAULT_COMBAT_MODIFIERS } from '../content/upgrades';
import { getThreatLevel } from '../content/encounters';
import {
  ACTIVE_TRACTOR_CREDIT_MULTIPLIER,
  ACTIVE_TRACTOR_RADIUS,
  KINETIC_SHIELD_HIT_GRACE_MS,
  SHIELD_HIT_GRACE_MS,
  WEAPON_MAX_LEVEL,
} from '../content/balance';
import { isFinaleMission } from '../content/finale';
import { sanitizeMissionWaypoint } from './checkpoints';
import type {
  CombatModifiers,
  DamageResult,
  GameMode,
  GameSnapshot,
  KillResult,
  MissionDefinition,
  MissionStartConfig,
  UpgradeResult,
  UpgradeType,
  UtilityPickupType,
  WeaponLevel,
  WeaponLevels,
  WeaponType,
  WeaponOverdriveState,
  FinalePhase,
  FinaleBossStage,
  GameCheckpointSnapshot,
  MissionWaypointId,
} from './types';

const emptyWeapons = (): WeaponLevels => ({ spread: 1, missile: 0, laser: 0, drone: 0, ion: 0 });

const normalizedWeapons = (weapons: WeaponLevels): WeaponLevels => {
  const result = emptyWeapons();
  for (const type of Object.keys(result) as WeaponType[]) {
    const minimum = type === 'spread' ? 1 : 0;
    result[type] = (Number.isFinite(weapons[type])
      ? Math.max(minimum, Math.min(WEAPON_MAX_LEVEL[type], Math.floor(weapons[type])))
      : minimum) as WeaponLevel;
  }
  return result;
};

export class GameModel {
  mode: GameMode = 'briefing';
  difficulty: MissionStartConfig['difficulty'] = 'pilot';
  mission: Pick<MissionDefinition, 'id' | 'number' | 'title' | 'approachDurationMs'> = {
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
  finalePhase?: FinalePhase;
  finaleBossStage?: FinaleBossStage;
  latestWaypointId?: MissionWaypointId;
  campaignSeed = 1;
  sortieModule: MissionStartConfig['sortieModule'];
  modifiers: CombatModifiers = { ...DEFAULT_COMBAT_MODIFIERS };

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
  private nextShieldRechargeAt = Number.POSITIVE_INFINITY;
  private lastHullDamageAt = Number.NEGATIVE_INFINITY;
  private naniteLatticeAvailable = false;
  private sortieNanitesAvailable = false;
  private fortressRamAvailable = false;
  private creditRemainder = 0;

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
      approachDurationMs: config.mission.approachDurationMs,
    };
    this.modifiers = { ...DEFAULT_COMBAT_MODIFIERS, ...config.modifiers };
    this.campaignSeed = config.campaignSeed;
    this.sortieModule = config.sortieModule;
    this.hullMax = Math.min(6, 3 + this.modifiers.hullBonus + (this.modifiers.fortressFrame ? 1 : 0));
    this.hull = this.hullMax;
    this.shieldBaseMax = Math.max(1, Math.min(3, config.shieldBaseMax));
    this.shieldMax = this.shieldBaseMax + this.modifiers.shieldCapacityBonus;
    this.shield = this.shieldMax;
    this.weapons = normalizedWeapons(config.weapons);
    this.score = Math.max(0, config.score);
    this.multiplier = 1;
    this.kills = 0;
    this.creditsEarned = 0;
    this.creditRemainder = 0;
    this.empMax = 2 + this.modifiers.empCapacityBonus;
    this.empCharges = Math.min(this.empMax, 1 + (config.sortieModule === 'reserve-emp' ? 1 : 0));
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.damageTaken = 0;
    this.stageElapsedMs = 0;
    this.stageDurationMs = config.debugDurationMs ?? config.mission.durationMs;
    this.bossActive = false;
    this.bossName = '';
    this.bossHealthRatio = 1;
    this.finalePhase = isFinaleMission(config.mission.id) ? 'approach' : undefined;
    this.finaleBossStage = config.mission.id === 'lastLight' ? 'seraph' : undefined;
    this.latestWaypointId = undefined;
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
    this.nextShieldRechargeAt = Number.POSITIVE_INFINITY;
    this.lastHullDamageAt = Number.NEGATIVE_INFINITY;
    this.naniteLatticeAvailable = this.modifiers.naniteLattice;
    this.sortieNanitesAvailable = config.sortieModule === 'emergency-nanites';
    this.fortressRamAvailable = this.modifiers.fortressFrame;
    const resume = sanitizeMissionWaypoint(config.resumeFrom, config.mission.id);
    if (resume) {
      this.restoreCheckpoint(resume.game, resume.waypointId);
      if (this.mission.id === 'dreadnought' && resume.bossHealthRatio !== undefined) this.bossHealthRatio = resume.bossHealthRatio;
    }
  }

  exportCheckpoint(): GameCheckpointSnapshot {
    return {
      stageElapsedMs: this.stageElapsedMs,
      score: this.score,
      kills: this.kills,
      creditsEarned: this.creditsEarned,
      creditRemainder: this.creditRemainder,
      shotsFired: this.shotsFired,
      shotsHit: this.shotsHit,
      damageTaken: this.damageTaken,
      weapons: { ...this.weapons },
      shieldBaseMax: this.shieldBaseMax,
      shieldCapacityBonus: this.modifiers.shieldCapacityBonus,
      hull: this.hull,
      shield: this.shield,
      empCharges: this.empCharges,
      phoenixAvailable: this.phoenixAvailable,
      reserveShieldAvailable: this.reserveShieldAvailable,
      secondWindAvailable: this.secondWindAvailable,
      emergencyCapacitorTriggers: this.emergencyCapacitorTriggers,
      naniteLatticeAvailable: this.naniteLatticeAvailable,
      sortieNanitesAvailable: this.sortieNanitesAvailable,
      fortressRamAvailable: this.fortressRamAvailable,
      finalePhase: this.finalePhase,
      finaleBossStage: this.finaleBossStage,
    };
  }

  restoreCheckpoint(checkpoint: GameCheckpointSnapshot, waypointId: MissionWaypointId): void {
    this.stageElapsedMs = Math.max(0, checkpoint.stageElapsedMs);
    this.score = Math.max(0, checkpoint.score);
    this.highScore = Math.max(this.highScore, this.score);
    this.kills = Math.max(0, checkpoint.kills);
    this.creditsEarned = Math.max(0, checkpoint.creditsEarned);
    this.creditRemainder = Number.isFinite(checkpoint.creditRemainder)
      ? Math.max(0, Math.min(0.999999999, checkpoint.creditRemainder!)) : 0;
    this.shotsFired = Math.max(0, checkpoint.shotsFired);
    this.shotsHit = Math.max(0, checkpoint.shotsHit);
    this.damageTaken = Math.max(0, checkpoint.damageTaken);
    this.weapons = normalizedWeapons(checkpoint.weapons);
    this.shieldBaseMax = Math.max(1, Math.min(3, checkpoint.shieldBaseMax));
    this.shieldMax = this.shieldBaseMax + this.modifiers.shieldCapacityBonus;
    this.hull = Math.min(this.hullMax, Math.max(checkpoint.hull, Math.min(2, this.hullMax)));
    this.shield = this.shieldMax;
    this.empCharges = Math.min(this.empMax, Math.max(checkpoint.empCharges, Math.min(1, this.empMax)));
    this.phoenixAvailable = checkpoint.phoenixAvailable;
    this.reserveShieldAvailable = checkpoint.reserveShieldAvailable;
    this.secondWindAvailable = checkpoint.secondWindAvailable;
    this.emergencyCapacitorTriggers = Math.max(0, checkpoint.emergencyCapacitorTriggers);
    this.naniteLatticeAvailable = checkpoint.naniteLatticeAvailable;
    this.sortieNanitesAvailable = checkpoint.sortieNanitesAvailable;
    this.fortressRamAvailable = checkpoint.fortressRamAvailable;
    this.finalePhase = isFinaleMission(this.mission.id) ? checkpoint.finalePhase ?? 'approach' : undefined;
    this.finaleBossStage = this.mission.id === 'lastLight'
      ? checkpoint.finaleBossStage === 'nullArchitect' ? 'nullArchitect' : 'seraph'
      : undefined;
    this.latestWaypointId = waypointId;

    // Partial service deliberately clears transient combat advantages and hazards.
    this.multiplier = 1;
    this.comboUntil = 0;
    this.comboKills = 0;
    this.overdriveUntil = 0;
    this.reactorUntil = 0;
    this.tractorUntil = 0;
    this.chronoUntil = 0;
    this.invulnerableUntil = 0;
    this.nextShieldRechargeAt = Number.POSITIVE_INFINITY;
    this.lastHullDamageAt = Number.NEGATIVE_INFINITY;
    this.bossActive = false;
    this.bossName = '';
    this.bossHealthRatio = this.mission.id === 'dreadnought' && waypointId === 2 && checkpoint.finalePhase === 'boss' ? 0.66 : 1;
  }

  setLatestWaypoint(id: MissionWaypointId): void {
    this.latestWaypointId = id;
  }

  tick(deltaMs: number): false | 'shield' | 'hull' {
    if (this.mode !== 'playing') return false;
    this.stageElapsedMs += deltaMs;
    if (this.multiplier > 1 && this.stageElapsedMs >= this.comboUntil) {
      this.multiplier = 1;
      this.comboKills = 0;
    }

    if (this.shield < this.shieldMax && this.stageElapsedMs >= this.nextShieldRechargeAt) {
      // Every Aegis bank recharges one cell at a time. Harmonics improves cadence,
      // not the recharge rule; even a delayed frame may restore only one cell.
      this.shield = Math.min(this.shieldMax, this.shield + 1);
      this.nextShieldRechargeAt = this.shield < this.shieldMax ? this.stageElapsedMs + this.shieldRechargeIntervalMs : Number.POSITIVE_INFINITY;
      return 'shield';
    }
    if (this.naniteLatticeAvailable && this.hull < this.hullMax && this.stageElapsedMs - this.lastHullDamageAt >= 35_000) {
      this.hull += 1;
      this.naniteLatticeAvailable = false;
      return 'hull';
    }
    return false;
  }

  takeDamage(source: 'projectile' | 'ram' | 'hazard' = 'projectile'): DamageResult {
    if (this.mode !== 'playing' || this.stageElapsedMs < this.invulnerableUntil) return 'ignored';
    if (source === 'ram' && this.shield <= 0 && this.fortressRamAvailable) {
      this.fortressRamAvailable = false;
      this.invulnerableUntil = this.stageElapsedMs + 750;
      return 'fortress';
    }
    this.nextShieldRechargeAt = this.stageElapsedMs + this.shieldRechargeIntervalMs;
    this.damageTaken += 1;
    if (this.shield > 0) {
      this.shield -= 1;
      this.invulnerableUntil = this.stageElapsedMs + (this.modifiers.kineticReversal ? KINETIC_SHIELD_HIT_GRACE_MS : SHIELD_HIT_GRACE_MS);
      if (this.shield === 0 && this.reserveShieldAvailable) {
        this.reserveShieldAvailable = false;
        this.shield = 1;
        return 'reserve';
      }
      return 'shield';
    }

    this.hull -= 1;
    this.lastHullDamageAt = this.stageElapsedMs;
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
    if (this.hull === 1 && this.sortieNanitesAvailable) {
      this.sortieNanitesAvailable = false;
      this.hull = Math.min(this.hullMax, this.hull + 1);
      this.invulnerableUntil = Math.max(this.invulnerableUntil, this.stageElapsedMs + 1_200);
      return 'nanites';
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
      this.shieldMax = this.shieldBaseMax + this.modifiers.shieldCapacityBonus;
      this.shield = this.shieldMax;
      return { upgraded: true, level: this.shieldMax };
    }

    if (this.weapons[type] >= WEAPON_MAX_LEVEL[type]) {
      this.addFlatScore(750);
      return { upgraded: false, level: this.weapons[type] };
    }
    this.weapons[type] = (this.weapons[type] + 1) as WeaponLevel;
    return { upgraded: true, level: this.weapons[type] };
  }

  collectUtility(type: UtilityPickupType): { applied: boolean; scoreAwarded: number; creditsAwarded: number } {
    if (type === 'repair') {
      if (this.hull >= this.hullMax) {
        return this.routeExcessUtility();
      }
      this.hull += 1;
      return { applied: true, scoreAwarded: 0, creditsAwarded: 0 };
    }
    if (type === 'overdrive') {
      const duration = 10_000 * this.modifiers.utilityDurationMultiplier;
      const cap = 20_000 * this.modifiers.utilityDurationMultiplier;
      const remaining = Math.max(0, this.overdriveUntil - this.stageElapsedMs);
      this.overdriveUntil = this.stageElapsedMs + Math.min(cap, remaining + duration);
      return { applied: true, scoreAwarded: 0, creditsAwarded: 0 };
    }
    if (type === 'tractor') {
      this.tractorUntil = this.stageElapsedMs + 12_000 * this.modifiers.utilityDurationMultiplier;
      return { applied: true, scoreAwarded: 0, creditsAwarded: 0 };
    }
    if (this.empCharges < this.empMax) {
      this.empCharges += 1;
      return { applied: true, scoreAwarded: 0, creditsAwarded: 0 };
    }
    if (this.modifiers.utilityDurationMultiplier > 1) {
      return this.routeExcessUtility();
    }
    return this.modifiers.salvageRouter ? this.routeExcessUtility() : { applied: false, scoreAwarded: 0, creditsAwarded: 0 };
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

  registerKill(baseScore: number, baseCredits: number, specialist = false): KillResult {
    this.kills += 1;
    this.comboKills += 1;
    this.multiplier = Math.min(this.modifiers.comboMax, 1 + Math.floor(this.comboKills / 5));
    this.comboUntil = this.stageElapsedMs + this.modifiers.comboWindowMs;
    const points = Math.round(baseScore * this.multiplier * this.difficultyScoreScale() * (specialist && this.modifiers.threatAnalyzer ? 1.1 : 1));
    // Preserve fractional salvage bonuses across small rewards and waypoint retries.
    // Tractor also salvages more from kills, so it is useful between utility drops.
    const tractorSalvage = this.stageElapsedMs < this.tractorUntil ? ACTIVE_TRACTOR_CREDIT_MULTIPLIER : 1;
    const exactCredits = Math.max(0, baseCredits) * this.modifiers.creditMultiplier * tractorSalvage + this.creditRemainder;
    const credits = Math.floor(exactCredits + 1e-9);
    this.creditRemainder = Math.max(0, exactCredits - credits);
    this.creditsEarned += credits;
    this.addFlatScore(points);

    const overdriveTriggered = this.modifiers.overdriveReactor && this.comboKills === 10;
    if (overdriveTriggered) this.reactorUntil = this.stageElapsedMs + 6_000;
    const fabricationInterval = this.modifiers.fabricationMatrix ? 24 : 30;
    let fabricatedPickup: UtilityPickupType | undefined;
    if ((this.modifiers.fieldFabricator || this.modifiers.fabricationMatrix) && this.kills % fabricationInterval === 0) {
      if (this.hull < this.hullMax) fabricatedPickup = 'repair';
      else if (this.empCharges < this.empMax) fabricatedPickup = 'emp';
      // A healthy full-capacity fighter receives Overdrive only every third cycle.
      else fabricatedPickup = Math.floor(this.kills / fabricationInterval) % 3 === 0 ? 'overdrive' : 'tractor';
    }
    return { points, credits, overdriveTriggered, fabricatedPickup };
  }

  addFlatScore(points: number): void {
    this.score += points;
    this.highScore = Math.max(this.highScore, this.score);
  }

  private routeExcessUtility(): { applied: boolean; scoreAwarded: number; creditsAwarded: number } {
    this.addFlatScore(500);
    const creditsAwarded = this.modifiers.salvageRouter ? 2 : 0;
    this.creditsEarned += creditsAwarded;
    return { applied: false, scoreAwarded: 500, creditsAwarded };
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

  setFinalePhase(phase: FinalePhase): void {
    if (isFinaleMission(this.mission.id)) this.finalePhase = phase;
  }

  /** Advance the sequence exactly once; Seraph's earned rewards stay in mission totals. */
  advanceFinaleBoss(): boolean {
    if (this.mission.id !== 'lastLight' || this.finalePhase !== 'boss' || this.finaleBossStage !== 'seraph' || this.mode !== 'playing') return false;
    this.finaleBossStage = 'nullArchitect';
    this.bossActive = false;
    this.bossName = '';
    this.bossHealthRatio = 1;
    return true;
  }

  restoreShield(): void {
    this.shield = this.shieldMax;
  }

  complete(finalVictory = false): void {
    this.mode = finalVictory && this.mission.id === 'lastLight' ? 'victory' : 'complete';
    this.bossActive = false;
    this.bossHealthRatio = 0;
    if (isFinaleMission(this.mission.id)) this.finalePhase = 'cleared';
  }

  get fireIntervalMultiplier(): number {
    const pickupBoost = this.stageElapsedMs < this.overdriveUntil ? 0.7 : 1;
    const reactorBoost = this.stageElapsedMs < this.reactorUntil ? 0.75 : 1;
    return this.modifiers.fireIntervalMultiplier * pickupBoost * reactorBoost;
  }

  private get shieldRechargeIntervalMs(): number {
    return this.modifiers.aegisHarmonics
      ? Math.min(4_500, Math.max(2_500, this.modifiers.shieldRechargeMs - 2_000))
      : this.modifiers.shieldRechargeMs;
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

  get arcDamageMultiplier(): number {
    return this.modifiers.damageMultiplier * this.modifiers.arcDamageMultiplier;
  }

  get tractorRadius(): number {
    return Math.max(this.modifiers.passiveTractorRadius, this.stageElapsedMs < this.tractorUntil ? ACTIVE_TRACTOR_RADIUS : 0);
  }

  get empDamageMultiplier(): number {
    return this.modifiers.empDamageMultiplier;
  }

  get chronoScale(): number {
    return this.stageElapsedMs < this.chronoUntil ? 0.55 : 1;
  }

  snapshot(): GameSnapshot {
    const remaining = this.shield >= this.shieldMax ? 0 : Math.max(0, this.nextShieldRechargeAt - this.stageElapsedMs);
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
      finalePhase: this.finalePhase,
      finaleBossStage: this.finaleBossStage,
      threatLevel: getThreatLevel(this.stageElapsedMs / Math.max(1, this.stageDurationMs)),
      chronoRemainingMs: Math.max(0, this.chronoUntil - this.stageElapsedMs),
      reserveShieldAvailable: this.reserveShieldAvailable,
      secondWindAvailable: this.secondWindAvailable,
      latestWaypointId: this.latestWaypointId,
    };
  }

  private difficultyScoreScale(): number {
    if (this.difficulty === 'cadet') return 0.85;
    if (this.difficulty === 'ace') return 1.25;
    return 1;
  }
}
