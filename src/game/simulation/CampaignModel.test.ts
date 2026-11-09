import { describe, expect, it } from 'vitest';
import { CampaignModel } from './CampaignModel';
import { GameModel } from './GameModel';
import type { CampaignSnapshot, MissionWaypointSnapshot, MissionId } from './types';

const fundedCampaign = (): CampaignSnapshot => ({
  version: 1,
  phase: 'hangar',
  difficulty: 'pilot',
  missionIndex: 1,
  credits: 500,
  score: 1_000,
  campaignKills: 10,
  weapons: { spread: 2, missile: 1, laser: 0, drone: 0, ion: 0 },
  shieldBaseMax: 2,
  purchased: [],
  respecAvailable: true,
});

const lateCampaign = (missionId: MissionId): CampaignModel => new CampaignModel({
  ...fundedCampaign(), version: 6, currentMissionId: missionId,
  weapons: { spread: 7, missile: 5, laser: 5, drone: 5, ion: 5 },
});

const waypointFor = (model: GameModel, id: 1 | 2): MissionWaypointSnapshot => ({
  missionId: model.mission.id, waypointId: id, capturedAtMs: model.stageElapsedMs, game: model.exportCheckpoint(),
  encounter: { waveIndex: 4, nextCarrierIndex: 0, killsSinceUtilityDrop: 2, armamentOfferHistory: [], minibossSpawned: false, commandSpawned: false, commandRemaining: 0, bulwarkIntroduced: false, finaleApproachWave: 4, bossSpawned: false, lastThreatLevel: 1 },
});

describe('CampaignModel', () => {
  it.each([
    ['storm', 'storm'], ['storm', 'salvage'], ['salvage', 'storm'], ['salvage', 'salvage'],
  ] as const)('chooses %s then %s independently and preserves both forks and rewards through refresh', (earlyRoute, route) => {
    let campaign = new CampaignModel({ ...CampaignModel.fresh('pilot'), campaignSeed: 177 });
    let expectedCredits = 0;
    let expectedKills = 0;
    const finish = (): CampaignSnapshot => {
      const battle = new GameModel();
      battle.start(campaign.beginMission());
      battle.registerKill(100, 5);
      expectedCredits += 5 + campaign.currentMission().completionCredits;
      expectedKills++;
      if (battle.mission.id === 'lastLight') {
        battle.setFinalePhase('boss');
        battle.advanceFinaleBoss();
      }
      battle.complete(battle.mission.id === 'lastLight');
      campaign.completeMission(battle.snapshot());
      campaign = new CampaignModel(JSON.parse(JSON.stringify(campaign.exportSave())) as CampaignSnapshot);
      expect(campaign.snapshot().credits).toBe(expectedCredits);
      expect(campaign.snapshot().campaignKills).toBe(expectedKills);
      expect(campaign.snapshot().campaignSeed).toBe(177);
      return campaign.completeStoryChapter();
    };
    expect(finish().phase).toBe('route');
    campaign = new CampaignModel(campaign.exportSave());
    expect(campaign.selectRoute(earlyRoute)).toBe(true);
    expect(campaign.selectRoute(earlyRoute === 'storm' ? 'salvage' : 'storm')).toBe(false);
    expect(campaign.snapshot().route).toBeUndefined();
    expect(campaign.currentMission().id).toBe(earlyRoute === 'storm' ? 'aurora' : 'minefield');
    expect(finish().currentMissionId).toBe('fortress');
    expect(finish().phase).toBe('route');
    campaign = new CampaignModel(campaign.exportSave());
    expect(campaign.snapshot().earlyRoute).toBe(earlyRoute);
    expect(campaign.snapshot().route).toBeUndefined();
    expect(() => campaign.beginMission()).toThrow();
    expect(campaign.selectRoute(route)).toBe(true);
    expect(campaign.selectRoute(route === 'storm' ? 'salvage' : 'storm')).toBe(false);
    const reward = earlyRoute === 'storm' ? 'aegis-bastion' : 'arc-resonator';
    expect(campaign.snapshot().routeReward).toBe(reward);
    expect(campaign.snapshot().credits).toBe(expectedCredits);
    for (const id of [route === 'storm' ? 'stormbreak' : 'graveyard', 'carrierSiege', 'dreadnought', 'lastLight']) {
      expect(campaign.currentMission().id).toBe(id);
      const next = finish();
      expect(next.phase).not.toBe('route');
      expect(next.earlyRoute).toBe(earlyRoute);
      expect(next.route).toBe(route);
      expect(next.routeReward).toBe(reward);
    }
    expect(campaign.snapshot().phase).toBe('victory');
    expect(expectedKills).toBe(7);
  });

  it.each(['storm', 'salvage'] as const)('grants the %s reward once after success, not selection/failure, and keeps it through respec/retry', (route) => {
    const campaign = new CampaignModel({ ...CampaignModel.fresh('pilot'), phase: 'route' });
    expect(campaign.selectRoute(route)).toBe(true);
    expect(campaign.snapshot().routeReward).toBeUndefined();
    const battle = new GameModel();
    battle.start(campaign.beginMission());
    battle.registerKill(100, 9);
    battle.upgrade('shield');
    campaign.failMission();
    expect(campaign.snapshot().routeReward).toBeUndefined();
    expect(campaign.snapshot().credits).toBe(0);
    battle.start(campaign.beginMission());
    expect(battle.shieldMax).toBe(1);
    battle.registerKill(100, 9);
    battle.complete();
    const won = campaign.completeMission(battle.snapshot());
    expect(won.routeReward).toBe(route === 'storm' ? 'aegis-bastion' : 'arc-resonator');
    expect(won.credits).toBe(44);
    expect(() => campaign.completeMission(battle.snapshot())).toThrow('not awaiting');
    campaign.completeStoryChapter();
    const restored = new CampaignModel(campaign.exportSave());
    expect(restored.respec()).toBe(true);
    for (let attempt = 0; attempt < 3; attempt++) {
      battle.start(restored.beginMission());
      expect(battle.shieldBaseMax).toBe(1);
      expect(battle.shieldMax).toBe(route === 'storm' ? 2 : 1);
      expect(battle.arcDamageMultiplier).toBeCloseTo(route === 'salvage' ? 1.12 : 1);
      restored.failMission();
      expect(restored.snapshot().credits).toBe(44);
    }
  });

  it('migrates version-six late-route progress without duplicating rewards, credits or equipment', () => {
    for (const route of ['storm', 'salvage'] as const) {
      const original: CampaignSnapshot = { ...fundedCampaign(), version: 6, currentMissionId: route === 'storm' ? 'stormbreak' : 'graveyard', route };
      const migrated = new CampaignModel(original).snapshot();
      expect(migrated.version).toBe(8);
      expect(migrated.currentMissionId).toBe(original.currentMissionId);
      expect(migrated.route).toBe(route);
      expect(migrated.earlyRoute).toBe('salvage');
      expect(migrated.routeReward).toBeUndefined();
      expect(migrated.credits).toBe(original.credits);
      expect(migrated.weapons).toEqual(original.weapons);
    }
  });

  it.each(['storm', 'salvage'] as const)('reopens the second fork for a version-seven %s campaign without losing its Fortress checkpoint', (earlyRoute) => {
    const reward = earlyRoute === 'storm' ? 'aegis-bastion' : 'arc-resonator';
    const original: CampaignSnapshot = {
      ...fundedCampaign(), version: 7, currentMissionId: 'fortress', route: earlyRoute,
      routeReward: reward, campaignSeed: 177,
      seenStoryChapters: ['first-signal', earlyRoute === 'storm' ? 'aurora-key' : 'warden-key'],
    };
    const campaign = new CampaignModel(original);
    const battle = new GameModel();
    battle.start(campaign.beginMission());
    battle.tick(battle.stageDurationMs * .33);
    battle.registerKill(100, 7);
    battle.upgrade('missile');
    const waypoint = waypointFor(battle, 1);
    expect(campaign.saveWaypoint(waypoint)).toBe(true);
    // Simulate the old on-disk representation while retaining the exact cursor.
    const oldCheckpoint = { ...campaign.exportSave(), version: 7 as const, earlyRoute: undefined, route: earlyRoute };
    const refreshed = new CampaignModel(JSON.parse(JSON.stringify(oldCheckpoint)) as CampaignSnapshot);
    expect(refreshed.snapshot()).toMatchObject({ version: 8, phase: 'mission', earlyRoute, routeReward: reward, credits: 500, campaignSeed: 177 });
    expect(refreshed.snapshot().route).toBeUndefined();
    expect(refreshed.snapshot().activeWaypoint).toEqual(waypoint);
    const resume = refreshed.beginMission();
    expect(resume.resumeFrom?.encounter).toEqual(waypoint.encounter);
    expect(resume.campaignSeed).toBe(campaign.beginMission().campaignSeed);
    battle.start(resume);
    expect(battle.creditsEarned).toBe(7);
    expect(battle.weapons.missile).toBe(2);
    expect(battle.arcDamageMultiplier).toBe(earlyRoute === 'salvage' ? 1.12 : 1);
    expect(battle.shieldMax).toBe(earlyRoute === 'storm' ? 3 : 2);
    battle.complete();
    refreshed.completeMission(battle.snapshot());
    const storySave = refreshed.exportSave();
    const storyRefresh = new CampaignModel({ ...storySave, version: 7, earlyRoute: undefined, route: earlyRoute });
    expect(storyRefresh.completeStoryChapter().phase).toBe('route');
    const beforeChoice = storyRefresh.snapshot();
    expect(storyRefresh.selectRoute(earlyRoute === 'storm' ? 'salvage' : 'storm')).toBe(true);
    expect(storyRefresh.snapshot().credits).toBe(beforeChoice.credits);
    expect(storyRefresh.snapshot().routeReward).toBe(reward);
    expect(storyRefresh.snapshot().weapons).toEqual(beforeChoice.weapons);
  });

  it.each(['storm', 'salvage'] as const)('preserves version-seven %s campaigns that already entered the second branch', (route) => {
    const reward = route === 'storm' ? 'aegis-bastion' : 'arc-resonator';
    for (const missionId of [route === 'storm' ? 'stormbreak' : 'graveyard', 'carrierSiege', 'dreadnought', 'lastLight'] as const) {
      const original: CampaignSnapshot = {
        ...fundedCampaign(), version: 7, currentMissionId: missionId, route, routeReward: reward,
      };
      const migrated = new CampaignModel(original);
      expect(migrated.snapshot()).toMatchObject({ version: 8, currentMissionId: missionId, earlyRoute: route, route, routeReward: reward, credits: original.credits });
      expect(migrated.selectRoute(route === 'storm' ? 'salvage' : 'storm')).toBe(false);
      expect(new CampaignModel(migrated.exportSave()).snapshot()).toEqual(migrated.snapshot());
    }
  });

  it.each(['storm', 'salvage'] as const)('retains the earned %s reward across a crossed late route and repeated partial-service retries', (earlyRoute) => {
    const route = earlyRoute === 'storm' ? 'salvage' : 'storm';
    const campaign = new CampaignModel({
      ...fundedCampaign(), version: 8, currentMissionId: 'fortress', phase: 'route', earlyRoute,
      routeReward: earlyRoute === 'storm' ? 'aegis-bastion' : 'arc-resonator',
    });
    expect(campaign.selectRoute(route)).toBe(true);
    let refreshed = new CampaignModel(campaign.exportSave());
    const battle = new GameModel();
    battle.start(refreshed.beginMission());
    battle.tick(battle.stageDurationMs * .33);
    battle.registerKill(100, 7);
    const waypoint = waypointFor(battle, 1);
    expect(refreshed.saveWaypoint(waypoint)).toBe(true);
    for (let attempt = 0; attempt < 3; attempt++) {
      refreshed.failMission();
      refreshed = new CampaignModel(JSON.parse(JSON.stringify(refreshed.exportSave())) as CampaignSnapshot);
      battle.start(refreshed.beginMission());
      expect(battle.arcDamageMultiplier).toBe(earlyRoute === 'salvage' ? 1.12 : 1);
      expect(battle.shieldMax).toBe(earlyRoute === 'storm' ? 3 : 2);
      expect(battle.creditsEarned).toBe(7);
      expect(refreshed.snapshot().credits).toBe(500);
      expect(refreshed.snapshot()).toMatchObject({ earlyRoute, route });
      expect(refreshed.snapshot().activeWaypoint?.encounter).toEqual(waypoint.encounter);
    }
  });

  it('restores both Aurora waypoints and commits their credits and defense reward only once', () => {
    let campaign = new CampaignModel({ ...CampaignModel.fresh('pilot'), phase: 'route', campaignSeed: 177 });
    campaign.selectRoute('storm');
    const battle = new GameModel();
    battle.start(campaign.beginMission());
    for (const id of [1, 2] as const) {
      battle.tick(battle.stageDurationMs * .33);
      battle.registerKill(100, 5);
      battle.upgrade('shield');
      const waypoint = waypointFor(battle, id);
      waypoint.encounter.waveIndex = id * 12;
      waypoint.encounter.nextCarrierIndex = id;
      waypoint.encounter.armamentOfferHistory = [['shield', 'spread']];
      expect(campaign.saveWaypoint(waypoint)).toBe(true);
      campaign.failMission();
      campaign = new CampaignModel(JSON.parse(JSON.stringify(campaign.exportSave())) as CampaignSnapshot);
      const resume = campaign.beginMission();
      expect(resume.resumeFrom?.encounter).toEqual(waypoint.encounter);
      battle.start(resume);
      expect(battle.latestWaypointId).toBe(id);
      expect(battle.creditsEarned).toBe(id * 5);
      expect(battle.shieldBaseMax).toBe(id + 1);
      expect(battle.shieldMax).toBe(id + 1);
      expect(campaign.snapshot().routeReward).toBeUndefined();
      expect(campaign.snapshot().credits).toBe(0);
    }
    battle.complete();
    expect(campaign.completeMission(battle.snapshot()).credits).toBe(45);
    campaign.completeStoryChapter();
    battle.start(campaign.beginMission());
    expect(battle.mission.id).toBe('fortress');
    expect(battle.shieldMax).toBe(4);
    battle.tick(battle.stageDurationMs * .33);
    expect(campaign.saveWaypoint(waypointFor(battle, 1))).toBe(true);
    for (let retry = 0; retry < 3; retry++) {
      campaign.failMission();
      campaign = new CampaignModel(JSON.parse(JSON.stringify(campaign.exportSave())) as CampaignSnapshot);
      battle.start(campaign.beginMission());
      expect(battle.shieldBaseMax).toBe(3);
      expect(battle.shieldMax).toBe(4);
      expect(battle.shield).toBe(4);
      expect(campaign.snapshot().credits).toBe(45);
      expect(campaign.snapshot().routeReward).toBe('aegis-bastion');
    }
  });

  it('enforces prerequisites and exclusive sibling choices', () => {
    const campaign = new CampaignModel(fundedCampaign());
    expect(campaign.purchase('split-capacitors')).toEqual({ ok: false, reason: 'locked' });
    expect(campaign.purchase('rapid-cycling').ok).toBe(true);
    expect(campaign.purchase('amplified-munitions')).toEqual({ ok: false, reason: 'locked' });
    expect(campaign.purchase('split-capacitors').ok).toBe(true);
    expect(campaign.snapshot().credits).toBe(340);
  });

  it('refunds all nodes exactly once', () => {
    const campaign = new CampaignModel(fundedCampaign());
    campaign.purchase('rapid-cycling');
    campaign.purchase('split-capacitors');
    expect(campaign.respec()).toBe(true);
    expect(campaign.snapshot().credits).toBe(500);
    expect(campaign.snapshot().purchased).toEqual([]);
    expect(campaign.respec()).toBe(false);
  });

  it('commits only successful mission earnings and carried equipment', () => {
    const campaign = new CampaignModel();
    campaign.startNew('pilot');
    const battle = new GameModel();
    battle.start(campaign.beginMission());
    battle.registerKill(100, 5);
    battle.upgrade('missile');
    battle.complete();
    const storyState = campaign.completeMission(battle.snapshot());
    expect(storyState.phase).toBe('story');
    expect(storyState.pendingStoryChapter).toBe('first-signal');
    const state = campaign.completeStoryChapter();
    expect(state.phase).toBe('route');
    expect(state.currentMissionId).toBe('coastal');
    expect(state.credits).toBe(30);
    expect(state.weapons.missile).toBe(1);
    expect(state.lastReport?.creditsEarned).toBe(30);
  });

  it('restores a failed mission to the unchanged pre-mission campaign state', () => {
    const campaign = new CampaignModel(fundedCampaign());
    const before = campaign.snapshot();
    campaign.beginMission();
    campaign.failMission();
    const after = campaign.snapshot();
    expect(after.credits).toBe(before.credits);
    expect(after.score).toBe(before.score);
    expect(after.weapons).toEqual(before.weapons);
    expect(after.phase).toBe('hangar');
  });

  it('exports an in-progress mission as a resumable checkpoint', () => {
    const campaign = new CampaignModel();
    campaign.startNew('ace');
    campaign.beginMission();
    expect(campaign.exportSave().phase).toBe('briefing');
  });

  it('migrates version one campaigns without changing their carried equipment', () => {
    const legacy = fundedCampaign();
    const campaign = new CampaignModel(legacy);
    expect(campaign.snapshot().version).toBe(8);
    expect(campaign.snapshot().weapons.ion).toBe(0);
    expect(campaign.snapshot().campaignSeed).toBeTypeOf('number');
    expect(campaign.snapshot().weapons.spread).toBe(2);
  });

  it('preserves seven-level ARC saves while other weapons remain capped at five', () => {
    const state = fundedCampaign();
    state.weapons = { spread: 7, missile: 7, laser: 6, drone: 5, ion: 0 };
    const campaign = new CampaignModel(state);
    expect(campaign.snapshot().weapons).toEqual({ spread: 7, missile: 5, laser: 5, drone: 5, ion: 0 });
    expect(new CampaignModel(campaign.exportSave()).snapshot().weapons).toEqual(campaign.snapshot().weapons);
  });

  it('locks new refinements behind tier six and refunds their real purchase cost', () => {
    const state = fundedCampaign();
    state.credits = 3_000;
    const campaign = new CampaignModel(state);
    expect(campaign.purchase('precision-feed')).toEqual({ ok: false, reason: 'locked' });
    for (const id of ['rapid-cycling', 'split-capacitors', 'overdrive-reactor', 'ordnance-cascade', 'swarm-doctrine', 'helios-battery'] as const) {
      expect(campaign.purchase(id).ok).toBe(true);
    }
    expect(campaign.purchase('precision-feed').ok).toBe(true);
    expect(campaign.purchase('capacitor-reservoir')).toEqual({ ok: false, reason: 'locked' });
    expect(new CampaignModel(campaign.exportSave()).snapshot().purchased).toContain('precision-feed');
    expect(campaign.respec()).toBe(true);
    expect(campaign.snapshot().credits).toBe(3_000);
  });

  it('persists the latest waypoint and resumes the mission from it after failure', () => {
    const campaign = new CampaignModel();
    const config = campaign.beginMission();
    const battle = new GameModel();
    battle.start(config);
    battle.tick(64_000);
    battle.registerKill(100, 4);
    const waypoint: MissionWaypointSnapshot = {
      missionId: 'coastal',
      waypointId: 1,
      capturedAtMs: battle.stageElapsedMs,
      game: battle.exportCheckpoint(),
      encounter: {
        waveIndex: 8,
        nextCarrierIndex: 1,
        killsSinceUtilityDrop: 3,
        armamentOfferHistory: [['missile', 'laser']],
        minibossSpawned: false,
        commandSpawned: false,
        commandRemaining: 0,
        bulwarkIntroduced: false,
        finaleApproachWave: 0,
        bossSpawned: false,
        lastThreatLevel: 2,
      },
    };
    expect(campaign.saveWaypoint(waypoint)).toBe(true);
    campaign.failMission();
    expect(campaign.snapshot().phase).toBe('mission');
    expect(campaign.exportSave().activeWaypoint?.game.creditsEarned).toBe(4);
    const retryConfig = campaign.beginMission();
    expect(retryConfig.resumeFrom?.encounter.waveIndex).toBe(8);
    const retry = new GameModel();
    retry.start(retryConfig);
    retry.complete();
    expect(campaign.completeMission(retry.snapshot()).activeWaypoint).toBeUndefined();
  });

  it('requires a complete branch before buying a tier-four capstone', () => {
    const campaign = new CampaignModel(fundedCampaign());
    expect(campaign.purchase('prismatic-core')).toEqual({ ok: false, reason: 'locked' });
    campaign.purchase('amplified-munitions');
    campaign.purchase('hunter-logic');
    campaign.purchase('phase-arsenal');
    expect(campaign.purchase('prismatic-core').ok).toBe(true);
  });

  it('branches after Fortress Approach and converges on Carrier Siege', () => {
    const fortress = fundedCampaign();
    fortress.version = 3;
    fortress.currentMissionId = 'fortress';
    fortress.missionIndex = 2;
    const campaign = new CampaignModel(fortress);
    const battle = new GameModel();
    battle.start(campaign.beginMission());
    battle.complete();
    expect(campaign.completeMission(battle.snapshot()).phase).toBe('story');
    expect(campaign.completeStoryChapter().phase).toBe('route');
    expect(campaign.selectRoute('storm')).toBe(true);
    expect(campaign.currentMission().id).toBe('stormbreak');

    const routeBattle = new GameModel();
    routeBattle.start(campaign.beginMission());
    routeBattle.complete();
    expect(campaign.completeMission(routeBattle.snapshot()).pendingStoryChapter).toBe('stillwater-directive');
    expect(campaign.completeStoryChapter().currentMissionId).toBe('carrierSiege');
  });

  it('keeps a sortie module on failure and consumes it on success', () => {
    const campaign = new CampaignModel(fundedCampaign());
    expect(campaign.purchaseSortieModule('reserve-emp').ok).toBe(true);
    expect(campaign.beginMission().sortieModule).toBe('reserve-emp');
    campaign.failMission();
    expect(campaign.snapshot().sortieModule).toBe('reserve-emp');

    const battle = new GameModel();
    battle.start(campaign.beginMission());
    battle.complete();
    campaign.completeMission(battle.snapshot());
    expect(campaign.snapshot().sortieModule).toBeUndefined();
  });

  it('requires tiers five and six in order and still locks siblings', () => {
    const state = fundedCampaign();
    state.credits = 2_000;
    const campaign = new CampaignModel(state);
    for (const id of ['rapid-cycling', 'split-capacitors', 'overdrive-reactor', 'ordnance-cascade'] as const) {
      expect(campaign.purchase(id).ok).toBe(true);
    }
    expect(campaign.purchase('swarm-doctrine').ok).toBe(true);
    expect(campaign.purchase('resonance-matrix')).toEqual({ ok: false, reason: 'locked' });
    expect(campaign.purchase('helios-battery').ok).toBe(true);
  });

  it('preserves a pending chapter across saves and unlocks it before advancing', () => {
    const campaign = new CampaignModel();
    campaign.startNew('pilot');
    const battle = new GameModel();
    battle.start(campaign.beginMission());
    battle.complete();
    campaign.completeMission(battle.snapshot());

    const restored = new CampaignModel(campaign.exportSave());
    expect(restored.snapshot().phase).toBe('story');
    expect(restored.snapshot().pendingStoryChapter).toBe('first-signal');
    const advanced = restored.completeStoryChapter();
    expect(advanced.phase).toBe('route');
    expect(advanced.seenStoryChapters).toContain('first-signal');
    expect(advanced.currentMissionId).toBe('coastal');
  });

  it('advances a new Dreadnought clear to Last Light instead of campaign victory', () => {
    const campaign = lateCampaign('dreadnought');
    const battle = new GameModel();
    battle.start(campaign.beginMission());
    battle.complete(true);
    expect(battle.mode).toBe('complete');
    expect(campaign.completeMission(battle.snapshot()).pendingStoryChapter).toBe('last-vector');
    const next = campaign.completeStoryChapter();
    expect(next.phase).toBe('hangar');
    expect(next.currentMissionId).toBe('lastLight');
    expect(next.credits).toBe(595);
  });

  it('requires both Last Light bosses and commits its result only once', () => {
    const campaign = lateCampaign('lastLight');
    const battle = new GameModel();
    const config = campaign.beginMission();
    battle.start(config);
    battle.setFinalePhase('boss');
    battle.complete(true);
    expect(() => campaign.completeMission(battle.snapshot())).toThrow('Both Last Light');
    expect(campaign.snapshot().credits).toBe(500);

    battle.start(config);
    battle.setFinalePhase('boss');
    battle.registerKill(14_000, 30);
    expect(battle.advanceFinaleBoss()).toBe(true);
    battle.registerKill(22_000, 0);
    battle.complete(true);
    expect(campaign.completeMission(battle.snapshot()).pendingStoryChapter).toBe('homeward');
    expect(campaign.snapshot().credits).toBe(530);
    expect(() => campaign.completeMission(battle.snapshot())).toThrow('not awaiting a result');
    expect(campaign.snapshot().credits).toBe(530);
    const afterStory = campaign.completeStoryChapter();
    expect(afterStory.phase).toBe('victory');
    expect(afterStory.seenStoryChapters).toContain('homeward');
    expect(new CampaignModel(campaign.exportSave()).snapshot().phase).toBe('victory');
  });

  it('keeps the first boss defeated and its earnings intact through death and refresh at waypoint two', () => {
    const campaign = lateCampaign('lastLight');
    const battle = new GameModel();
    battle.start(campaign.beginMission());
    battle.tick(35_000);
    battle.setFinalePhase('boss');
    expect(campaign.saveWaypoint(waypointFor(battle, 1))).toBe(true);
    battle.registerKill(14_000, 30);
    battle.tick(48_000);
    battle.advanceFinaleBoss();
    expect(campaign.saveWaypoint(waypointFor(battle, 2))).toBe(true);
    expect(campaign.saveWaypoint(waypointFor(battle, 1))).toBe(false);
    campaign.failMission();
    const refreshed = new CampaignModel(JSON.parse(JSON.stringify(campaign.exportSave())) as CampaignSnapshot);
    const retry = new GameModel();
    retry.start(refreshed.beginMission());
    expect(retry.finaleBossStage).toBe('nullArchitect');
    expect(retry.bossHealthRatio).toBe(1);
    expect(retry.advanceFinaleBoss()).toBe(false);
    expect(retry.creditsEarned).toBe(30);
    expect(retry.kills).toBe(1);
    expect(retry.stageElapsedMs).toBe(83_000);
    retry.registerKill(22_000, 0);
    retry.complete(true);
    expect(refreshed.completeMission(retry.snapshot()).credits).toBe(530);
    expect(refreshed.snapshot().activeWaypoint).toBeUndefined();
  });

  it('preserves completed legacy campaigns and ongoing version-four/five progress during migration', () => {
    for (const version of [4, 5] as const) {
      const original = { ...fundedCampaign(), version, currentMissionId: 'dreadnought' as const, phase: 'victory' as const, seenStoryChapters: ['last-vector' as const] };
      const migrated = new CampaignModel(original).snapshot();
      expect(migrated.version).toBe(8);
      expect(migrated.phase).toBe('victory');
      expect(migrated.credits).toBe(original.credits);
      expect(migrated.weapons).toEqual(original.weapons);
      expect(migrated.seenStoryChapters).toEqual(original.seenStoryChapters);
      expect(new CampaignModel({ ...original, phase: 'hangar' }).currentMission().id).toBe('dreadnought');
    }
  });

  it('retains both regular checkpoints in every route mission through version-four and version-five refresh migration', () => {
    for (const missionId of ['coastal', 'minefield', 'fortress', 'stormbreak', 'graveyard', 'carrierSiege'] as const) {
      for (const version of [4, 5] as const) {
        let campaign = lateCampaign(missionId);
        const battle = new GameModel();
        battle.start(campaign.beginMission());
        for (const id of [1, 2] as const) {
          battle.tick(battle.stageDurationMs * 0.33);
          battle.registerKill(100, 5);
          expect(campaign.saveWaypoint(waypointFor(battle, id))).toBe(true);
          const exported = campaign.exportSave();
          campaign = new CampaignModel({ ...JSON.parse(JSON.stringify(exported)) as CampaignSnapshot, version });
          expect(campaign.snapshot().version).toBe(8);
          expect(campaign.snapshot().phase).toBe('mission');
          const retry = new GameModel();
          retry.start(campaign.beginMission());
          expect(retry.mission.id).toBe(missionId);
          expect(retry.latestWaypointId).toBe(id);
          expect(retry.kills).toBe(id);
          expect(retry.creditsEarned).toBe(id * 5);
          expect(retry.weapons.spread).toBe(7);
          expect(campaign.snapshot().credits).toBe(500);
        }
      }
    }
  });

  it('preserves the legacy Dreadnought phase-two health checkpoint independently of Last Light', () => {
    const campaign = lateCampaign('dreadnought');
    const battle = new GameModel();
    battle.start(campaign.beginMission());
    battle.tick(30_000);
    battle.setFinalePhase('boss');
    expect(campaign.saveWaypoint(waypointFor(battle, 1))).toBe(true);
    battle.tick(47_000);
    const second = waypointFor(battle, 2);
    second.bossHealthRatio = 0.63;
    second.encounter.bossSpawned = true;
    expect(campaign.saveWaypoint(second)).toBe(true);
    const refreshed = new CampaignModel({ ...campaign.exportSave(), version: 5 });
    const retry = new GameModel();
    retry.start(refreshed.beginMission());
    expect(retry.latestWaypointId).toBe(2);
    expect(retry.finalePhase).toBe('boss');
    expect(retry.finaleBossStage).toBeUndefined();
    expect(retry.bossHealthRatio).toBe(0.63);
    expect(retry.stageElapsedMs).toBe(77_000);
  });

  it('does not reopen completed saves or advance from a stale unrelated story or route field', () => {
    const completed = new CampaignModel({ ...fundedCampaign(), version: 5, currentMissionId: 'dreadnought', phase: 'victory', pendingStoryChapter: 'last-vector' });
    expect(completed.snapshot().phase).toBe('victory');
    expect(completed.snapshot().pendingStoryChapter).toBeUndefined();
    expect(() => completed.completeStoryChapter()).toThrow('No story chapter');

    const wrongChapter = new CampaignModel({ ...fundedCampaign(), version: 6, currentMissionId: 'lastLight', phase: 'story', pendingStoryChapter: 'first-signal' });
    expect(wrongChapter.snapshot().phase).toBe('hangar');
    expect(wrongChapter.snapshot().pendingStoryChapter).toBeUndefined();
    const wrongRoute = new CampaignModel({ ...fundedCampaign(), version: 6, currentMissionId: 'coastal', phase: 'route' });
    expect(wrongRoute.selectRoute('storm')).toBe(false);
    expect(wrongRoute.currentMission().id).toBe('coastal');
  });

  it('drops malformed or foreign checkpoints and clears a valid checkpoint on abandonment', () => {
    const campaign = lateCampaign('lastLight');
    const battle = new GameModel();
    battle.start(campaign.beginMission());
    battle.tick(35_000);
    battle.setFinalePhase('boss');
    const valid = waypointFor(battle, 1);
    const malformed = { ...valid, encounter: { ...valid.encounter, armamentOfferHistory: undefined } } as unknown as MissionWaypointSnapshot;
    expect(campaign.saveWaypoint(malformed)).toBe(false);
    expect(campaign.saveWaypoint({ ...valid, missionId: 'dreadnought' })).toBe(false);
    expect(campaign.saveWaypoint(valid)).toBe(true);
    const saved = campaign.exportSave();
    saved.activeWaypoint = malformed;
    const recovered = new CampaignModel(saved);
    expect(recovered.snapshot().phase).toBe('hangar');
    expect(recovered.snapshot().activeWaypoint).toBeUndefined();
    campaign.abandonMission();
    expect(campaign.snapshot().phase).toBe('hangar');
    expect(campaign.snapshot().activeWaypoint).toBeUndefined();
    expect(campaign.beginMission().resumeFrom).toBeUndefined();
  });

  it('persists defense consumption after a waypoint without preserving later earnings or refreshing protections', () => {
    const state = { ...fundedCampaign(), version: 6 as const, currentMissionId: 'lastLight' as const, purchased: ['phoenix-protocol', 'emergency-capacitor'] as const };
    const campaign = new CampaignModel({ ...state, purchased: [...state.purchased] });
    const battle = new GameModel();
    battle.start(campaign.beginMission());
    battle.tick(35_000);
    battle.setFinalePhase('boss');
    campaign.saveWaypoint(waypointFor(battle, 1));
    const current = battle.exportCheckpoint();
    current.stageElapsedMs += 10_000;
    current.phoenixAvailable = false;
    current.emergencyCapacitorTriggers = 2;
    current.creditsEarned += 100;
    current.score += 5_000;
    expect(campaign.recordConsumedDefenses(current, 'lastLight')).toBe(true);
    expect(campaign.recordConsumedDefenses(current, 'lastLight')).toBe(false);
    const saved = campaign.exportSave();
    expect(saved.activeWaypoint?.game.creditsEarned).toBe(0);
    expect(saved.activeWaypoint?.game.score).toBe(1_000);
    const restored = new CampaignModel(saved);
    const retry = new GameModel();
    retry.start(restored.beginMission());
    expect(retry.exportCheckpoint().phoenixAvailable).toBe(false);
    expect(retry.exportCheckpoint().emergencyCapacitorTriggers).toBe(2);
    current.phoenixAvailable = true;
    current.emergencyCapacitorTriggers = 0;
    expect(restored.recordConsumedDefenses(current, 'lastLight')).toBe(false);
    expect(restored.exportSave().activeWaypoint?.game.phoenixAvailable).toBe(false);
  });

  it('monotonically records every once-per-mission protection across repeated waypoint retries', () => {
    const campaign = new CampaignModel({
      ...fundedCampaign(), version: 6, currentMissionId: 'lastLight', sortieModule: 'emergency-nanites',
      purchased: ['aegis-bank', 'phoenix-protocol', 'second-wind', 'nanite-lattice', 'fortress-frame', 'emergency-capacitor'],
    });
    const battle = new GameModel();
    battle.start(campaign.beginMission());
    battle.tick(35_000);
    battle.setFinalePhase('boss');
    expect(campaign.saveWaypoint(waypointFor(battle, 1))).toBe(true);
    const spent = battle.exportCheckpoint();
    const defenseFlags = ['phoenixAvailable', 'reserveShieldAvailable', 'secondWindAvailable', 'naniteLatticeAvailable', 'sortieNanitesAvailable', 'fortressRamAvailable'] as const;
    for (const key of defenseFlags) {
      expect(spent[key]).toBe(true);
      spent[key] = false;
    }
    spent.emergencyCapacitorTriggers = 2;
    expect(campaign.recordConsumedDefenses(spent, 'dreadnought')).toBe(false);
    expect(campaign.recordConsumedDefenses({ ...spent, stageElapsedMs: 34_999 }, 'lastLight')).toBe(false);
    expect(campaign.recordConsumedDefenses(spent, 'lastLight')).toBe(true);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      campaign.failMission();
      battle.start(campaign.beginMission());
      for (const key of defenseFlags) expect(battle.exportCheckpoint()[key]).toBe(false);
      expect(battle.exportCheckpoint().emergencyCapacitorTriggers).toBe(2);
    }
    battle.advanceFinaleBoss();
    expect(campaign.saveWaypoint(waypointFor(battle, 2))).toBe(true);
    for (const key of defenseFlags) expect(campaign.exportSave().activeWaypoint?.game[key]).toBe(false);
  });

  it('starts a genuine fresh attempt before the first waypoint without carrying failed earnings', () => {
    const campaign = new CampaignModel({ ...fundedCampaign(), purchased: ['phoenix-protocol'] });
    const battle = new GameModel();
    battle.start(campaign.beginMission());
    battle.registerKill(100, 15);
    const spent = { ...battle.exportCheckpoint(), phoenixAvailable: false };
    expect(campaign.recordConsumedDefenses(spent, battle.mission.id)).toBe(false);
    campaign.failMission();
    battle.start(campaign.beginMission());
    expect(battle.exportCheckpoint().phoenixAvailable).toBe(true);
    expect(battle.creditsEarned).toBe(0);
    expect(campaign.snapshot().credits).toBe(500);
  });
});
