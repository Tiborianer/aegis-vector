export type Difficulty = 'cadet' | 'pilot' | 'ace';
export type WeaponType = 'spread' | 'missile' | 'laser' | 'drone';
export type UpgradeType = WeaponType | 'shield';
export type UtilityPickupType = 'repair' | 'overdrive' | 'tractor' | 'emp';
export type PickupType = UpgradeType | UtilityPickupType;
export type EnemyKind =
  | 'scout'
  | 'interceptor'
  | 'bomber'
  | 'elite'
  | 'charger'
  | 'sniper'
  | 'mineLayer'
  | 'shieldCarrier'
  | 'warden'
  | 'boss';
export type GameMode = 'briefing' | 'playing' | 'paused' | 'complete' | 'gameover' | 'victory';
export type DamageResult = 'ignored' | 'shield' | 'hull' | 'phoenix' | 'destroyed';
export type MissionId = 'coastal' | 'minefield' | 'fortress' | 'dreadnought';
export type CampaignPhase = 'briefing' | 'mission' | 'hangar' | 'victory';
export type UpgradeBranch = 'weapons' | 'defense' | 'systems';
export type MusicTrack = 'menu' | 'mission' | 'boss' | 'victory' | 'defeat';

export type UpgradeNodeId =
  | 'rapid-cycling'
  | 'amplified-munitions'
  | 'split-capacitors'
  | 'hunter-logic'
  | 'overdrive-reactor'
  | 'phase-arsenal'
  | 'reinforced-frame'
  | 'aegis-bank'
  | 'quick-charge-loop'
  | 'reactive-armor'
  | 'phoenix-protocol'
  | 'repulsor-shield'
  | 'salvage-protocol'
  | 'tractor-array'
  | 'emp-overcharger'
  | 'combat-computer'
  | 'field-fabricator'
  | 'flux-capacitor';

export interface WeaponLevels {
  spread: number;
  missile: number;
  laser: number;
  drone: number;
}

export interface MissionDefinition {
  id: MissionId;
  number: number;
  sector: string;
  title: string;
  durationMs: number;
  briefing: string;
  newThreats: string[];
  completionCredits: number;
  finale: boolean;
}

export interface UpgradeNode {
  id: UpgradeNodeId;
  branch: UpgradeBranch;
  tier: 1 | 2 | 3;
  name: string;
  description: string;
  cost: number;
}

export interface CombatModifiers {
  fireIntervalMultiplier: number;
  damageMultiplier: number;
  splitCapacitors: boolean;
  hunterLogic: boolean;
  overdriveReactor: boolean;
  phaseArsenal: boolean;
  hullBonus: number;
  shieldBonus: number;
  shieldRechargeMs: number;
  hullInvulnerabilityMs: number;
  phoenixProtocol: boolean;
  repulsorShield: boolean;
  creditMultiplier: number;
  passiveTractorRadius: number;
  empCapacityBonus: number;
  empDamageMultiplier: number;
  comboWindowMs: number;
  comboMax: number;
  fieldFabricator: boolean;
  utilityDurationMultiplier: number;
}

export interface MissionStartConfig {
  difficulty: Difficulty;
  mission: MissionDefinition;
  score: number;
  weapons: WeaponLevels;
  shieldBaseMax: number;
  modifiers: CombatModifiers;
  debugDurationMs?: number;
}

export interface MissionReport {
  missionId: MissionId;
  title: string;
  score: number;
  kills: number;
  creditsEarned: number;
  damageTaken: number;
  shotsFired: number;
  shotsHit: number;
  accuracy: number;
}

export interface CampaignSnapshot {
  version: 1;
  phase: CampaignPhase;
  difficulty: Difficulty;
  missionIndex: number;
  credits: number;
  score: number;
  campaignKills: number;
  weapons: WeaponLevels;
  shieldBaseMax: number;
  purchased: UpgradeNodeId[];
  respecAvailable: boolean;
  lastReport?: MissionReport;
}

export interface GameSnapshot {
  mode: GameMode;
  difficulty: Difficulty;
  missionId: MissionId;
  missionNumber: number;
  missionTitle: string;
  hull: number;
  hullMax: number;
  shield: number;
  shieldMax: number;
  shieldBaseMax: number;
  shieldRechargeRemainingMs: number;
  weapons: WeaponLevels;
  score: number;
  highScore: number;
  multiplier: number;
  kills: number;
  creditsEarned: number;
  empCharges: number;
  empMax: number;
  overdriveRemainingMs: number;
  tractorRemainingMs: number;
  shotsFired: number;
  shotsHit: number;
  damageTaken: number;
  stageElapsedMs: number;
  stageDurationMs: number;
  bossActive: boolean;
  bossName: string;
  bossHealthRatio: number;
}

export interface KillResult {
  points: number;
  credits: number;
  overdriveTriggered: boolean;
  fabricatedPickup?: UtilityPickupType;
}

export interface UpgradeResult {
  upgraded: boolean;
  level: number;
}
