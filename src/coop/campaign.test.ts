import { describe, expect, it } from 'vitest';
import { SquadCampaign } from './campaign';
import { GameModel } from '../game/simulation/GameModel';
import type { CampaignRoute, Difficulty, MissionWaypointSnapshot } from '../game/simulation/types';

function games(squad: SquadCampaign) {
  const config = squad.begin();
  const lead = new GameModel(),
    wing = new GameModel();
  lead.start(config);
  wing.start(config.wingmate!);
  return { lead, wing };
}
function waypoint(model: GameModel): MissionWaypointSnapshot {
  return {
    missionId: model.mission.id,
    waypointId: 1,
    capturedAtMs: model.stageElapsedMs,
    game: model.exportCheckpoint(),
    encounter: {
      waveIndex: 3,
      nextCarrierIndex: 1,
      killsSinceUtilityDrop: 2,
      armamentOfferHistory: [],
      minibossSpawned: false,
      commandSpawned: false,
      commandRemaining: 0,
      bulwarkIntroduced: false,
      finaleApproachWave: 0,
      bossSpawned: false,
      lastThreatLevel: 1,
    },
  };
}
const routes: CampaignRoute[] = ['storm', 'salvage'];
const difficulties: Difficulty[] = ['cadet', 'pilot', 'ace'];
const combinations = difficulties.flatMap((difficulty) =>
  routes.flatMap((early) => routes.map((late) => ({ difficulty, early, late }))),
);
describe('two-pilot base campaign', () => {
  it.each(combinations)(
    'finishes $difficulty with $early then $late after restoring both pilots at every chapter',
    ({ difficulty, early, late }) => {
      let squad = SquadCampaign.fresh(difficulty, ['precision', 'coverage']);
      const missions = [
        'coastal',
        early === 'storm' ? 'aurora' : 'minefield',
        'fortress',
        late === 'storm' ? 'stormbreak' : 'graveyard',
        'carrierSiege',
        'dreadnought',
        'lastLight',
      ];
      let credits = 0;
      for (const mission of missions) {
        const { lead, wing } = games(squad);
        expect(lead.mission.id).toBe(mission);
        expect(wing.mission.id).toBe(mission);
        expect(lead.weapons.laser).toBe(1);
        expect(wing.weapons.drone).toBe(1);
        lead.registerKill(120, 7);
        credits += 7 + squad.pilots[0].currentMission().completionCredits;
        if (mission === 'lastLight') {
          lead.setFinalePhase('boss');
          lead.advanceFinaleBoss();
        }
        lead.complete(mission === 'lastLight');
        squad.finish(lead.snapshot(), wing.snapshot(), [[], []]);
        for (const p of squad.pilots) expect(p.snapshot().credits).toBe(credits);
        expect(() => squad.finish(lead.snapshot(), wing.snapshot(), [[], []])).toThrow();
        squad = SquadCampaign.restore(JSON.parse(JSON.stringify(squad.save())))!;
        const state = squad.story();
        if (state.phase === 'route') {
          const captain = mission === 'fortress' ? 1 : 0;
          const choice = mission === 'fortress' ? late : early;
          expect(squad.chooseRoute(captain === 0 ? 1 : 0, choice)).toBe(false);
          expect(squad.chooseRoute(captain, choice)).toBe(true);
        }
      }
      for (const pilot of squad.pilots)
        expect(pilot.snapshot()).toMatchObject({
          phase: 'victory',
          difficulty,
          earlyRoute: early,
          route: late,
          campaignKills: 7,
        });
    },
  );
  it('persists separate carrier claims, prevents repeat claims and mirrors exactly 80 credits', () => {
    const squad = SquadCampaign.fresh('pilot', ['coverage', 'coverage']);
    const { lead, wing } = games(squad);
    lead.registerKill(100, 80 - squad.pilots[0].currentMission().completionCredits);
    lead.complete();
    squad.finish(lead.snapshot(), wing.snapshot(), [[['laser', 'ion']], [['shield', 'missile']]]);
    squad.story();
    squad.chooseRoute(0, 'storm');
    expect(squad.pilots.map((p) => p.snapshot().credits)).toEqual([80, 80]);
    expect(squad.claim(0, 1)).toBe(true);
    expect(squad.claim(0, 0)).toBe(false);
    const resumed = SquadCampaign.restore(squad.save())!;
    expect(resumed.claim(1, 0)).toBe(true);
    expect(resumed.pilots[0].snapshot().weapons.ion).toBe(1);
    expect(resumed.pilots.map((p) => p.snapshot().shieldBaseMax)).toEqual([1, 2]);
    expect(resumed.pilots[0].purchase('rapid-cycling').ok).toBe(true);
    expect(resumed.pilots[1].snapshot().credits).toBe(80);
  });
  it('commits checkpoints as a pair and retains each pilot’s gear, pending carrier claim and spent protection on retry', () => {
    const squad = SquadCampaign.fresh('pilot', ['precision', 'coverage']);
    const { lead, wing } = games(squad);
    lead.tick(1000);
    wing.tick(1000);
    wing.upgrade('ion');
    const a = waypoint(lead),
      b = waypoint(wing);
    b.game.reserveShieldAvailable = true;
    const invalid = { ...b, capturedAtMs: -1 };
    expect(squad.waypoint(a, invalid, [[], []])).toBe(false);
    expect(squad.pilots.every((p) => !p.snapshot().activeWaypoint)).toBe(true);
    expect(squad.waypoint(a, b, [[['drone', 'laser']], []])).toBe(true);
    expect(squad.waypoint(a, b, [[], []])).toBe(false);
    expect(squad.pilots[1].recordConsumedDefenses({ ...b.game, reserveShieldAvailable: false }, 'coastal')).toBe(
      true,
    );
    squad.fail();
    const retry = SquadCampaign.restore(squad.save())!.begin();
    expect(retry.resumeFrom?.waypointId).toBe(1);
    expect(retry.wingmate?.resumeFrom?.game.weapons.ion).toBe(1);
    expect(retry.wingmate?.resumeFrom?.game.reserveShieldAvailable).toBe(false);
    expect(retry.coopOffers).toEqual([[['drone', 'laser']], []]);
  });
  it('requires distinct saves to describe the same squadron and mission', () => {
    const a = SquadCampaign.fresh('ace', ['coverage', 'precision']).save();
    a.pilots[1].campaignSeed = (a.pilots[0].campaignSeed || 1) + 1;
    expect(SquadCampaign.restore(a)).toBeUndefined();
  });
});
