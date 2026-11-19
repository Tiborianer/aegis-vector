import { describe, expect, it } from 'vitest';
import { AdaptiveDifficulty, adaptiveFireProfile, adaptiveHealth } from './adaptiveDifficulty';
import { CampaignModel } from './CampaignModel';
import { GameModel } from './GameModel';

function flight(wave: number, engagedMs: number, director: AdaptiveDifficulty, loadoutPower = .02) {
  const target = director.target('bomber', wave, 26, 3)!;
  director.observe(target, 8_000, loadoutPower); // on screen before anyone engages
  target.remainingAfterContact = 25;
  director.observe(target, 10_000, 0); // trigger released, charging or rescuing
  director.observe(target, engagedMs, loadoutPower);
  director.finish(target);
  return target;
}

describe('adaptive wave health', () => {
  it('counts distinct engaged waves in batches of three, retains pending observations at a waypoint and bounds the result', () => {
    let director = new AdaptiveDifficulty();
    for (let wave = 1; wave <= 2; wave++) {
      expect(flight(wave, 1000, director).engagedMs).toBe(1000);
      flight(wave, 500, director);
      expect(director.percent).toBe(0);
    }
    director = new AdaptiveDifficulty(JSON.parse(JSON.stringify(director.checkpoint())));
    flight(3, 1000, director);
    expect(director.percent).toBe(4);
    for (let wave = 4; wave <= 9; wave++) flight(wave, 1000, director);
    expect(director.percent).toBe(8);
    for (let wave = 10; wave <= 30; wave++) flight(wave, 4000, director);
    expect(director.percent).toBe(-8);
  });

  it('normalizes faster time-to-kill for upgraded guns or a second pilot firing in the same lane', () => {
    const solo = new AdaptiveDifficulty(), pair = new AdaptiveDifficulty();
    for (let wave = 0; wave < 3; wave++) {
      flight(wave, 1800, solo);
      flight(wave, 900, pair, .04);
    }
    expect(solo.percent).toBe(0);
    expect(pair.checkpoint()).toEqual(solo.checkpoint());
    const battle = new GameModel();
    const base = new CampaignModel();
    battle.start(base.beginMission());
    const profile = adaptiveFireProfile(battle);
    battle.upgrade('laser');
    expect(adaptiveFireProfile(battle).singleHit).toBeGreaterThan(profile.singleHit);
    expect(adaptiveFireProfile(battle).damagePerMs).toBeGreaterThan(profile.damagePerMs);
  });

  it('preserves authored bosses, light and one-shot enemies and verifies integer hit counts after rounding', () => {
    const director = new AdaptiveDifficulty();
    for (const kind of ['scout', 'razorwing', 'warden', 'nullArchitect', 'boss'] as const) {
      expect(adaptiveHealth(kind, 25, 5, 8)).toBe(25);
      expect(director.target(kind, 1, 25, 5)).toBeUndefined();
    }
    expect(adaptiveHealth('bomber', 8, 8, 8)).toBe(8);
    expect(director.target('bomber', 1, 8, 8)).toBeUndefined();
    expect(adaptiveHealth('bomber', 14, 13, -8)).toBe(14);
    for (const [percent, expectedHP, hits] of [[-8, 23, 5], [-4, 24, 5], [0, 25, 5], [4, 26, 6], [8, 27, 6]]) {
      const health = adaptiveHealth('mineLayer', 25, 5, percent);
      expect(health).toBe(expectedHP);
      expect(Math.ceil(health / 5)).toBe(hits);
    }
    expect(adaptiveHealth('bomber', 12, 3, 8)).toBe(12);
    expect(new AdaptiveDifficulty({percent: 60, observations: [-1]}).checkpoint()).toEqual({percent: 0, observations: []});
  });
});
