import { describe, expect, it } from 'vitest';
import { MISSIONS } from '../content/missions';
import { buildCombatModifiers } from '../content/upgrades';
import { applyRouteReward } from '../content/routeRewards';
import { ACTIVE_TRACTOR_RADIUS, KINETIC_SHIELD_HIT_GRACE_MS, SHIELD_HIT_GRACE_MS } from '../content/balance';
import { GameModel } from './GameModel';
import type { MissionStartConfig, MissionWaypointSnapshot, UpgradeNodeId } from './types';

const startConfig = (purchased: UpgradeNodeId[] = []): MissionStartConfig => ({
  difficulty: 'pilot',
  mission: MISSIONS[0],
  score: 0,
  weapons: { spread: 1, missile: 0, laser: 0, drone: 0, ion: 0 },
  shieldBaseMax: 1,
  modifiers: buildCombatModifiers(purchased),
  campaignSeed: 42,
});

const serializedCoastalWaypoint = (model: GameModel): MissionWaypointSnapshot => JSON.parse(JSON.stringify({
  missionId: 'coastal',
  waypointId: 1,
  capturedAtMs: model.stageElapsedMs,
  game: model.exportCheckpoint(),
  encounter: {
    waveIndex: 7, nextCarrierIndex: 1, killsSinceUtilityDrop: 2, armamentOfferHistory: [],
    minibossSpawned: false, commandSpawned: false, commandRemaining: 0,
    bulwarkIntroduced: false, finaleApproachWave: 0, bossSpawned: false, lastThreatLevel: 2,
  },
}));

describe('GameModel', () => {
  it('keeps the earned ARC resonator specific to ARC and stacks with purchased damage', () => {
    const config = startConfig(['amplified-munitions']);
    const model = new GameModel();
    model.start({ ...config, modifiers: applyRouteReward(config.modifiers, 'arc-resonator') });
    expect(model.damageMultiplier).toBeCloseTo(1.12);
    expect(model.arcDamageMultiplier).toBeCloseTo(1.12 * 1.12);
    expect(model.shieldMax).toBe(1);
  });

  it('keeps Bastion capacity separate from collectible cells through upgrades and refresh', () => {
    const config = startConfig();
    config.modifiers = applyRouteReward(config.modifiers, 'aegis-bastion');
    const model = new GameModel();
    model.start(config);
    expect([model.shieldBaseMax, model.shieldMax]).toEqual([1, 2]);
    expect(model.upgrade('shield')).toEqual({ upgraded: true, level: 3 });
    expect(model.upgrade('shield')).toEqual({ upgraded: true, level: 4 });
    expect(model.upgrade('shield')).toEqual({ upgraded: false, level: 4 });
    model.tick(65_000);
    const waypoint = serializedCoastalWaypoint(model);
    expect(waypoint.game.shieldCapacityBonus).toBe(1);
    for (let retry = 0; retry < 4; retry++) {
      model.start({ ...config, resumeFrom: waypoint });
      expect([model.shieldBaseMax, model.shieldMax, model.shield]).toEqual([3, 4, 4]);
      expect(model.latestWaypointId).toBe(1);
      expect(model.takeDamage()).toBe('shield');
      expect(model.shield).toBe(3);
    }
    // Checkpoint numbers cannot manufacture a campaign reward.
    model.start({ ...startConfig(), resumeFrom: waypoint });
    expect(model.shieldMax).toBe(3);
  });
  it('can be destroyed on every difficulty after finite shield and hull protection', () => {
    for (const difficulty of ['cadet', 'pilot', 'ace'] as const) {
      const model = new GameModel();
      model.start({ ...startConfig(), difficulty });
      expect(model.takeDamage()).toBe('shield');
      model.tick(1_000);
      expect(model.takeDamage()).toBe('hull');
      model.tick(1_300);
      expect(model.takeDamage()).toBe('hull');
      model.tick(1_300);
      expect(model.takeDamage()).toBe('destroyed');
      expect(model.hull).toBe(0);
      expect(model.mode).toBe('gameover');
    }
  });

  it('routes damage through the shield before the hull', () => {
    const model = new GameModel();
    model.start(startConfig());
    expect(model.takeDamage()).toBe('shield');
    expect(model.shield).toBe(0);
    expect(model.hull).toBe(3);
    model.tick(1_000);
    expect(model.takeDamage()).toBe('hull');
    expect(model.hull).toBe(2);
  });

  it('recharges one missing shield cell after the configured delay', () => {
    const model = new GameModel();
    model.start(startConfig(['quick-charge-loop']));
    model.upgrade('shield');
    model.takeDamage();
    expect(model.tick(5_499)).toBe(false);
    expect(model.tick(1)).toBe('shield');
    expect(model.shield).toBe(model.shieldMax);
  });

  it('takes only one shield cell from overlapping projectile, ram, and hazard events', () => {
    for (const firstSource of ['projectile', 'ram', 'hazard'] as const) {
      const model = new GameModel();
      model.start({ ...startConfig(), shieldBaseMax: 2 });
      expect(model.takeDamage(firstSource)).toBe('shield');
      for (const source of ['projectile', 'ram', 'hazard', 'projectile'] as const) expect(model.takeDamage(source)).toBe('ignored');
      expect(model.shield).toBe(1);
      expect(model.hull).toBe(3);
      expect(model.damageTaken).toBe(1);
      model.tick(SHIELD_HIT_GRACE_MS - 1);
      expect(model.takeDamage()).toBe('ignored');
      model.tick(1);
      expect(model.takeDamage()).toBe('shield');
      expect(model.shield).toBe(0);
      expect(model.hull).toBe(3);
    }
  });

  it('recharges an empty three-cell bank one cell at a time without Harmonics', () => {
    const model = new GameModel();
    model.start({ ...startConfig(), shieldBaseMax: 3 });
    for (let hit = 0; hit < 3; hit += 1) {
      if (hit > 0) model.tick(SHIELD_HIT_GRACE_MS);
      expect(model.takeDamage()).toBe('shield');
    }
    expect(model.shield).toBe(0);
    for (let cell = 1; cell <= 3; cell += 1) {
      expect(model.tick(6_999)).toBe(false);
      expect(model.tick(1)).toBe('shield');
      expect(model.shield).toBe(cell);
      expect(model.snapshot().shieldRechargeRemainingMs).toBe(cell < 3 ? 7_000 : 0);
    }
    expect(model.tick(7_000)).toBe(false);
  });

  it('does not refill multiple shield cells after a delayed frame or recharge while paused', () => {
    const model = new GameModel();
    model.start({ ...startConfig(), shieldBaseMax: 3 });
    model.takeDamage();
    model.tick(SHIELD_HIT_GRACE_MS);
    model.takeDamage();
    model.setPaused(true);
    expect(model.tick(30_000)).toBe(false);
    expect(model.shield).toBe(1);
    model.setPaused(false);
    expect(model.tick(30_000)).toBe('shield');
    expect(model.shield).toBe(2);
    expect(model.snapshot().shieldRechargeRemainingMs).toBe(7_000);
  });

  it('restarts the recharge delay on a real hit but not an ignored collision', () => {
    const model = new GameModel();
    model.start({ ...startConfig(), shieldBaseMax: 3 });
    model.takeDamage();
    model.tick(400);
    model.takeDamage('hazard');
    expect(model.snapshot().shieldRechargeRemainingMs).toBe(6_600);
    model.tick(4_600);
    model.takeDamage();
    expect(model.snapshot().shieldRechargeRemainingMs).toBe(7_000);
    expect(model.tick(6_999)).toBe(false);
    expect(model.tick(1)).toBe('shield');
    expect(model.shield).toBe(2);
  });

  it('keeps one-cell damage and sequential recharge after a saved waypoint is loaded', () => {
    const config = { ...startConfig(), shieldBaseMax: 3 };
    const beforeRefresh = new GameModel();
    beforeRefresh.start(config);
    beforeRefresh.tick(65_000);
    beforeRefresh.takeDamage();
    beforeRefresh.tick(SHIELD_HIT_GRACE_MS);
    beforeRefresh.takeDamage();
    const saved = serializedCoastalWaypoint(beforeRefresh);
    const unchangedSave = JSON.stringify(saved);
    expect(saved.game.shield).toBe(1);

    const resumed = new GameModel();
    resumed.start({ ...config, resumeFrom: saved });
    expect(resumed.latestWaypointId).toBe(1);
    expect(resumed.shield).toBe(3); // Waypoint service, not a recharge tick.
    expect(resumed.takeDamage('projectile')).toBe('shield');
    expect(resumed.takeDamage('ram')).toBe('ignored');
    expect(resumed.takeDamage('hazard')).toBe('ignored');
    expect(resumed.shield).toBe(2);
    resumed.tick(SHIELD_HIT_GRACE_MS);
    expect(resumed.takeDamage('hazard')).toBe('shield');
    expect(resumed.shield).toBe(1);
    for (const cells of [2, 3]) {
      expect(resumed.tick(6_999)).toBe(false);
      expect(resumed.tick(1)).toBe('shield');
      expect(resumed.shield).toBe(cells);
    }
    expect(resumed.damageTaken).toBe(saved.game.damageTaken + 2);
    expect(JSON.stringify(saved)).toBe(unchangedSave);
  });

  it('caps permanent battlefield upgrades and converts extras into score', () => {
    const model = new GameModel();
    model.start(startConfig());
    for (let level = 2; level <= 7; level += 1) {
      expect(model.upgrade('spread')).toEqual({ upgraded: true, level });
    }
    const extra = model.upgrade('spread');
    expect(model.weapons.spread).toBe(7);
    expect(extra.upgraded).toBe(false);
    expect(model.score).toBe(750);
    for (let level = 1; level <= 5; level += 1) expect(model.upgrade('missile').upgraded).toBe(true);
    expect(model.upgrade('missile').upgraded).toBe(false);
    expect(model.weapons.missile).toBe(5);
  });

  it('uses the Aegis reserve when the last active shield pip is lost', () => {
    const model = new GameModel();
    model.start(startConfig(['aegis-bank']));
    expect(model.takeDamage()).toBe('reserve');
    expect(model.shield).toBe(1);
    expect(model.snapshot().reserveShieldAvailable).toBe(false);
  });

  it('activates and expires the Chrono Relay field with an EMP', () => {
    const model = new GameModel();
    model.start(startConfig(['chrono-relay']));
    expect(model.activateEmp()).toBe(true);
    expect(model.chronoScale).toBe(0.55);
    model.tick(5_000);
    expect(model.chronoScale).toBe(1);
  });

  it('restores shield at one hull through Second Wind', () => {
    const model = new GameModel();
    model.start(startConfig(['second-wind']));
    model.takeDamage();
    model.tick(1_300);
    model.takeDamage();
    model.tick(1_300);
    expect(model.takeDamage()).toBe('secondWind');
    expect(model.hull).toBe(1);
    expect(model.shield).toBe(model.shieldMax);
  });

  it('restores EMP and Tractor on an Emergency Capacitor hull hit', () => {
    const model = new GameModel();
    model.start(startConfig(['emergency-capacitor']));
    model.takeDamage();
    model.tick(1_300);
    expect(model.takeDamage()).toBe('hull');
    expect(model.empCharges).toBe(2);
    expect(model.tractorRadius).toBe(ACTIVE_TRACTOR_RADIUS);
  });

  it('builds a capped kill multiplier and applies credit upgrades', () => {
    const model = new GameModel(250);
    model.start(startConfig(['salvage-protocol', 'combat-computer']));
    for (let kill = 0; kill < 25; kill += 1) model.registerKill(100, 5);
    expect(model.multiplier).toBe(6);
    expect(model.creditsEarned).toBe(150);
    expect(model.highScore).toBe(model.score);
  });

  it('triggers the overdrive reactor on the tenth chained kill', () => {
    const model = new GameModel();
    model.start(startConfig(['rapid-cycling', 'overdrive-reactor']));
    for (let kill = 0; kill < 9; kill += 1) expect(model.registerKill(100, 1).overdriveTriggered).toBe(false);
    expect(model.registerKill(100, 1).overdriveTriggered).toBe(true);
    expect(model.fireIntervalMultiplier).toBeCloseTo(0.675);
  });

  it('exposes cell, reactor, and stacked Overdrive states independently', () => {
    const model = new GameModel();
    model.start(startConfig(['overdrive-reactor']));
    expect(model.snapshot().weaponOverdriveState).toBe('inactive');
    model.collectUtility('overdrive');
    expect(model.snapshot().weaponOverdriveState).toBe('cell');
    for (let kill = 0; kill < 10; kill += 1) model.registerKill(0, 0);
    expect(model.snapshot().weaponOverdriveState).toBe('stacked');
    expect(model.snapshot().reactorOverdriveRemainingMs).toBe(6_000);
    model.tick(6_001);
    expect(model.snapshot().weaponOverdriveState).toBe('cell');
  });

  it('provides one Phoenix save per mission', () => {
    const model = new GameModel();
    model.start(startConfig(['reinforced-frame', 'reactive-armor', 'phoenix-protocol']));
    model.takeDamage();
    for (let hit = 0; hit < 4; hit += 1) {
      model.tick(2_100);
      const result = model.takeDamage();
      if (hit === 3) expect(result).toBe('phoenix');
    }
    expect(model.hull).toBe(1);
    model.tick(2_100);
    expect(model.takeDamage()).toBe('destroyed');
  });

  it('applies utility pickups, caps EMP charges, and expires temporary effects', () => {
    const model = new GameModel();
    model.start(startConfig(['flux-capacitor']));
    model.collectUtility('overdrive');
    model.collectUtility('tractor');
    model.collectUtility('emp');
    model.collectUtility('emp');
    expect(model.empCharges).toBe(model.empMax);
    expect(model.snapshot().overdriveRemainingMs).toBe(15_000);
    expect(model.tractorRadius).toBe(ACTIVE_TRACTOR_RADIUS);
    model.tick(18_001);
    expect(model.tractorRadius).toBe(0);
    expect(model.snapshot().overdriveRemainingMs).toBe(0);
  });

  it('makes Tractor a wide salvage field with a temporary twenty-five-percent kill-credit bonus', () => {
    const model = new GameModel();
    model.start(startConfig(['tractor-array']));
    expect(model.tractorRadius).toBe(180);
    model.collectUtility('tractor');
    expect(model.tractorRadius).toBe(360);
    for (let kill = 0; kill < 4; kill += 1) model.registerKill(100, 1);
    expect(model.creditsEarned).toBe(5);
    model.tick(12_000);
    expect(model.tractorRadius).toBe(180);
    for (let kill = 0; kill < 4; kill += 1) model.registerKill(100, 1);
    expect(model.creditsEarned).toBe(9);
  });

  it('combines Tractor salvage fractions with permanent bonuses and clears the temporary bonus on retry', () => {
    const model = new GameModel();
    model.start(startConfig(['salvage-protocol']));
    model.collectUtility('tractor');
    model.registerKill(100, 1);
    expect(model.creditsEarned).toBe(1);
    expect(model.exportCheckpoint().creditRemainder).toBeCloseTo(0.5);
    model.restoreCheckpoint(model.exportCheckpoint(), 1);
    expect(model.tractorRadius).toBe(0);
    model.registerKill(100, 1);
    expect(model.creditsEarned).toBe(2);
    expect(model.exportCheckpoint().creditRemainder).toBeCloseTo(0.7);
  });

  it('fabricates needed support first and only every third full-capacity cycle produces Overdrive', () => {
    const model = new GameModel();
    model.start(startConfig(['field-fabricator']));
    let generated: string | undefined;
    for (let kill = 0; kill < 30; kill += 1) generated = model.registerKill(0, 0).fabricatedPickup;
    expect(generated).toBe('emp');
    model.collectUtility('emp');
    for (let kill = 0; kill < 30; kill += 1) generated = model.registerKill(0, 0).fabricatedPickup;
    expect(generated).toBe('tractor');
    for (let kill = 0; kill < 30; kill += 1) generated = model.registerKill(0, 0).fabricatedPickup;
    expect(generated).toBe('overdrive');
    model.hull = 1;
    for (let kill = 0; kill < 30; kill += 1) generated = model.registerKill(0, 0).fabricatedPickup;
    expect(generated).toBe('repair');
  });

  it('applies sortie modules and restores them through a retry-compatible start config', () => {
    const model = new GameModel();
    model.start({ ...startConfig(), sortieModule: 'reserve-emp' });
    expect(model.empCharges).toBe(2);
    model.activateEmp();
    model.start({ ...startConfig(), sortieModule: 'reserve-emp' });
    expect(model.empCharges).toBe(2);
  });

  it('recharges shield pips separately with Aegis Harmonics', () => {
    const model = new GameModel();
    model.start(startConfig(['aegis-bank', 'quick-charge-loop', 'repulsor-shield', 'kinetic-reversal', 'aegis-harmonics']));
    model.upgrade('shield');
    model.upgrade('shield');
    model.takeDamage();
    model.tick(KINETIC_SHIELD_HIT_GRACE_MS);
    model.takeDamage();
    expect(model.shield).toBe(1);
    expect(model.tick(3_499)).toBe(false);
    expect(model.tick(1)).toBe('shield');
    expect(model.shield).toBe(2);
  });

  it('keeps salvage fractions across kills and waypoint restoration', () => {
    const model = new GameModel();
    model.start(startConfig(['salvage-protocol']));
    for (let kill = 0; kill < 4; kill += 1) model.registerKill(100, 1);
    expect(model.creditsEarned).toBe(4);
    const checkpoint = model.exportCheckpoint();
    expect(checkpoint.creditRemainder).toBeCloseTo(0.8);
    const restored = new GameModel();
    restored.start(startConfig(['salvage-protocol']));
    restored.restoreCheckpoint(checkpoint, 1);
    restored.registerKill(100, 1);
    expect(restored.creditsEarned).toBe(6);
  });

  it('cannot farm Tractor credits or renew its bonus by repeatedly retrying a saved waypoint', () => {
    const config = startConfig(['salvage-protocol']);
    const model = new GameModel();
    model.start(config);
    model.tick(65_000);
    model.collectUtility('tractor');
    model.registerKill(100, 1);
    const saved = serializedCoastalWaypoint(model);
    const unchangedSave = JSON.stringify(saved);
    expect(saved.game.creditsEarned).toBe(1);
    expect(saved.game.creditRemainder).toBeCloseTo(.5);

    for (let retry = 0; retry < 4; retry += 1) {
      model.start({ ...config, resumeFrom: saved });
      expect(model.snapshot().tractorRemainingMs).toBe(0);
      expect(model.creditsEarned).toBe(saved.game.creditsEarned);
      expect(model.kills).toBe(saved.game.kills);
      model.registerKill(100, 1);
      expect(model.creditsEarned).toBe(2);
      expect(model.exportCheckpoint().creditRemainder).toBeCloseTo(.7);
      for (let pickup = 0; pickup < 3; pickup += 1) {
        expect(model.collectUtility('tractor')).toEqual({ applied: true, scoreAwarded: 0, creditsAwarded: 0 });
      }
      expect(model.creditsEarned).toBe(2);
    }
    expect(JSON.stringify(saved)).toBe(unchangedSave);
  });

  it('restores older checkpoints without salvage fractions and enforces weapon-specific caps', () => {
    const model = new GameModel();
    model.start({ ...startConfig(), weapons: { spread: 7, missile: 7, laser: 6, drone: 7, ion: 6 } });
    expect(model.weapons).toEqual({ spread: 7, missile: 5, laser: 5, drone: 5, ion: 5 });
    const checkpoint = model.exportCheckpoint();
    delete checkpoint.creditRemainder;
    checkpoint.weapons.spread = 0;
    checkpoint.weapons.drone = 7;
    model.restoreCheckpoint(checkpoint, 1);
    expect(model.weapons.spread).toBe(1);
    expect(model.weapons.drone).toBe(5);
    expect(model.exportCheckpoint().creditRemainder).toBe(0);
  });

  it('awards exactly one excess-utility reward and reports the same score', () => {
    const model = new GameModel();
    model.start(startConfig(['flux-capacitor', 'salvage-router']));
    const repair = model.collectUtility('repair');
    expect(repair).toEqual({ applied: false, scoreAwarded: 500, creditsAwarded: 2 });
    expect(model.score).toBe(500);
    model.collectUtility('emp');
    const excessEmp = model.collectUtility('emp');
    expect(excessEmp).toEqual(repair);
    expect(model.score).toBe(1_000);
    expect(model.creditsEarned).toBe(4);
  });

  it('applies late defense refinement without unlimited protection', () => {
    const model = new GameModel();
    model.start(startConfig(['reinforced-frame', 'reactive-armor', 'fortress-frame', 'ablative-frame']));
    expect(model.hullMax).toBe(6);
    model.takeDamage();
    model.tick(1_000);
    expect(model.takeDamage()).toBe('hull');
    model.tick(2_249);
    expect(model.takeDamage()).toBe('ignored');
    model.tick(1);
    expect(model.takeDamage()).toBe('hull');
  });

  it('stacks Rapid Recovery with Harmonics and earlier EMP refinements', () => {
    const model = new GameModel();
    model.start(startConfig(['rapid-recovery', 'aegis-harmonics', 'emp-overcharger', 'capacitor-reservoir']));
    expect(model.empMax).toBe(4);
    expect(model.empDamageMultiplier).toBeCloseTo(1.875);
    model.takeDamage();
    expect(model.tick(2_499)).toBe(false);
    expect(model.tick(1)).toBe('shield');
  });

  it('uses four-second cell recovery without Harmonics', () => {
    const model = new GameModel();
    model.start(startConfig(['rapid-recovery']));
    model.takeDamage();
    expect(model.tick(3_999)).toBe(false);
    expect(model.tick(1)).toBe('shield');
    expect(model.shield).toBe(model.shieldMax);
  });

  it('restores one hull through Nanite Lattice after a safe interval', () => {
    const model = new GameModel();
    model.start(startConfig(['reinforced-frame', 'reactive-armor', 'repulsor-shield', 'kinetic-reversal', 'nanite-lattice']));
    model.takeDamage();
    model.tick(1_300);
    model.takeDamage();
    expect(model.hull).toBe(3);
    expect(model.tick(34_999)).toBe('shield');
    expect(model.tick(1)).toBe('hull');
    expect(model.hull).toBe(4);
  });

  it('ignores the first unshielded ram through Fortress Frame', () => {
    const model = new GameModel();
    model.start(startConfig(['reinforced-frame', 'reactive-armor', 'repulsor-shield', 'kinetic-reversal', 'nanite-lattice', 'fortress-frame']));
    model.takeDamage();
    model.tick(KINETIC_SHIELD_HIT_GRACE_MS);
    expect(model.takeDamage('ram')).toBe('fortress');
    expect(model.hull).toBe(model.hullMax);
  });

  it('tracks the Dreadnought approach, boss, and cleared phases', () => {
    const model = new GameModel();
    model.start({ ...startConfig(), mission: MISSIONS.find(({ id }) => id === 'dreadnought')! });
    expect(model.snapshot().finalePhase).toBe('approach');
    model.setFinalePhase('boss');
    expect(model.snapshot().finalePhase).toBe('boss');
    model.complete(true);
    expect(model.snapshot().finalePhase).toBe('cleared');
  });

  it('advances Last Light exactly once without completing, healing, or deleting earned progress', () => {
    const model = new GameModel();
    model.start({ ...startConfig(), mission: MISSIONS.find(({ id }) => id === 'lastLight')! });
    expect(model.finalePhase).toBe('approach');
    expect(model.finaleBossStage).toBe('seraph');
    expect(model.advanceFinaleBoss()).toBe(false);
    model.setFinalePhase('boss');
    model.setBoss('SERAPH', 0.1);
    model.takeDamage();
    model.registerKill(14_000, 30);
    const before = model.exportCheckpoint();
    expect(model.advanceFinaleBoss()).toBe(true);
    expect(model.mode).toBe('playing');
    expect(model.finalePhase).toBe('boss');
    expect(model.finaleBossStage).toBe('nullArchitect');
    expect(model.bossActive).toBe(false);
    expect(model.bossHealthRatio).toBe(1);
    expect(model.shield).toBe(before.shield);
    expect(model.creditsEarned).toBe(30);
    expect(model.score).toBe(before.score);
    expect(model.advanceFinaleBoss()).toBe(false);
    model.complete(true);
    expect(model.mode).toBe('victory');
    expect(model.finalePhase).toBe('cleared');
  });

  it('preserves spent protections, late boss time, and sequence stage when servicing a Last Light retry', () => {
    const model = new GameModel();
    const config = { ...startConfig(['phoenix-protocol', 'aegis-bank', 'second-wind', 'nanite-lattice', 'fortress-frame', 'emergency-capacitor']), mission: MISSIONS.find(({ id }) => id === 'lastLight')! };
    model.start(config);
    model.tick(250_000);
    model.setFinalePhase('boss');
    model.advanceFinaleBoss();
    const checkpoint = model.exportCheckpoint();
    Object.assign(checkpoint, { hull: 1, shield: 0, empCharges: 0, phoenixAvailable: false, reserveShieldAvailable: false, secondWindAvailable: false, naniteLatticeAvailable: false, fortressRamAvailable: false, sortieNanitesAvailable: false, emergencyCapacitorTriggers: 2 });
    model.collectUtility('overdrive');
    model.collectUtility('tractor');
    model.restoreCheckpoint(checkpoint, 2);
    const restored = model.exportCheckpoint();
    expect(model.stageElapsedMs).toBe(250_000);
    expect(model.finaleBossStage).toBe('nullArchitect');
    expect(model.bossHealthRatio).toBe(1);
    expect(model.hull).toBe(2);
    expect(model.shield).toBe(model.shieldMax);
    expect(model.empCharges).toBe(1);
    expect(model.snapshot().weaponOverdriveState).toBe('inactive');
    expect(model.snapshot().tractorRemainingMs).toBe(0);
    for (const key of ['phoenixAvailable', 'reserveShieldAvailable', 'secondWindAvailable', 'naniteLatticeAvailable', 'fortressRamAvailable', 'sortieNanitesAvailable'] as const) expect(restored[key]).toBe(false);
    expect(restored.emergencyCapacitorTriggers).toBe(2);
  });

  it('restores waypoint progress with partial service and without temporary advantages', () => {
    const model = new GameModel();
    model.start(startConfig(['aegis-bank', 'quick-charge-loop', 'reactive-armor', 'phoenix-protocol']));
    model.tick(65_000);
    model.registerKill(200, 5);
    model.collectUtility('overdrive');
    model.activateEmp();
    model.takeDamage();
    model.tick(2_100);
    model.takeDamage();
    model.tick(2_100);
    model.takeDamage();
    const checkpoint = model.exportCheckpoint();

    const restored = new GameModel();
    restored.start({
      ...startConfig(['aegis-bank', 'quick-charge-loop', 'reactive-armor', 'phoenix-protocol']),
      resumeFrom: {
        missionId: 'coastal',
        waypointId: 1,
        capturedAtMs: checkpoint.stageElapsedMs,
        game: checkpoint,
        encounter: {
          waveIndex: 7,
          nextCarrierIndex: 1,
          killsSinceUtilityDrop: 2,
          armamentOfferHistory: [],
          minibossSpawned: false,
          commandSpawned: false,
          commandRemaining: 0,
          bulwarkIntroduced: false,
          finaleApproachWave: 0,
          bossSpawned: false,
          lastThreatLevel: 2,
        },
      },
    });
    expect(restored.stageElapsedMs).toBe(checkpoint.stageElapsedMs);
    expect(restored.creditsEarned).toBe(5);
    expect(restored.hull).toBeGreaterThanOrEqual(2);
    expect(restored.shield).toBe(restored.shieldMax);
    expect(restored.empCharges).toBeGreaterThanOrEqual(1);
    expect(restored.snapshot().overdriveRemainingMs).toBe(0);
    expect(restored.snapshot().latestWaypointId).toBe(1);
  });
});
