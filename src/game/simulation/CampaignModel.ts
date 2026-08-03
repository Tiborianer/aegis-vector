import { getMissionById, MISSIONS, nextMissionId, routeMissionId } from '../content/missions';
import { getSortieModule } from '../content/sortieModules';
import { STORY_CHAPTER_IDS, storyChapterForMission } from '../content/story';
import { buildCombatModifiers, getSibling, getUpgradeNode, UPGRADE_NODES } from '../content/upgrades';
import type {
  CampaignRoute,
  CampaignSnapshot,
  Difficulty,
  EnemyKind,
  GameSnapshot,
  MissionDefinition,
  MissionId,
  MissionStartConfig,
  SortieModuleId,
  StoryChapterId,
  UpgradeNodeId,
  WeaponLevel,
  WeaponLevels,
} from './types';

const INITIAL_WEAPONS: WeaponLevels = { spread: 1, missile: 0, laser: 0, drone: 0, ion: 0 };
const LEGACY_MISSIONS: MissionId[] = ['coastal', 'minefield', 'fortress', 'dreadnought'];

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
      version: 4,
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
    if (this.state.phase !== 'route') return false;
    this.state.route = route;
    this.state.currentMissionId = routeMissionId(route);
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
      modifiers: buildCombatModifiers(this.state.purchased),
      campaignSeed: this.state.campaignSeed ?? CampaignModel.makeSeed(),
      sortieModule: this.state.sortieModule,
      debugDurationMs,
    };
  }

  failMission(): void {
    this.state.phase = this.currentMission().id === 'coastal' ? 'briefing' : 'hangar';
  }

  completeMission(result: GameSnapshot): CampaignSnapshot {
    const mission = this.currentMission();
    if (result.missionId !== mission.id) throw new Error('Mission result does not match the active campaign mission.');
    if (result.mode !== 'complete' && result.mode !== 'victory') throw new Error('Only successful missions can be committed.');

    const completionCredits = Math.round(mission.completionCredits * buildCombatModifiers(this.state.purchased).creditMultiplier);
    const missionScore = Math.max(0, result.score - this.state.score);
    const shotsFired = Math.max(0, result.shotsFired);
    this.state.score = result.score;
    this.state.credits += result.creditsEarned + completionCredits;
    this.state.campaignKills += result.kills;
    this.state.weapons = { ...result.weapons };
    this.state.shieldBaseMax = result.shieldBaseMax;
    this.state.sortieModule = undefined;
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

    this.state.pendingStoryChapter = storyChapterForMission(mission.id);
    this.state.phase = 'story';
    return this.snapshot();
  }

  completeStoryChapter(): CampaignSnapshot {
    const pending = this.state.pendingStoryChapter;
    if (this.state.phase !== 'story' || !pending) throw new Error('No story chapter is awaiting completion.');
    const seen = this.state.seenStoryChapters ?? [];
    if (!seen.includes(pending)) this.state.seenStoryChapters = [...seen, pending];
    this.state.pendingStoryChapter = undefined;
    const next = nextMissionId(this.currentMission().id, this.state.route);
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
    };
  }

  exportSave(): CampaignSnapshot {
    const snapshot = this.snapshot();
    if (snapshot.phase === 'mission') snapshot.phase = snapshot.currentMissionId === 'coastal' ? 'briefing' : 'hangar';
    return snapshot;
  }

  private static sanitize(candidate: CampaignSnapshot): CampaignSnapshot {
    const validDifficulty: Difficulty = ['cadet', 'pilot', 'ace'].includes(candidate.difficulty) ? candidate.difficulty : 'pilot';
    const validNodes = new Set(UPGRADE_NODES.map((node) => node.id));
    const purchased = Array.isArray(candidate.purchased) ? candidate.purchased.filter((id): id is UpgradeNodeId => validNodes.has(id)) : [];
    const legacyIndex = Math.max(0, Math.min(LEGACY_MISSIONS.length - 1, Math.floor(candidate.missionIndex ?? 0)));
    const candidateMission = (candidate.version ?? 1) >= 3 ? candidate.currentMissionId : LEGACY_MISSIONS[legacyIndex];
    const currentMissionId = MISSIONS.some((mission) => mission.id === candidateMission) ? candidateMission! : 'coastal';
    const missionIndex = MISSIONS.findIndex((mission) => mission.id === currentMissionId);
    const validStoryIds = new Set<StoryChapterId>(STORY_CHAPTER_IDS);
    const pendingStoryChapter = validStoryIds.has(candidate.pendingStoryChapter as StoryChapterId)
      ? candidate.pendingStoryChapter
      : undefined;
    const phase = pendingStoryChapter ? 'story'
      : candidate.phase === 'victory' ? 'victory'
        : candidate.phase === 'route' ? 'route'
          : candidate.phase === 'hangar' || currentMissionId !== 'coastal' ? 'hangar' : 'briefing';
    return {
      version: 4,
      phase,
      difficulty: validDifficulty,
      missionIndex,
      currentMissionId,
      route: candidate.route,
      sortieModule: candidate.sortieModule,
      discoveredEnemies: Array.isArray(candidate.discoveredEnemies) ? [...new Set(candidate.discoveredEnemies)] : [],
      credits: Math.max(0, Math.floor(candidate.credits ?? 0)),
      score: Math.max(0, Math.floor(candidate.score ?? 0)),
      campaignKills: Math.max(0, Math.floor(candidate.campaignKills ?? 0)),
      weapons: {
        spread: CampaignModel.weaponLevel(candidate.weapons?.spread, 1),
        missile: CampaignModel.weaponLevel(candidate.weapons?.missile, 0),
        laser: CampaignModel.weaponLevel(candidate.weapons?.laser, 0),
        drone: CampaignModel.weaponLevel(candidate.weapons?.drone, 0),
        ion: CampaignModel.weaponLevel(candidate.weapons?.ion, 0),
      },
      shieldBaseMax: Math.max(1, Math.min(3, Math.floor(candidate.shieldBaseMax ?? 1))),
      purchased,
      respecAvailable: candidate.respecAvailable !== false,
      campaignSeed: Number.isFinite(candidate.campaignSeed) ? Math.max(1, Math.floor(candidate.campaignSeed!)) : CampaignModel.makeSeed(),
      lastReport: candidate.lastReport,
      pendingStoryChapter,
      seenStoryChapters: Array.isArray(candidate.seenStoryChapters)
        ? [...new Set(candidate.seenStoryChapters.filter((id): id is StoryChapterId => validStoryIds.has(id)))]
        : [],
    };
  }

  private static weaponLevel(value: number | undefined, fallback: WeaponLevel): WeaponLevel {
    return (Number.isFinite(value) ? Math.max(0, Math.min(5, Math.floor(value!))) : fallback) as WeaponLevel;
  }

  private static makeSeed(): number {
    return Math.max(1, Math.floor(Math.random() * 0x7fffffff));
  }
}
