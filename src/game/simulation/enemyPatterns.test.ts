import { describe, expect, it } from 'vitest';
import { bossPhase, buildEnemyVolley } from './enemyPatterns';

describe('readable expansion enemy volleys', () => {
  const origin = { x: 640, y: 155 }, target = { x: 640, y: 600 };
  it('locks repeatable finite shots and provides at least 780ms warning', () => {
    for (const kind of ['skimmer', 'weaver', 'prism', 'leech', 'seraph', 'nullArchitect'] as const) {
      for (const health of [1, .6, .3]) for (let attack = 0; attack < 4; attack++) {
        const plan = buildEnemyVolley(kind, attack, health, origin, target);
        expect(plan).toEqual(buildEnemyVolley(kind, attack, health, origin, target));
        expect(plan.warningMs).toBeGreaterThanOrEqual(780);
        expect(plan.recoveryMs).toBeGreaterThanOrEqual(1350);
        expect(plan.shots.length).toBeLessThanOrEqual(19);
        expect(plan.shots.length).toBeGreaterThan(0);
        plan.shots.forEach((shot) => expect([shot.x, shot.y, shot.angle].every(Number.isFinite)).toBe(true));
      }
    }
  });
  it('gives Aurora specialists distinct locked attack plans and long recovery windows', () => {
    const prism = buildEnemyVolley('prism', 0, 1, origin, target);
    const leechLeft = buildEnemyVolley('leech', 0, 1, origin, target);
    const leechRight = buildEnemyVolley('leech', 1, 1, origin, target);
    expect(prism.shots).toHaveLength(3);
    expect(prism.shots.every((shot) => shot.ion && !shot.heavy)).toBe(true);
    expect(prism.shots[1].angle).toBeCloseTo(Math.PI / 2);
    expect(leechLeft.shots).toHaveLength(4);
    expect(leechLeft.shots.every((shot) => shot.heavy && !shot.ion)).toBe(true);
    expect(leechLeft.shots.every((shot) => shot.angle > Math.PI / 2)).toBe(true);
    expect(leechRight.shots.every((shot) => shot.angle < Math.PI / 2)).toBe(true);
    expect(leechLeft.warningMs).toBeGreaterThan(prism.warningMs);
    expect(leechLeft.recoveryMs).toBeGreaterThan(prism.recoveryMs);
  });
  it('makes the new regular enemies distinct and sparse', () => {
    const skimmer = buildEnemyVolley('skimmer', 0, 1, origin, target);
    expect(skimmer.shots).toHaveLength(2);
    expect(skimmer.shots.every((shot) => shot.ion && !shot.heavy)).toBe(true);
    const weaver = buildEnemyVolley('weaver', 0, 1, origin, target);
    expect(weaver.shots).toHaveLength(4);
    for (const shot of weaver.shots) {
      const impactX = origin.x + shot.x + (target.y - origin.y - shot.y) / Math.tan(shot.angle);
      expect(Math.abs(impactX - target.x)).toBeGreaterThan(140);
    }
  });
  it('preserves an open radial seam and a wide column escape corridor in every phase', () => {
    for (const x of [50, 300, 640, 980, 1230]) for (const health of [1, .6, .3]) {
      const point = { x, y: 600 };
      const safeAngle = Math.atan2(point.y - origin.y, point.x - origin.x);
      const ring = buildEnemyVolley('nullArchitect', 0, health, origin, point);
      ring.shots.forEach((shot) => {
        const offset = Math.abs(Math.atan2(Math.sin(shot.angle - safeAngle), Math.cos(shot.angle - safeAngle)));
        expect(offset).toBeGreaterThanOrEqual(.43);
      });
      const columns = buildEnemyVolley('nullArchitect', 1, health, origin, point);
      const safeX = Math.max(210, Math.min(1070, x));
      columns.shots.forEach((shot) => expect(Math.abs(origin.x + shot.x - safeX)).toBeGreaterThanOrEqual(155));
    }
  });
  it('uses health thresholds for phased attacks without modifying motion state', () => {
    expect([1, .66, .33].map(bossPhase)).toEqual([1, 2, 3]);
    expect(buildEnemyVolley('seraph', 0, 1, origin, target).shots.length)
      .toBeLessThan(buildEnemyVolley('seraph', 0, .3, origin, target).shots.length);
  });
});
