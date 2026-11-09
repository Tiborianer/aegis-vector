export type Difficulty = 'cadet' | 'pilot' | 'ace';
export type WeaponType = 'spread' | 'missile' | 'laser' | 'drone' | 'ion';
export type WeaponLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
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
  | 'skimmer'
  | 'weaver'
  | 'prism'
  | 'leech'
  | 'razorwing'
  | 'gatekeeper'
  | 'pursuer'
  | 'carrierBoss'
  | 'warden'
  | 'seraph'
  | 'nullArchitect'
  | 'boss';
export type GameMode = 'briefing' | 'playing' | 'paused' | 'complete' | 'gameover' | 'victory';
export type DamageResult = 'ignored' | 'shield' | 'reserve' | 'hull' | 'secondWind' | 'nanites' | 'fortress' | 'phoenix' | 'destroyed';
export type MissionId = 'coastal' | 'minefield' | 'aurora' | 'fortress' | 'stormbreak' | 'graveyard' | 'carrierSiege' | 'dreadnought' | 'lastLight';
export type CampaignPhase = 'briefing' | 'mission' | 'story' | 'hangar' | 'route' | 'victory';
export type CampaignRoute = 'storm' | 'salvage';
export type RouteRewardId = 'arc-resonator' | 'aegis-bastion';
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
  | 'aurora-key'
  | 'forked-truth'
  | 'stillwater-directive'
  | 'project-crown'
  | 'rook-confession'
  | 'last-vector'
  | 'homeward';
export type StorySpeaker = 'Hana' | 'Vale' | 'ECHO-7';
export type StoryTransition = 'dissolve' | 'comic-wipe' | 'flash' | 'push';
export type MusicTrack =
  | 'menu'
  | 'hangar'
  | 'story-discovery'
  | 'story-revelation'
  | 'mission-coastal'
  | 'mission-minefield'
  | 'mission-aurora'
  | 'mission-fortress'
  | 'mission-stormbreak'
  | 'mission-graveyard'
  | 'mission-carrier-siege'
  | 'mission-dreadnought'
  | 'mission-last-light'
  | 'boss'
  | 'victory'
  | 'ending'
  | 'defeat';
export type MusicPlaybackState = 'locked' | 'loading' | 'playing' | 'unavailable';
export type VoicePlaybackState = 'idle' | 'loading' | 'playing' | 'subtitle-only' | 'unavailable';
export type WeaponOverdriveState = 'inactive' | 'cell' | 'reactor' | 'stacked';
export type EnemyHitZoneRole = 'core' | 'wing' | 'weakpoint';
export type FinalePhase = 'approach' | 'boss' | 'cleared';
export type FinaleBossStage = 'seraph' | 'nullArchitect';
export type FinaleBossKind = 'boss' | FinaleBossStage;
export type MissionWaypointId = 1 | 2;

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
  | { mode: 'tail'; tailSeconds: number; crossfadeSeconds: number; endSeconds?: number };

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
  cinematicGain: number;
  activeRadioCue?: string;
  voicePlaybackState: VoicePlaybackState;
  voiceDurationSeconds?: number;
  voiceGainCorrection?: number;
  lastVoiceError?: string;
  voiceAssetCheckComplete: boolean;
  voiceAssetsReady: number;
  voiceAssetsMissing: number;
  radioTrimDb: number;
  radioTrimGain: number;
  positionSeconds: number;
  logicalStartCount: number;
  loopRegion?: { startSeconds: number; endSeconds: number };
  queuedSources: number;
  loopIteration: number;
  lastError?: string;
}

export interface GameCheckpointSnapshot {
  creditRemainder?: number;
  stageElapsedMs: number;
  score: number;
  kills: number;
  creditsEarned: number;
  shotsFired: number;
  shotsHit: number;
  damageTaken: number;
  weapons: WeaponLevels;
  shieldBaseMax: number;
  /** Capacity granted by an earned campaign route; never added to base pickups. */
  shieldCapacityBonus?: number;
  hull: number;
  shield: number;
  empCharges: number;
  phoenixAvailable: boolean;
  reserveShieldAvailable: boolean;
  secondWindAvailable: boolean;
  emergencyCapacitorTriggers: number;
  naniteLatticeAvailable: boolean;
  sortieNanitesAvailable: boolean;
  fortressRamAvailable: boolean;
  finalePhase?: FinalePhase;
  finaleBossStage?: FinaleBossStage;
}

export interface EncounterCheckpointSnapshot {
  waveIndex: number;
  nextCarrierIndex: number;
  killsSinceUtilityDrop: number;
  armamentOfferHistory: Array<readonly [UpgradeType, UpgradeType]>;
  minibossSpawned: boolean;
  commandSpawned: boolean;
  commandRemaining: number;
  bulwarkIntroduced: boolean;
  finaleApproachWave: number;
  bossSpawned: boolean;
  lastThreatLevel: ThreatLevel;
  lastUtility?: UtilityPickupType;
}

export interface MissionWaypointSnapshot {
  missionId: MissionId;
  waypointId: MissionWaypointId;
  capturedAtMs: number;
  game: GameCheckpointSnapshot;
  encounter: EncounterCheckpointSnapshot;
  bossHealthRatio?: number;
}

export interface StoryPanel {
  id: string;
  image: string;
  alt: string;
  speaker: StorySpeaker;
  caption: string;
  durationMs: number;
  transition: StoryTransition;
  motion?: 'drift-left' | 'drift-right' | 'push-in' | 'pull-back';
  bubbleSide?: 'left' | 'right';
  location?: string;
  shot?: 'wide' | 'insert' | 'portrait' | 'reaction' | 'over-shoulder' | 'departure';
  focalPoint?: string;
}

export interface StoryChapter {
  id: StoryChapterId;
  title: string;
  afterMission: MissionId;
  route?: CampaignRoute;
  presentation?: 'cinematic';
  musicTrack?: 'story-discovery' | 'story-revelation' | 'ending';
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
  | 'fabrication-matrix'
  | 'precision-feed'
  | 'capacitor-reservoir'
  | 'ablative-frame'
  | 'rapid-recovery';

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
  tier: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  name: string;
  description: string;
  cost: number;
  icon: string;
}

export interface CombatModifiers {
  fireIntervalMultiplier: number;
  damageMultiplier: number;
  arcDamageMultiplier: number;
  shieldCapacityBonus: number;
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
  resumeFrom?: MissionWaypointSnapshot;
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
  version: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  phase: CampaignPhase;
  difficulty: Difficulty;
  missionIndex: number;
  currentMissionId?: MissionId;
  /** First fork after Coastal: salvage = Minefield, storm = Aurora. */
  earlyRoute?: CampaignRoute;
  /** Independent evidence fork after Fortress: salvage = Graveyard, storm = Stormbreak. */
  route?: CampaignRoute;
  routeReward?: RouteRewardId;
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
  activeWaypoint?: MissionWaypointSnapshot;
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
  finaleBossStage?: FinaleBossStage;
  threatLevel: ThreatLevel;
  chronoRemainingMs: number;
  reserveShieldAvailable: boolean;
  secondWindAvailable: boolean;
  latestWaypointId?: MissionWaypointId;
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
