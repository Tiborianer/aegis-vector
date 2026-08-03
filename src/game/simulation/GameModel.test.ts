import { describe, expect, it } from 'vitest';
import { MISSIONS } from '../content/missions';
import { buildCombatModifiers } from '../content/upgrades';
import { GameModel } from './GameModel';
import type { MissionStartConfig, UpgradeNodeId } from './types';

const startConfig = (purchased: UpgradeNodeId[] = []): MissionStartConfig => ({
  difficulty: 'pilot',
  mission: MISSIONS[0],
  score: 0,
  weapons: { spread: 1, missile: 0, laser: 0, drone: 0, ion: 0 },
  shieldBaseMax: 1,
  modifiers: buildCombatModifiers(purchased),
  campaignSeed: 42,
});

describe('GameModel', () => {
  it('routes damage through the shield before the hull', () => {
    const model = new GameModel();
    model.start(startConfig());
    expect(model.takeDamage()).toBe('shield');
    expect(model.shield).toBe(0);
    expect(model.hull).toBe(3);
    model.tick(500);
    expect(model.takeDamage()).toBe('hull');
    expect(model.hull).toBe(2);
  });

  it('recharges the full shield after the configured delay', () => {
    const model = new GameModel();
    model.start(startConfig(['quick-charge-loop']));
    model.upgrade('shield');
    model.takeDamage();
    expect(model.tick(5_499)).toBe(false);
    expect(model.tick(1)).toBe('shield');
    expect(model.shield).toBe(model.shieldMax);
  });

  it('caps permanent battlefield upgrades and converts extras into score', () => {
    const model = new GameModel();
    model.start(startConfig());
    model.upgrade('spread');
    model.upgrade('spread');
    model.upgrade('spread');
    model.upgrade('spread');
    const extra = model.upgrade('spread');
    expect(model.weapons.spread).toBe(5);
    expect(extra.upgraded).toBe(false);
    expect(model.score).toBe(750);
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
    expect(model.tractorRadius).toBe(220);
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
    expect(model.tractorRadius).toBe(220);
    model.tick(18_001);
    expect(model.tractorRadius).toBe(0);
    expect(model.snapshot().overdriveRemainingMs).toBe(0);
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
    model.tick(800);
    model.takeDamage();
    expect(model.shield).toBe(1);
    expect(model.tick(4_499)).toBe(false);
    expect(model.tick(1)).toBe('shield');
    expect(model.shield).toBe(2);
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
    model.tick(800);
    expect(model.takeDamage('ram')).toBe('fortress');
    expect(model.hull).toBe(model.hullMax);
  });
});
