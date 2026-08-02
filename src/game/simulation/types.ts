export type Difficulty = 'cadet' | 'pilot' | 'ace';
export type WeaponType = 'spread' | 'missile' | 'laser' | 'drone' | 'ion';
export type WeaponLevel = 0 | 1 | 2 | 3 | 4 | 5;
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
export type DamageResult = 'ignored' | 'shield' | 'reserve' | 'hull' | 'secondWind' | 'phoenix' | 'destroyed';
export type MissionId = 'coastal' | 'minefield' | 'fortress' | 'dreadnought';
export type CampaignPhase = 'briefing' | 'mission' | 'hangar' | 'victory';
export type UpgradeBranch = 'weapons' | 'defense' | 'systems';
export type ThreatLevel = 1 | 2 | 3 | 4 | 5;
export type EnemyRank = 'standard' | 'veteran' | 'elite' | 'carrier';
export type ArrivalMode = 'top' | 'sideBank' | 'depthRise' | 'horizonRise';
export type GraphicsQuality = 'auto' | 'high' | 'balanced' | 'low';
export type MissionVisualId = MissionId;
export type MusicTrack =
  | 'menu'
  | 'hangar'
  | 'mission-coastal'
  | 'mission-minefield'
  | 'mission-fortress'
  | 'boss'
  | 'victory'
  | 'defeat';
export type MusicPlaybackState = 'locked' | 'loading' | 'playing' | 'unavailable';

export interface MusicAssetDefinition {
  files: readonly string[];
  loop: boolean;
  gain: number;
  preloadNext?: MusicTrack;
}

export interface AudioDebugState {
  contextState: AudioContextState | 'uninitialized';
  playbackState: MusicPlaybackState;
  desiredTrack?: MusicTrack;
  currentTrack?: MusicTrack;
  source?: 'buffer' | 'debug-synth';
  musicGain: number;
  sfxGain: number;
  lastError?: string;
}

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
  | 'flux-capacitor'
  | 'ordnance-cascade'
  | 'prismatic-core'
  | 'second-wind'
  | 'kinetic-reversal'
  | 'chrono-relay'
  | 'emergency-capacitor';

export interface WeaponLevels {
  spread: WeaponLevel;
  missile: WeaponLevel;
  laser: WeaponLevel;
  drone: WeaponLevel;
  ion: WeaponLevel;
}

export interface MissionDefinition {
  id: MissionId;
  number: number;
  music: MusicTrack;
  sector: string;
  title: string;
  durationMs: number;
  briefing: string;
  newThreats: string[];
  completionCredits: number;
  finale: boolean;
  visualProfile: MissionVisualId;
}

export interface UpgradeNode {
  id: UpgradeNodeId;
  branch: UpgradeBranch;
  tier: 1 | 2 | 3 | 4;
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
  reserveShield: boolean;
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
  ordnanceCascade: boolean;
  prismaticCore: boolean;
  secondWind: boolean;
  kineticReversal: boolean;
  chronoRelay: boolean;
  emergencyCapacitor: boolean;
}

export interface MissionStartConfig {
  difficulty: Difficulty;
  mission: MissionDefinition;
  score: number;
  weapons: WeaponLevels;
  shieldBaseMax: number;
  modifiers: CombatModifiers;
  campaignSeed: number;
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
  version: 1 | 2;
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
  campaignSeed?: number;
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
  threatLevel: ThreatLevel;
  chronoRemainingMs: number;
  reserveShieldAvailable: boolean;
  secondWindAvailable: boolean;
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

export interface ThreatPhase {
  level: ThreatLevel;
  startsAtProgress: number;
  enemyHealth: number;
  movementSpeed: number;
  fireRate: number;
  bulletSpeed: number;
  waveIntervalMs: number;
  waveBudget: number;
}

export interface ThreatTuning extends ThreatPhase {
  missionScale: number;
}

export interface ArmamentOffer {
  carrierIndex: number;
  options: readonly [UpgradeType, UpgradeType];
  expiresAfterMs: number;
}
