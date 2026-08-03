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
  | 'bulwark'
  | 'phantom'
  | 'artillery'
  | 'reclaimer'
  | 'razorwing'
  | 'gatekeeper'
  | 'pursuer'
  | 'carrierBoss'
  | 'warden'
  | 'boss';
export type GameMode = 'briefing' | 'playing' | 'paused' | 'complete' | 'gameover' | 'victory';
export type DamageResult = 'ignored' | 'shield' | 'reserve' | 'hull' | 'secondWind' | 'nanites' | 'fortress' | 'phoenix' | 'destroyed';
export type MissionId = 'coastal' | 'minefield' | 'fortress' | 'stormbreak' | 'graveyard' | 'carrierSiege' | 'dreadnought';
export type CampaignPhase = 'briefing' | 'mission' | 'story' | 'hangar' | 'route' | 'victory';
export type CampaignRoute = 'storm' | 'salvage';
export type SortieModuleId = 'reserve-emp' | 'armament-scanner' | 'emergency-nanites' | 'wingman-beacon';
export type UpgradeBranch = 'weapons' | 'defense' | 'systems';
export type ThreatLevel = 1 | 2 | 3 | 4 | 5;
export type EnemyRank = 'standard' | 'veteran' | 'elite' | 'carrier';
export type ArrivalMode = 'top' | 'sideBank' | 'depthRise' | 'horizonRise';
export type GraphicsQuality = 'auto' | 'high' | 'balanced' | 'low';
export type MissionVisualId = MissionId;
export type StoryChapterId =
  | 'first-signal'
  | 'warden-key'
  | 'forked-truth'
  | 'stillwater-directive'
  | 'project-crown'
  | 'rook-confession'
  | 'last-vector';
export type StorySpeaker = 'Mara' | 'Rook' | 'ECHO-7';
export type StoryTransition = 'dissolve' | 'comic-wipe' | 'flash' | 'push';
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
export type VoicePlaybackState = 'idle' | 'loading' | 'playing' | 'subtitle-only' | 'unavailable';
export type WeaponOverdriveState = 'inactive' | 'cell' | 'reactor' | 'stacked';
export type EnemyHitZoneRole = 'core' | 'wing' | 'weakpoint';
export type FinalePhase = 'approach' | 'boss' | 'cleared';

export interface EnemyHitboxRect {
  role: EnemyHitZoneRole;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type MusicLoopStrategy =
  | { mode: 'none' }
  | { mode: 'full'; crossfadeSeconds: number }
  | { mode: 'tail'; tailSeconds: number; crossfadeSeconds: number };

export interface MusicAssetDefinition {
  files: readonly string[];
  loop: MusicLoopStrategy;
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
  voiceGain: number;
  activeRadioCue?: string;
  voicePlaybackState: VoicePlaybackState;
  voiceDurationSeconds?: number;
  voiceGainCorrection?: number;
  lastVoiceError?: string;
  positionSeconds: number;
  logicalStartCount: number;
  loopRegion?: { startSeconds: number; endSeconds: number };
  queuedSources: number;
  loopIteration: number;
  lastError?: string;
}

export interface StoryPanel {
  id: string;
  image: string;
  alt: string;
  speaker: StorySpeaker;
  caption: string;
  durationMs: number;
  transition: StoryTransition;
}

export interface StoryChapter {
  id: StoryChapterId;
  title: string;
  afterMission: MissionId;
  route?: CampaignRoute;
  panels: readonly StoryPanel[];
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
  | 'emergency-capacitor'
  | 'swarm-doctrine'
  | 'resonance-matrix'
  | 'helios-battery'
  | 'gravity-payload'
  | 'nanite-lattice'
  | 'aegis-harmonics'
  | 'guardian-pulse'
  | 'fortress-frame'
  | 'threat-analyzer'
  | 'salvage-router'
  | 'temporal-echo'
  | 'fabrication-matrix';

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
  approachDurationMs?: number;
  briefing: string;
  newThreats: string[];
  completionCredits: number;
  finale: boolean;
  visualProfile: MissionVisualId;
}

export interface UpgradeNode {
  id: UpgradeNodeId;
  branch: UpgradeBranch;
  tier: 1 | 2 | 3 | 4 | 5 | 6;
  name: string;
  description: string;
  cost: number;
  icon: string;
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
  swarmDoctrine: boolean;
  resonanceMatrix: boolean;
  heliosBattery: boolean;
  gravityPayload: boolean;
  naniteLattice: boolean;
  aegisHarmonics: boolean;
  guardianPulse: boolean;
  fortressFrame: boolean;
  threatAnalyzer: boolean;
  salvageRouter: boolean;
  temporalEcho: boolean;
  fabricationMatrix: boolean;
}

export interface MissionStartConfig {
  difficulty: Difficulty;
  mission: MissionDefinition;
  score: number;
  weapons: WeaponLevels;
  shieldBaseMax: number;
  modifiers: CombatModifiers;
  campaignSeed: number;
  sortieModule?: SortieModuleId;
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
  version: 1 | 2 | 3 | 4;
  phase: CampaignPhase;
  difficulty: Difficulty;
  missionIndex: number;
  currentMissionId?: MissionId;
  route?: CampaignRoute;
  sortieModule?: SortieModuleId;
  discoveredEnemies?: EnemyKind[];
  credits: number;
  score: number;
  campaignKills: number;
  weapons: WeaponLevels;
  shieldBaseMax: number;
  purchased: UpgradeNodeId[];
  respecAvailable: boolean;
  campaignSeed?: number;
  lastReport?: MissionReport;
  pendingStoryChapter?: StoryChapterId;
  seenStoryChapters?: StoryChapterId[];
}

export interface SortieModuleDefinition {
  id: SortieModuleId;
  name: string;
  description: string;
  cost: number;
  icon: string;
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
  reactorOverdriveRemainingMs: number;
  weaponOverdriveState: WeaponOverdriveState;
  tractorRemainingMs: number;
  shotsFired: number;
  shotsHit: number;
  damageTaken: number;
  stageElapsedMs: number;
  stageDurationMs: number;
  bossActive: boolean;
  bossName: string;
  bossHealthRatio: number;
  finalePhase?: FinalePhase;
  threatLevel: ThreatLevel;
  chronoRemainingMs: number;
  reserveShieldAvailable: boolean;
  secondWindAvailable: boolean;
}

export interface MiniBossDefinition {
  kind: Extract<EnemyKind, 'razorwing' | 'gatekeeper' | 'pursuer'>;
  name: string;
  missions: readonly MissionId[];
  progress: number;
  baseHealth: number;
  score: number;
  credits: number;
}

export interface DroneFormationSlot {
  x: number;
  y: number;
  variant: 'standard' | 'mk2' | 'beacon';
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
  pressureScale: number;
}

export interface MissionDifficultyProfile {
  healthScale: number;
  pressureScale: number;
}

export interface ArmamentOffer {
  carrierIndex: number;
  options: readonly [UpgradeType, UpgradeType];
  expiresAfterMs: number;
}
