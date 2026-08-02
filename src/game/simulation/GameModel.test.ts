import { describe, expect, it } from 'vitest';
import { SHIELD_RECHARGE_MS } from '../content/balance';
import { GameModel } from './GameModel';

describe('GameModel', () => {
  it('routes damage through the shield before the hull', () => {
    const model = new GameModel();
    model.start('pilot');

    expect(model.takeDamage()).toBe('shield');
    expect(model.shield).toBe(0);
    expect(model.hull).toBe(3);

    model.tick(500);
    expect(model.takeDamage()).toBe('hull');
    expect(model.hull).toBe(2);
  });

  it('recharges the full shield seven seconds after the last hit', () => {
    const model = new GameModel();
    model.start('pilot');
    model.upgrade('shield');
    model.upgrade('shield');
    expect(model.shieldMax).toBe(3);

    model.takeDamage();
    model.tick(500);
    model.takeDamage();
    expect(model.shield).toBe(1);
    expect(model.tick(SHIELD_RECHARGE_MS - 1)).toBe(false);
    expect(model.shield).toBe(1);
    expect(model.tick(1)).toBe(true);
    expect(model.shield).toBe(3);
  });

  it('caps every upgrade at level three and converts extras into score', () => {
    const model = new GameModel();
    model.start('pilot');

    model.upgrade('spread');
    model.upgrade('spread');
    const extra = model.upgrade('spread');

    expect(model.weapons.spread).toBe(3);
    expect(extra.upgraded).toBe(false);
    expect(model.score).toBe(750);
  });

  it('builds a capped kill multiplier and updates the high score', () => {
    const model = new GameModel(250);
    model.start('pilot');
    for (let kill = 0; kill < 25; kill += 1) model.registerKill(100);

    expect(model.multiplier).toBe(5);
    expect(model.score).toBeGreaterThan(2_500);
    expect(model.highScore).toBe(model.score);
  });

  it('resets an expired kill chain before building the next multiplier', () => {
    const model = new GameModel();
    model.start('pilot');
    for (let kill = 0; kill < 6; kill += 1) model.registerKill(100);
    expect(model.multiplier).toBe(2);

    model.tick(4_000);
    model.registerKill(100);
    expect(model.multiplier).toBe(1);
  });

  it('ignores damage during the post-hit grace period', () => {
    const model = new GameModel();
    model.start('pilot');

    expect(model.takeDamage()).toBe('shield');
    model.tick(200);
    expect(model.takeDamage()).toBe('ignored');
    expect(model.hull).toBe(3);
  });
});
