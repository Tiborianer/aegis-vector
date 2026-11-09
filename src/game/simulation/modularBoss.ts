import type { EnemyVolley, EnemyShot } from './enemyPatterns';
import { stepFlightMotion, steerVelocity, type FlightBody, type FlightMotion } from './flightMotion';
import seraphBake from '../../../public/graphics-v2/modules/seraph-wings.json';

/** Siege modules are simulation state, not sprite children. Damage never spills
 * from the last turret into the hull: opening the armor is its own readable beat. */
export interface SiegeTurret {
  health: number;
  maxHealth: number;
  /** Radians relative to forward/down. Damage never resets this bearing. */
  rotation: number;
}
export interface ModularBossState { turrets: SiegeTurret[]; hull: number; maxHull: number }
export type ModuleDamageTarget = { kind: 'turret'; index: number } | { kind: 'hull' } | { kind: 'area' } | { kind: 'auto' };
export interface ModuleDamageResult { state: ModularBossState; destroyed: number[]; unlocked: boolean; blocked: boolean }
export const SIEGE_TURRET_HEALTH_RATIO = .055;
export const SIEGE_TURRET_ARC = Math.PI * 65 / 180;
export const SIEGE_TURRET_TURN_RATE = Math.PI / 4;
/** Projected from crown.blend at neutral frame 7; see the shipping bake contract
 * graphics-v2/modules/crown-turret.json. Coordinates are relative to hull center. */
export const SIEGE_TURRET_MUZZLE_LENGTH = 11.2663;
export const SIEGE_TURRET_BARREL_HALF_SPACING = 1.870104;
export const SIEGE_TURRETS = [
  { x: .182691, y: .195818, width: .065, height: .08 },
  { x: .258309, y: .028277, width: .065, height: .08 },
  { x: .209914, y: -.139971, width: .065, height: .08 },
  { x: -.182691, y: .195818, width: .065, height: .08 },
  { x: -.258309, y: .028277, width: .065, height: .08 },
  { x: -.209914, y: -.139971, width: .065, height: .08 },
] as const;
/** Inscribed plate rectangles, never the broad AABBs across empty outrigger
 * gaps. Index 0 is the protected axial spine. Other plates become targets only
 * after the six guns die, so they cannot swallow shots aimed at rear batteries. */
export const SIEGE_HULL_RECTS = [
  { x: 0, y: .025, width: .1, height: .71 },
  ...[-1, 1].flatMap((side) => [
    { x: side * .105, y: .15, width: .1, height: .065 },
    { x: side * .175, y: .19, width: .06, height: .065 },
    { x: side * .13, y: -.005, width: .15, height: .065 },
    { x: side * .24, y: .035, width: .06, height: .065 },
    { x: side * .12, y: -.175, width: .13, height: .06 },
    { x: side * .21, y: -.135, width: .05, height: .06 },
  ]),
] as const;

export function createModularBoss(hull: number): ModularBossState {
  const maxHull = Math.max(1, Number.isFinite(hull) ? hull : 1);
  const turretHealth = Math.max(1, Math.round(maxHull * SIEGE_TURRET_HEALTH_RATIO));
  return { hull: maxHull, maxHull, turrets: SIEGE_TURRETS.map(() => ({ health: turretHealth, maxHealth: turretHealth, rotation: 0 })) };
}
export const activeTurretCount = (state: ModularBossState): number => state.turrets.filter((turret) => turret.health > 0).length;
export const modularHealthRatio = (state: ModularBossState): number =>
  (state.hull + state.turrets.reduce((sum, turret) => sum + turret.health, 0)) /
  (state.maxHull + state.turrets.reduce((sum, turret) => sum + turret.maxHealth, 0));

/** The final pair is balanced against the cleared approach, not how long a
 * player needed to beat Seraph. Ordinary enemies retain continuous growth. */
export function encounterHealthProgress(kind: string, elapsedMs: number, durationMs: number, approachMs: number): number {
  const referenceTime = kind === 'seraph' || kind === 'nullArchitect' ? approachMs : elapsedMs;
  return Math.max(0, Math.min(1, referenceTime / Math.max(1, durationMs)));
}

export type ModularVolley = Omit<EnemyVolley, 'shots'> & { shots: Array<EnemyShot & { module?: number }> };
type Point = { x: number; y: number };
const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));

/** Advance mechanical aim, not projectiles. A warning freezes this pose until
 * launch, so the player sees the same aim the guns will actually fire. */
export function stepSiegeTurretAim(state: ModularBossState, origin: Point, target: Point,
  width: number, height: number, deltaMs: number, attack = 0, locked = false): ModularBossState {
  if (locked) return state;
  const step = SIEGE_TURRET_TURN_RATE * clamp(Number.isFinite(deltaMs) ? deltaMs : 0, 0, 50) / 1000;
  return { ...state, turrets: state.turrets.map((turret, index) => {
    if (turret.health <= 0) return turret;
    const mount = SIEGE_TURRETS[index];
    const aimX = target.x + (attack % 2 === 0 ? 0 : index % 2 === 0 ? -145 : 145);
    const desired = Math.atan2(target.y - origin.y - mount.y * height, aimX - origin.x - mount.x * width) - Math.PI / 2;
    const wrapped = Math.atan2(Math.sin(desired), Math.cos(desired));
    const bearing = clamp(wrapped, -SIEGE_TURRET_ARC, SIEGE_TURRET_ARC);
    return { ...turret, rotation: clamp(turret.rotation + clamp(bearing - turret.rotation, -step, step), -SIEGE_TURRET_ARC, SIEGE_TURRET_ARC) };
  }) };
}

/** Local muzzle geometry shared by the visible rotating guns and their shots. */
export function siegeTurretPose(index: number, rotation: number, width: number, height: number): {
  x: number; y: number; rotation: number; angle: number; muzzles: Point[];
} {
  const mount = SIEGE_TURRETS[index];
  const x = mount.x * width, y = mount.y * height;
  const bearing = clamp(rotation, -SIEGE_TURRET_ARC, SIEGE_TURRET_ARC);
  const c = Math.cos(bearing), s = Math.sin(bearing);
  const muzzles = [-SIEGE_TURRET_BARREL_HALF_SPACING, SIEGE_TURRET_BARREL_HALF_SPACING].map((side) => {
    const dx = side / 260 * width, dy = SIEGE_TURRET_MUZZLE_LENGTH / 210 * height;
    return { x: x + dx * c - dy * s, y: y + dx * s + dy * c };
  });
  return { x, y, rotation: bearing, angle: Math.PI / 2 + bearing, muzzles };
}

/** Each live pod is a real firing origin. Destroying it also cancels its queued shot. */
export function buildTurretVolley(state: ModularBossState, attack: number, width: number, height: number): ModularVolley {
  const shots: ModularVolley['shots'] = [];
  SIEGE_TURRETS.forEach((_mount, index) => {
    if (state.turrets[index].health <= 0) return;
    const pose = siegeTurretPose(index, state.turrets[index].rotation, width, height);
    for (const muzzle of pose.muzzles) shots.push({ ...muzzle, angle: pose.angle, heavy: true, module: index });
  });
  return { name: attack % 2 === 0 ? 'CROWN BATTERIES // LOCKED SALVO' : 'CROWN BATTERIES // SPLIT LANCE', shots, warningMs: 1250, recoveryMs: 1600, color: 0xff8c72 };
}

export function damageModularBoss(previous: ModularBossState, rawDamage: number, target: ModuleDamageTarget): ModuleDamageResult {
  const state = { ...previous, turrets: previous.turrets.map((turret) => ({ ...turret })) };
  const damage = Math.max(0, Number.isFinite(rawDamage) ? rawDamage : 0);
  const live = state.turrets.map((turret, i) => turret.health > 0 ? i : -1).filter((i) => i >= 0);
  const destroyed: number[] = [];
  let blocked = false;
  const hitTurret = (index: number, amount: number): void => {
    const turret = state.turrets[index];
    if (!turret || turret.health <= 0) return;
    turret.health = Math.max(0, turret.health - amount);
    if (turret.health === 0) destroyed.push(index);
  };
  if (target.kind === 'turret') hitTurret(target.index, damage);
  else if (live.length > 0) {
    if (target.kind === 'hull') blocked = true;
    else if (target.kind === 'area') live.forEach((index) => hitTurret(index, damage / live.length));
    else hitTurret(live[0], damage);
  } else state.hull = Math.max(0, state.hull - damage);
  return { state, destroyed, unlocked: live.length > 0 && activeTurretCount(state) === 0, blocked };
}

export const SERAPH_WINGS = seraphBake.wings;
/** Transform an authored plate/muzzle around the actual projected bearing. */
export function seraphWingPoint(wingIndex: number, point: Point, timeMs: number): Point {
  const wing = SERAPH_WINGS[wingIndex];
  const rotation = seraphWingRotation(wingIndex, timeMs);
  const dx = point.x - wing.hinge[0], dy = point.y - wing.hinge[1];
  return { x: wing.hinge[0] + dx * Math.cos(rotation) - dy * Math.sin(rotation),
    y: wing.hinge[1] + dx * Math.sin(rotation) + dy * Math.cos(rotation) };
}
export const seraphWingRotation = (wingIndex: number, timeMs: number): number =>
  SERAPH_WINGS[wingIndex].side * Math.sin(Math.max(0, timeMs) * .0006) * seraphBake.sweepRadians;

/** Inscribed moving plates leave the large open crescents truly shoot-through. */
export function seraphCollisionRects(timeMs: number): Array<{ x: number; y: number; width: number; height: number }> {
  return [{ x: 0, y: .04, width: .105, height: .65 }, ...SERAPH_WINGS.flatMap((wing, index) =>
    wing.colliders.map((plate) => {
      const point = seraphWingPoint(index, plate, timeMs);
      return { x: point.x / seraphBake.width, y: point.y / seraphBake.height,
        width: plate.width / seraphBake.width, height: plate.height / seraphBake.height };
    }))];
}

/** The same exact projected muzzle drives artwork, telegraph and projectiles. */
export function seraphWingPose(timeMs: number, warning: boolean): { spread: number; sweep: number; barrelY: number } {
  void warning;
  const wing = SERAPH_WINGS[1];
  const muzzle = seraphWingPoint(1, { x: wing.muzzle[0], y: wing.muzzle[1] }, timeMs);
  return { spread: muzzle.x, sweep: seraphWingRotation(1, timeMs), barrelY: muzzle.y - 25 };
}

/** Keep a 520px siege craft fully on-screen while retaining deliberate flight
 * legs and acceleration. A fresh destination can never pull its hull offscreen. */
export function stepSiegeFlight(state: FlightMotion, body: FlightBody, deltaMs: number, hold = false): { state: FlightMotion; vx: number; vy: number } {
  const safe = { ...state, targetX: Math.max(300, Math.min(980, state.targetX)), targetY: Math.max(215, Math.min(255, state.targetY)) };
  const result = stepFlightMotion(safe, body, deltaMs, hold);
  const next = { ...result.state,
    targetX: Math.max(300, Math.min(980, result.state.targetX)),
    targetY: result.state.leg !== safe.leg ? 215 + Math.max(0, Math.min(65, result.state.targetY - 115)) * .6 : safe.targetY,
  };
  return { state: next, ...steerVelocity(body, next.targetX, next.targetY, deltaMs, 48, 56, hold || next.waitingMs >= 0) };
}
