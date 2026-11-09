import { getMissionById, MISSIONS, nextMissionId, routeMissionId } from '../content/missions';
import { getSortieModule, SORTIE_MODULES } from '../content/sortieModules';
import { getStoryChapter, STORY_CHAPTER_IDS, storyChapterForMission } from '../content/story';
import { buildCombatModifiers, getSibling, getUpgradeNode, UPGRADE_NODES } from '../content/upgrades';
import { ENEMIES, WEAPON_MAX_LEVEL } from '../content/balance';
import { applyRouteReward, ROUTE_REWARDS, routeRewardForClear } from '../content/routeRewards';
import { cloneMissionWaypoint, sanitizeMissionWaypoint } from './checkpoints';
import type {
  CampaignRoute,
  CampaignSnapshot,
  Difficulty,
  EnemyKind,
  GameCheckpointSnapshot,
  GameSnapshot,
  MissionDefinition,
  MissionId,
  MissionStartConfig,
  MissionWaypointSnapshot,
  SortieModuleId,
  StoryChapterId,
  UpgradeNodeId,
  WeaponLevel,
  WeaponLevels,
} from './types';

const INITIAL_WEAPONS: WeaponLevels = { spread: 1, missile: 0, laser: 0, drone: 0, ion: 0 };
const LEGACY_MISSIONS: MissionId[] = ['coastal', 'minefield', 'fortress', 'dreadnought'];
const nonnegativeInteger = (value: unknown, fallback = 0): number => typeof value === 'number' && Number.isFinite(value)
  ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value))) : fallback;

export interface PurchaseResult {
  ok: boolean;
  reason?: 'owned' | 'locked' | 'insufficient' | 'unavailable' | 'equipped';
}

export class CampaignModel {
  private state: CampaignSnapshot;

  constructor(saved?: CampaignSnapshot) {
    this.state = saved ? CampaignModel.sanitize(saved) : CampaignModel.fresh('pilot');
  }

  static fresh(difficulty: Difficulty): CampaignSnapshot {
    return {
      version: 8,
      phase: 'briefing',
      difficulty,
      missionIndex: 0,
      currentMissionId: 'coastal',
      credits: 0,
      score: 0,
      campaignKills: 0,
      weapons: { ...INITIAL_WEAPONS },
      shieldBaseMax: 1,
      purchased: [],
      respecAvailable: true,
      campaignSeed: CampaignModel.makeSeed(),
      discoveredEnemies: [],
      seenStoryChapters: [],
    };
  }

  startNew(difficulty: Difficulty): void {
    this.state = CampaignModel.fresh(difficulty);
  }

  currentMission(): MissionDefinition {
    return getMissionById(this.state.currentMissionId ?? 'coastal');
  }

  selectRoute(route: CampaignRoute): boolean {
    if (this.state.phase !== 'route' || (route !== 'storm' && route !== 'salvage')) return false;
    const afterMission = this.currentMission().id;
    if (afterMission === 'coastal' && !this.state.earlyRoute) this.state.earlyRoute = route;
    else if (afterMission === 'fortress' && !this.state.route) this.state.route = route;
    else return false;
    this.state.currentMissionId = routeMissionId(route, afterMission);
    this.state.missionIndex = MISSIONS.findIndex((mission) => mission.id === this.state.currentMissionId);
    this.state.phase = 'hangar';
    return true;
  }

  purchaseSortieModule(id: SortieModuleId): PurchaseResult {
    if (this.state.phase === 'mission' || this.state.phase === 'story' || this.state.phase === 'victory' || this.state.phase === 'route') return { ok: false, reason: 'unavailable' };
    if (this.state.sortieModule) return { ok: false, reason: 'equipped' };
    const module = getSortieModule(id);
    if (this.state.credits < module.cost) return { ok: false, reason: 'insufficient' };
    this.state.credits -= module.cost;
    this.state.sortieModule = id;
    return { ok: true };
  }

  discoverEnemy(kind: EnemyKind): void {
    const discovered = this.state.discoveredEnemies ?? [];
    if (!discovered.includes(kind)) this.state.discoveredEnemies = [...discovered, kind];
  }

  beginMission(debugDurationMs?: number): MissionStartConfig {
    if (this.state.phase === 'story' || this.state.phase === 'victory' || this.state.phase === 'route') throw new Error('The campaign cannot start this mission yet.');
    this.state.phase = 'mission';
    return {
      difficulty: this.state.difficulty,
      mission: this.currentMission(),
      score: this.state.score,
      weapons: { ...this.state.weapons },
      shieldBaseMax: this.state.shieldBaseMax,
      modifiers: applyRouteReward(buildCombatModifiers(this.state.purchased), this.state.routeReward),
      campaignSeed: this.state.campaignSeed ?? CampaignModel.makeSeed(),
      sortieModule: this.state.sortieModule,
      resumeFrom: this.state.activeWaypoint ? cloneMissionWaypoint(this.state.activeWaypoint) : undefined,
      debugDurationMs,
    };
  }

  failMission(): void {
    this.state.phase = this.state.activeWaypoint
      ? 'mission'
      : this.currentMission().id === 'coastal' ? 'briefing' : 'hangar';
  }

  saveWaypoint(waypoint: MissionWaypointSnapshot): boolean {
    if (this.state.phase !== 'mission' || waypoint.missionId !== this.currentMission().id) return false;
    if (this.state.activeWaypoint && this.state.activeWaypoint.waypointId >= waypoint.waypointId) return false;
    const validated = sanitizeMissionWaypoint(waypoint, this.currentMission().id);
    if (!validated || validated.game.score < this.state.score) return false;
    this.state.activeWaypoint = validated;
    return true;
  }

  /** Only consumed protections cross the retry boundary; post-waypoint earnings never do. */
  recordConsumedDefenses(current: GameCheckpointSnapshot, missionId: MissionId): boolean {
    const waypoint = this.state.activeWaypoint;
    if (this.state.phase !== 'mission' || !waypoint || waypoint.missionId !== missionId || !Number.isFinite(current.stageElapsedMs) || current.stageElapsedMs < waypoint.game.stageElapsedMs) return false;
    const saved = waypoint.game;
    let changed = false;
    for (const key of ['phoenixAvailable', 'reserveShieldAvailable', 'secondWindAvailable', 'naniteLatticeAvailable', 'sortieNanitesAvailable', 'fortressRamAvailable'] as const) {
      if (saved[key] && current[key] === false) {
        saved[key] = false;
        changed = true;
      }
    }
    if (counterWithin(current.emergencyCapacitorTriggers, 2) && current.emergencyCapacitorTriggers > saved.emergencyCapacitorTriggers) {
      saved.emergencyCapacitorTriggers = current.emergencyCapacitorTriggers;
      changed = true;
    }
    return changed;
  }

  abandonMission(): void {
    if (this.state.phase !== 'mission') return;
    this.state.activeWaypoint = undefined;
    this.state.phase = this.currentMission().id === 'coastal' ? 'briefing' : 'hangar';
  }

  completeMission(result: GameSnapshot): CampaignSnapshot {
    const mission = this.currentMission();
    if (this.state.phase !== 'mission') throw new Error('This mission is not awaiting a result.');
    if (result.missionId !== mission.id) throw new Error('Mission result does not match the active campaign mission.');
    if (result.mode !== 'complete' && result.mode !== 'victory') throw new Error('Only successful missions can be committed.');
    if (mission.id === 'lastLight' && (result.finaleBossStage !== 'nullArchitect' || result.finalePhase !== 'cleared')) {
      throw new Error('Both Last Light command targets must be defeated before completing the mission.');
    }
    const chapter = storyChapterForMission(mission.id);

    const completionCredits = Math.round(mission.completionCredits * buildCombatModifiers(this.state.purchased).creditMultiplier);
    const missionScore = Math.max(0, result.score - this.state.score);
    const shotsFired = Math.max(0, result.shotsFired);
    this.state.score = result.score;
    this.state.credits += result.creditsEarned + completionCredits;
    this.state.campaignKills += result.kills;
    this.state.weapons = { ...result.weapons };
    this.state.shieldBaseMax = result.shieldBaseMax;
    this.state.routeReward ??= routeRewardForClear(mission.id, this.state.earlyRoute);
    this.state.sortieModule = undefined;
    this.state.activeWaypoint = undefined;
    this.state.lastReport = {
      missionId: mission.id,
      title: mission.title,
      score: missionScore,
      kills: result.kills,
      creditsEarned: result.creditsEarned + completionCredits,
      damageTaken: result.damageTaken,
      shotsFired,
      shotsHit: result.shotsHit,
      accuracy: shotsFired === 0 ? 0 : Math.min(100, Math.round((result.shotsHit / shotsFired) * 100)),
    };

    this.state.pendingStoryChapter = chapter;
    this.state.phase = 'story';
    return this.snapshot();
  }

  completeStoryChapter(): CampaignSnapshot {
    const pending = this.state.pendingStoryChapter;
    if (this.state.phase !== 'story' || !pending) throw new Error('No story chapter is awaiting completion.');
    const seen = this.state.seenStoryChapters ?? [];
    if (!seen.includes(pending)) this.state.seenStoryChapters = [...seen, pending];
    this.state.pendingStoryChapter = undefined;
    const next = nextMissionId(this.currentMission().id, this.state.route, this.state.earlyRoute);
    if (next === 'victory') this.state.phase = 'victory';
    else if (next === 'route') this.state.phase = 'route';
    else {
      this.state.currentMissionId = next;
      this.state.missionIndex = MISSIONS.findIndex((candidate) => candidate.id === next);
      this.state.phase = 'hangar';
    }
    return this.snapshot();
  }

  canPurchase(id: UpgradeNodeId): PurchaseResult {
    const node = getUpgradeNode(id);
    if (this.state.phase === 'mission' || this.state.phase === 'story' || this.state.phase === 'victory') return { ok: false, reason: 'unavailable' };
    if (this.state.purchased.includes(id)) return { ok: false, reason: 'owned' };
    if (this.state.purchased.includes(getSibling(node).id)) return { ok: false, reason: 'locked' };
    if (node.tier > 1) {
      const previousTierOwned = UPGRADE_NODES.some((candidate) =>
        candidate.branch === node.branch && candidate.tier === node.tier - 1 && this.state.purchased.includes(candidate.id),
      );
      if (!previousTierOwned) return { ok: false, reason: 'locked' };
    }
    if (this.state.credits < node.cost) return { ok: false, reason: 'insufficient' };
    return { ok: true };
  }

  purchase(id: UpgradeNodeId): PurchaseResult {
    const result = this.canPurchase(id);
    if (!result.ok) return result;
    const node = getUpgradeNode(id);
    this.state.credits -= node.cost;
    this.state.purchased.push(id);
    return { ok: true };
  }

  respec(): boolean {
    if (!this.state.respecAvailable || this.state.phase === 'mission' || this.state.phase === 'story' || this.state.phase === 'victory') return false;
    const refund = this.state.purchased.reduce((total, id) => total + getUpgradeNode(id).cost, 0);
    this.state.credits += refund;
    this.state.purchased = [];
    this.state.respecAvailable = false;
    return true;
  }

  snapshot(): CampaignSnapshot {
    return {
      ...this.state,
      weapons: { ...this.state.weapons },
      purchased: [...this.state.purchased],
      discoveredEnemies: [...(this.state.discoveredEnemies ?? [])],
      seenStoryChapters: [...(this.state.seenStoryChapters ?? [])],
      lastReport: this.state.lastReport ? { ...this.state.lastReport } : undefined,
      activeWaypoint: this.state.activeWaypoint ? cloneMissionWaypoint(this.state.activeWaypoint) : undefined,
    };
  }

  exportSave(): CampaignSnapshot {
    const snapshot = this.snapshot();
    if (snapshot.phase === 'mission' && !snapshot.activeWaypoint) snapshot.phase = snapshot.currentMissionId === 'coastal' ? 'briefing' : 'hangar';
    return snapshot;
  }

  private static sanitize(candidate: CampaignSnapshot): CampaignSnapshot {
    const validDifficulty: Difficulty = ['cadet', 'pilot', 'ace'].includes(candidate.difficulty) ? candidate.difficulty : 'pilot';
    const validNodes = new Set(UPGRADE_NODES.map((node) => node.id));
    const purchased = Array.isArray(candidate.purchased) ? [...new Set(candidate.purchased.filter((id): id is UpgradeNodeId => validNodes.has(id)))] : [];
    const legacyIndex = Math.min(LEGACY_MISSIONS.length - 1, nonnegativeInteger(candidate.missionIndex));
    const candidateMission = (candidate.version ?? 1) >= 3 ? candidate.currentMissionId : LEGACY_MISSIONS[legacyIndex];
    const currentMissionId = MISSIONS.some((mission) => mission.id === candidateMission) ? candidateMission! : 'coastal';
    const missionIndex = MISSIONS.findIndex((mission) => mission.id === currentMissionId);
    const seenChapters = Array.isArray(candidate.seenStoryChapters) ? candidate.seenStoryChapters : [];
    const validRoute = (route: unknown): CampaignRoute | undefined => route === 'storm' || route === 'salvage' ? route : undefined;
    const legacyRoute = validRoute(candidate.route);
    // V7 coupled the two forks. Retain the first decision, but do not silently
    // make the second one until its mission has actually been entered. V1–6
    // always flew Minefield; their late Stormbreak choice is not an Aurora visit.
    const earlyRoute: CampaignRoute | undefined = currentMissionId === 'coastal' ? undefined
      : currentMissionId === 'aurora' || seenChapters.includes('aurora-key') ? 'storm'
        : currentMissionId === 'minefield' || seenChapters.includes('warden-key') ? 'salvage'
          : candidate.version >= 8 ? validRoute(candidate.earlyRoute) ?? 'salvage'
            : candidate.version === 7 ? legacyRoute ?? 'salvage' : 'salvage';
    const beyondSecondFork = ['stormbreak', 'graveyard', 'carrierSiege', 'dreadnought', 'lastLight'].includes(currentMissionId);
    const route: CampaignRoute | undefined = !beyondSecondFork ? undefined
      : currentMissionId === 'stormbreak' ? 'storm'
        : currentMissionId === 'graveyard' ? 'salvage'
          : legacyRoute ?? (seenChapters.includes('stillwater-directive') ? 'storm'
            : seenChapters.includes('project-crown') ? 'salvage' : undefined);
    const validStoryIds = new Set<StoryChapterId>(STORY_CHAPTER_IDS);
    // A stale chapter field must never reopen a completed campaign or skip a mission.
    const pendingStoryChapter = candidate.phase === 'story'
      && validStoryIds.has(candidate.pendingStoryChapter as StoryChapterId)
      && getStoryChapter(candidate.pendingStoryChapter!).afterMission === currentMissionId
      ? candidate.pendingStoryChapter : undefined;
    const waypoint = sanitizeMissionWaypoint(candidate.activeWaypoint, currentMissionId);
    const activeWaypoint = candidate.phase === 'mission' && waypoint && waypoint.game.score >= nonnegativeInteger(candidate.score) ? waypoint : undefined;
    const phase = pendingStoryChapter ? 'story'
      : candidate.phase === 'victory' ? 'victory'
        : candidate.phase === 'route' && (currentMissionId === 'fortress' || (candidate.version >= 7 && currentMissionId === 'coastal')) ? 'route'
          : candidate.phase === 'mission' && activeWaypoint ? 'mission'
          : candidate.phase === 'hangar' || currentMissionId !== 'coastal' ? 'hangar' : 'briefing';
    return {
      version: 8,
      phase,
      difficulty: validDifficulty,
      missionIndex,
      currentMissionId,
      earlyRoute,
      route,
      // Version-six saves never held an earned reward. Do not infer one from a
      // route selection, nor grant a reward for a mission that is still pending.
      routeReward: candidate.version >= 7 && earlyRoute
        && candidate.routeReward === ROUTE_REWARDS[earlyRoute].id
        ? candidate.routeReward : undefined,
      sortieModule: SORTIE_MODULES.some(({ id }) => id === candidate.sortieModule) ? candidate.sortieModule : undefined,
      discoveredEnemies: Array.isArray(candidate.discoveredEnemies) ? [...new Set(candidate.discoveredEnemies.filter((kind) => Object.hasOwn(ENEMIES, kind)))] : [],
      credits: nonnegativeInteger(candidate.credits),
      score: nonnegativeInteger(candidate.score),
      campaignKills: nonnegativeInteger(candidate.campaignKills),
      weapons: {
        spread: CampaignModel.weaponLevel(candidate.weapons?.spread, 1, WEAPON_MAX_LEVEL.spread),
        missile: CampaignModel.weaponLevel(candidate.weapons?.missile, 0),
        laser: CampaignModel.weaponLevel(candidate.weapons?.laser, 0),
        drone: CampaignModel.weaponLevel(candidate.weapons?.drone, 0),
        ion: CampaignModel.weaponLevel(candidate.weapons?.ion, 0),
      },
      shieldBaseMax: Math.max(1, Math.min(3, nonnegativeInteger(candidate.shieldBaseMax, 1))),
      purchased,
      respecAvailable: candidate.respecAvailable !== false,
      campaignSeed: Number.isFinite(candidate.campaignSeed) ? Math.max(1, Math.floor(candidate.campaignSeed!)) : CampaignModel.makeSeed(),
      lastReport: candidate.lastReport,
      pendingStoryChapter,
      seenStoryChapters: Array.isArray(candidate.seenStoryChapters)
        ? [...new Set(candidate.seenStoryChapters.filter((id): id is StoryChapterId => validStoryIds.has(id)))]
        : [],
      activeWaypoint,
    };
  }

  private static weaponLevel(value: number | undefined, fallback: WeaponLevel, maximum: WeaponLevel = 5): WeaponLevel {
    return (Number.isFinite(value) ? Math.max(fallback, Math.min(maximum, Math.floor(value!))) : fallback) as WeaponLevel;
  }

  private static makeSeed(): number {
    return Math.max(1, Math.floor(Math.random() * 0x7fffffff));
  }
}

function counterWithin(value: number, maximum: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= maximum;
}
