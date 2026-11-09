import { describe, expect, it } from 'vitest';
import { createFlightMotion } from './flightMotion';
import { activeTurretCount, buildTurretVolley, createModularBoss, damageModularBoss, encounterHealthProgress, modularHealthRatio, seraphWingPose, siegeTurretPose, SIEGE_TURRETS, SIEGE_TURRET_ARC, SIEGE_TURRET_TURN_RATE, stepSiegeFlight, stepSiegeTurretAim } from './modularBoss';
import { getThreatTuning } from '../content/encounters';
import { ENEMIES } from '../content/balance';
import { getMissionById } from '../content/missions';
import crownBake from '../../../public/graphics-v2/modules/crown-turret.json';

describe('Obsidian Crown module contract', () => {
  it('starts with six separate batteries, not a cosmetic shared health bar', () => {
    const state = createModularBoss(1000);
    expect(state.turrets).toHaveLength(6);
    expect(new Set(state.turrets).size).toBe(6);
    expect(state.turrets[0].health).toBe(55);
    expect(modularHealthRatio(state)).toBe(1);
    const hit = damageModularBoss(state, 22, { kind: 'turret', index: 3 });
    expect(hit.state.turrets.map((turret) => turret.health)).toEqual([55, 55, 55, 33, 55, 55]);
    expect(state.turrets[3].health).toBe(55);
    expect(hit.state.hull).toBe(1000);
    expect(modularHealthRatio(hit.state)).toBeLessThan(1);
  });
  it('locks the hull until all six are dead and never spills the last killing shot into it', () => {
    let state = createModularBoss(1000);
    expect(damageModularBoss(state, 99999, { kind: 'hull' }).blocked).toBe(true);
    for (let index = 0; index < 6; index++) {
      const hit = damageModularBoss(state, 99999, { kind: 'turret', index });
      state = hit.state;
      expect(state.hull).toBe(1000);
      expect(hit.destroyed).toEqual([index]);
      expect(hit.unlocked).toBe(index === 5);
    }
    expect(activeTurretCount(state)).toBe(0);
    expect(damageModularBoss(state, 100, { kind: 'hull' }).state.hull).toBe(900);
  });
  it.each(['auto', 'area'] as const)('%s damage cannot bypass armor and area damage has a single total budget', (kind) => {
    const state = createModularBoss(1000);
    const hit = damageModularBoss(state, 42, { kind });
    expect(hit.state.hull).toBe(1000);
    expect(hit.state.turrets.reduce((sum, turret) => sum + turret.health, 0)).toBe(288);
    if (kind === 'area') expect(hit.state.turrets.every((turret) => turret.health === 48)).toBe(true);
  });
  it('does not repeat a destruction event or accept non-finite damage', () => {
    const first = damageModularBoss(createModularBoss(1000), 75, { kind: 'turret', index: 0 });
    expect(damageModularBoss(first.state, 75, { kind: 'turret', index: 0 }).destroyed).toEqual([]);
    for (const damage of [NaN, Infinity, -10]) expect(damageModularBoss(first.state, damage, { kind: 'auto' }).state).toEqual(first.state);
  });
  it('removes destroyed batteries from actual volley origins', () => {
    const fresh = createModularBoss(1000);
    expect(buildTurretVolley(fresh, 0, 520, 420).shots).toHaveLength(12);
    const state = damageModularBoss(fresh, 75, { kind: 'turret', index: 2 }).state;
    const volley = buildTurretVolley(state, 1, 520, 420);
    expect(volley.shots).toHaveLength(10);
    expect(volley.shots.some((shot) => shot.module === 2)).toBe(false);
    expect(volley.shots.every((shot) => Number.isFinite(shot.angle))).toBe(true);
    expect(volley.warningMs).toBeGreaterThanOrEqual(1000);
  });
  it('matches all six actual model mounts without changing normalized dimensions or texture axis', () => {
    expect(crownBake.width).toBe(260);
    expect(crownBake.height).toBe(210);
    expect(crownBake.neutralFrame).toBe(7);
    expect(crownBake.barrelForwardRadians).toBe(0);
    expect(crownBake.pivot).toEqual([.5, .5]);
    expect(SIEGE_TURRETS.map(({ x, y }) => ({ x, y }))).toEqual(crownBake.mounts.map(({ x, y }) => ({ x, y })));
    const pose = siegeTurretPose(0, 0, 260, 210);
    expect(pose.muzzles[0].y - pose.y).toBeCloseTo(crownBake.muzzleLengthPx, 5);
    for (const mount of SIEGE_TURRETS) {
      expect(Math.abs(mount.x) + mount.width / 2).toBeLessThan(.5);
      expect(Math.abs(mount.y) + mount.height / 2).toBeLessThan(.5);
    }
  });
  it('swivels every gun left and right at a bounded mechanical rate without changing health', () => {
    const origin = { x: 640, y: 230 };
    let state = createModularBoss(1000);
    for (const target of [{ x: 40, y: 520 }, { x: 1240, y: 520 }]) {
      for (let frame = 0; frame < 300; frame++) {
        const previous = state;
        state = stepSiegeTurretAim(state, origin, target, 520, 420, 16);
        state.turrets.forEach((turret, index) => {
          expect(Math.abs(turret.rotation - previous.turrets[index].rotation)).toBeLessThanOrEqual(SIEGE_TURRET_TURN_RATE * .016 + 1e-10);
          expect(Math.abs(turret.rotation)).toBeLessThanOrEqual(SIEGE_TURRET_ARC);
          expect(turret.health).toBe(55);
        });
      }
      expect(state.turrets.every((turret) => target.x < origin.x ? turret.rotation > 0 : turret.rotation < 0)).toBe(true);
    }
  });
  it('keeps a warning locked, preserves a damaged/dead turret bearing, and bounds recovery from a long frame', () => {
    const origin = { x: 640, y: 230 }, target = { x: 900, y: 450 };
    const fresh = createModularBoss(1000);
    const aimed = stepSiegeTurretAim(fresh, origin, target, 520, 420, 50);
    expect(fresh.turrets.every((turret) => turret.rotation === 0)).toBe(true);
    expect(stepSiegeTurretAim(aimed, origin, { x: 100, y: 300 }, 520, 420, 1000, 0, true)).toBe(aimed);
    const hit = damageModularBoss(aimed, 12, { kind: 'turret', index: 2 }).state;
    expect(hit.turrets[2].rotation).toBe(aimed.turrets[2].rotation);
    const dead = damageModularBoss(hit, 100, { kind: 'turret', index: 2 }).state;
    const next = stepSiegeTurretAim(dead, origin, { x: 100, y: 200 }, 520, 420, 10000);
    expect(next.turrets[2]).toEqual(dead.turrets[2]);
    next.turrets.forEach((turret, index) => expect(Math.abs(turret.rotation - dead.turrets[index].rotation)).toBeLessThanOrEqual(SIEGE_TURRET_TURN_RATE * .05 + 1e-10));
    expect(stepSiegeTurretAim(aimed, origin, target, 520, 420, NaN)).toEqual(aimed);
  });
  it('all twelve shots and telegraph origins use the independently rotated physical muzzles', () => {
    const state = createModularBoss(1000);
    state.turrets.forEach((turret, index) => { turret.rotation = (index - 2.5) * .2; });
    const shots = buildTurretVolley(state, 0, 520, 420).shots;
    for (let index = 0; index < 6; index++) {
      const pose = siegeTurretPose(index, state.turrets[index].rotation, 520, 420);
      expect(pose.x).toBe(SIEGE_TURRETS[index].x * 520);
      expect(pose.y).toBe(SIEGE_TURRETS[index].y * 420);
      const pair = shots.filter((shot) => shot.module === index);
      expect(pair.map(({ x, y }) => ({ x, y }))).toEqual(pose.muzzles);
      expect(pair.every((shot) => shot.angle === Math.PI / 2 + state.turrets[index].rotation)).toBe(true);
      const meanX = (pair[0].x + pair[1].x) / 2 - pose.x;
      const meanY = (pair[0].y + pair[1].y) / 2 - pose.y;
      expect(Math.atan2(meanY, meanX)).toBeCloseTo(pose.angle);
    }
    expect(new Set(shots.map((shot) => shot.angle)).size).toBe(6);
  });
  it('keeps the oversized ship in its safe flight corridor without velocity jumps', () => {
    const body = { x: 640, y: 215, vx: 0, vy: 0 };
    let state = createFlightMotion('command', 5, body);
    for (let frame = 0; frame < 9000; frame++) {
      const next = stepSiegeFlight(state, body, 16.67);
      expect(Math.hypot(next.vx - body.vx, next.vy - body.vy)).toBeLessThanOrEqual(56 * .01667 + .001);
      state = next.state;
      Object.assign(body, { vx: next.vx, vy: next.vy, x: body.x + next.vx * .01667, y: body.y + next.vy * .01667 });
      expect(body.x).toBeGreaterThan(280);
      expect(body.x).toBeLessThan(1000);
      expect(body.y).toBeGreaterThan(200);
      expect(body.y).toBeLessThan(270);
    }
  });
  it('fixes final boss durability at the cleared approach regardless of Seraph completion time', () => {
    const mission = getMissionById('lastLight');
    for (const kind of ['seraph', 'nullArchitect'] as const) {
      const hp = (elapsed: number): number => Math.round(ENEMIES[kind].health * getThreatTuning(
        encounterHealthProgress(kind, elapsed, mission.durationMs, mission.approachDurationMs!), 'pilot', mission.id,
      ).enemyHealth);
      expect(hp(35_000)).toBe(hp(90_000));
      expect(hp(35_000)).toBe(hp(210_000));
      expect(hp(35_000)).toBe(hp(600_000));
    }
    expect(encounterHealthProgress('scout', 100_000, mission.durationMs, 35_000))
      .toBeGreaterThan(encounterHealthProgress('scout', 35_000, mission.durationMs, 35_000));
  });
  it('rounds each pod separately at5.5% and keeps the six-pod budget near33% of hull', () => {
    for (const hull of [1000, 3104, 3401]) {
      const state = createModularBoss(hull);
      expect(state.turrets.every((turret) => turret.maxHealth === Math.round(hull * .055))).toBe(true);
      expect(Math.abs(state.turrets.reduce((sum, turret) => sum + turret.maxHealth, 0) - hull * .33)).toBeLessThanOrEqual(3);
    }
  });
  it.each([
    ['cadet', 2026, 2597, 143, 3455],
    ['pilot', 2396, 3072, 169, 4086],
    ['ace', 2883, 3696, 203, 4914],
  ] as const)('matches the documented %s final-pair health budget', (difficulty, seraph, hull, pod, total) => {
    const mission = getMissionById('lastLight');
    const tuning = getThreatTuning(encounterHealthProgress('nullArchitect', 999999, mission.durationMs, mission.approachDurationMs!), difficulty, mission.id);
    expect(Math.round(ENEMIES.seraph.health * tuning.enemyHealth)).toBe(seraph);
    const state = createModularBoss(Math.round(ENEMIES.nullArchitect.health * tuning.enemyHealth));
    expect(state.hull).toBe(hull);
    expect(state.turrets[0].health).toBe(pod);
    expect(state.hull + state.turrets.reduce((sum, turret) => sum + turret.health, 0)).toBe(total);
  });
});

describe('Seraph articulation', () => {
  it('moves joints continuously and shares the same pose during warning', () => {
    expect(seraphWingPose(2000, true)).toEqual(seraphWingPose(2000, false));
    expect(seraphWingPose(0, false)).not.toEqual(seraphWingPose(2500, false));
    for (let time = 0; time < 20000; time += 16) {
      const a = seraphWingPose(time, false), b = seraphWingPose(time + 16, false);
      expect(Math.abs(a.spread - b.spread)).toBeLessThan(.13);
      expect(Math.abs(a.barrelY - b.barrelY)).toBeLessThan(.07);
    }
  });
});
