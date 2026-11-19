import { getArcVolley, getNovaVolley } from '../content/balance';
import type { GameModel } from './GameModel';
import type { EnemyKind } from './types';

const medium = new Set<EnemyKind>(['bomber', 'sniper', 'mineLayer', 'phantom', 'artillery', 'reclaimer', 'skimmer', 'weaver', 'prism', 'leech']);
export interface AdaptiveCheckpoint { percent: number; observations: number[] }
export interface AdaptiveTarget { wave: number; remainingAfterContact?: number; engagedMs: number; expectedDamage: number }
type Loadout = Pick<GameModel, 'weapons' | 'modifiers' | 'arcDamageMultiplier' | 'damageMultiplier' | 'fireIntervalMultiplier'>;

/** Single-target fire from the pilot's current equipment. Wide volleys contribute
 * only the center lane; their outer bolts normally cover different ships. */
export function adaptiveFireProfile(model: Loadout) {
  const { weapons, modifiers } = model;
  const arc = getArcVolley(weapons.spread);
  const nova = getNovaVolley(weapons.missile);
  const rate = model.fireIntervalMultiplier;
  const damage = model.damageMultiplier;
  const arcHit = arc.damage * model.arcDamageMultiplier * (modifiers.prismaticCore ? (arc.angles.length % 2 ? 1.5 : 1.25) : 1);
  const novaHit = nova.damage * damage * (modifiers.hunterLogic ? 1.25 : 1);
  const laserHit = weapons.laser ? (4 + 2 * weapons.laser) * damage * (modifiers.prismaticCore ? 1.35 : 1) : 0;
  const ionHit = weapons.ion ? (2.4 + .8 * weapons.ion) * (weapons.ion >= 4 ? 1.25 : 1) * damage : 0;
  const arcRate = (arcHit + (modifiers.splitCapacitors ? model.arcDamageMultiplier : 0)) / Math.max(62, arc.intervalMs * rate);
  const novaRate = novaHit * (nova.count + Number(weapons.missile > 0 && modifiers.ordnanceCascade)) / Math.max(600, nova.intervalMs * rate);
  const lanceRate = laserHit / Math.max(520, (1720 - weapons.laser * 190) * rate * (weapons.laser >= 4 ? .8 : 1));
  const ionRate = ionHit / (Math.max(720, 1650 - weapons.ion * 150) * rate);
  const droneRate = weapons.drone ? (modifiers.swarmDoctrine ? .84 : .7) * damage / (300 * rate * (weapons.drone >= 3 ? .82 : 1)) : 0;
  return {
    // Protect breakpoints for deliberate full-charge shots as well as normal weapons.
    singleHit: Math.max(arcHit * 3 * (modifiers.heliosBattery ? 1.5 : 1), novaHit, laserHit, ionHit),
    damagePerMs: arcRate + novaRate + lanceRate + ionRate + droneRate,
  };
}

export function adaptiveHealth(kind: EnemyKind, authored: number, singleHit: number, percent: number): number {
  if (!medium.has(kind) || authored <= singleHit) return authored;
  const rounded = Math.round(authored * (1 + percent / 100));
  const health = Math.max(Math.ceil(authored * .92), Math.min(Math.floor(authored * 1.08), rounded));
  return health <= singleHit ? authored : health;
}

export class AdaptiveDifficulty {
  percent = 0;
  private observations: number[] = [];
  private countedWaves = new Set<number>();

  constructor(saved?: AdaptiveCheckpoint) {
    if (!saved || ![-8, -4, 0, 4, 8].includes(saved.percent)
      || !Array.isArray(saved.observations) || saved.observations.length > 2
      || !saved.observations.every(ratio => Number.isFinite(ratio) && ratio > 0)) return;
    this.percent = saved.percent;
    this.observations = [...saved.observations];
  }

  checkpoint(): AdaptiveCheckpoint { return { percent: this.percent, observations: [...this.observations] }; }

  target(kind: EnemyKind, wave: number, health: number, singleHit: number): AdaptiveTarget | undefined {
    if (!medium.has(kind) || health <= singleHit) return;
    return { wave, engagedMs: 0, expectedDamage: 0 };
  }

  observe(target: AdaptiveTarget, delta: number, damagePerMs: number): void {
    if (!target.remainingAfterContact || damagePerMs <= 0 || this.countedWaves.has(target.wave)) return;
    target.engagedMs += delta;
    target.expectedDamage += delta * damagePerMs;
  }

  finish(target: AdaptiveTarget): void {
    if (!target.remainingAfterContact || target.engagedMs < 180 || this.countedWaves.has(target.wave)) return;
    // At the authored reference pace roughly two thirds of aimed fire connects.
    // Dividing engaged time by expected kill time normalizes HP, upgrades and pilot count.
    const expectedMs = target.remainingAfterContact / (.65 * target.expectedDamage / target.engagedMs);
    this.observations.push(target.engagedMs / expectedMs);
    this.countedWaves.add(target.wave);
    if (this.observations.length < 3) return;
    const median = this.observations.sort((a, b) => a - b)[1];
    this.percent = Math.max(-8, Math.min(8, this.percent + (median < .8 ? 4 : median > 1.25 ? -4 : 0)));
    this.observations = [];
  }
}
