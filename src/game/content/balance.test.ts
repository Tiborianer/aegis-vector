import { describe, expect, it } from 'vitest';
import { ENEMIES, getArcVolley, getNovaVolley, WEAPON_MAX_LEVEL } from './balance';
import { getThreatTuning } from './encounters';
import { buildCombatModifiers, getSibling, UPGRADE_NODES } from './upgrades';
import type { Difficulty, MissionId } from '../simulation/types';

describe('campaign durability profiles', () => {
  it('keeps an easier opening and progressively tougher later missions before escalation', () => {
    const expected: Record<Difficulty, Record<MissionId, number>> = {
      cadet: { coastal: 0.78, minefield: 1.14, aurora: 1.14, fortress: 1.5, stormbreak: 1.7, graveyard: 1.7, carrierSiege: 1.95, dreadnought: 2.25, lastLight: 2.45 },
      pilot: { coastal: 0.82, minefield: 1.3, aurora: 1.3, fortress: 1.7, stormbreak: 1.95, graveyard: 1.95, carrierSiege: 2.3, dreadnought: 2.65, lastLight: 2.85 },
      ace: { coastal: 0.95, minefield: 1.48, aurora: 1.48, fortress: 1.98, stormbreak: 2.25, graveyard: 2.25, carrierSiege: 2.65, dreadnought: 3.05, lastLight: 3.3 },
    };
    for (const difficulty of ['cadet', 'pilot', 'ace'] as const) {
      for (const mission of ['coastal', 'minefield', 'aurora', 'fortress', 'stormbreak', 'graveyard', 'carrierSiege', 'dreadnought', 'lastLight'] as const) {
        expect(getThreatTuning(0, difficulty, mission).enemyHealth).toBeCloseTo(expected[difficulty][mission]);
      }
    }
  });

  it('keeps Bulwark and Warden base durability independent from carrier reinforcement', () => {
    expect(ENEMIES.bulwark.health).toBe(30);
    expect(ENEMIES.warden.health).toBe(310);
  });

  it('keeps the new miniboss base durability distinct', () => {
    expect([ENEMIES.razorwing.health, ENEMIES.gatekeeper.health, ENEMIES.pursuer.health]).toEqual([110, 240, 285]);
  });

  it('raises every boss hull by at least forty percent without increasing bullet cadence', () => {
    const previous = { razorwing: [72, 1_650], gatekeeper: [160, 1_250], pursuer: [190, 1_400], carrierBoss: [310, 900], warden: [220, 850], boss: [620, 680], seraph: [520, 1_000], nullArchitect: [700, 900] } as const;
    for (const kind of Object.keys(previous) as Array<keyof typeof previous>) {
      expect(ENEMIES[kind].health).toBeGreaterThanOrEqual(previous[kind][0] * 1.4);
      expect(ENEMIES[kind].fireMs).toBe(previous[kind][1]);
    }
  });
});

describe('NOVA support-weapon progression', () => {
  it('retains homing salvo growth with a bounded cadence and splash', () => {
    expect([1, 2, 3, 4, 5].map((level) => getNovaVolley(level).count)).toEqual([1, 2, 2, 2, 3]);
    expect(getNovaVolley(1).intervalMs).toBe(1_160);
    expect(getNovaVolley(5).intervalMs).toBe(840);
    expect(getNovaVolley(5).damage).toBeCloseTo(5.95);
    expect(getNovaVolley(5)).toMatchObject({ splashRadius: 45, splashDamageMultiplier: 0.35 });
    expect(getNovaVolley(4).splashRadius).toBe(0);
  });

  it('grows at every level without the old fifty-two DPS homing ceiling', () => {
    const dps = (level: number): number => {
      const volley = getNovaVolley(level);
      return volley.count * volley.damage * 1_000 / volley.intervalMs;
    };
    for (let level = 2; level <= 5; level += 1) expect(dps(level)).toBeGreaterThan(dps(level - 1));
    expect(dps(5)).toBeCloseTo(21.25);
    expect(dps(5)).toBeLessThan((3 * 8 * 1_000 / 460) * 0.45);
    expect(dps(1)).toBeGreaterThan(3);
  });

  it('normalizes malformed and locked levels without creating a free missile', () => {
    expect(getNovaVolley(NaN)).toEqual(getNovaVolley(0));
    expect(getNovaVolley(-1).count).toBe(0);
    expect(getNovaVolley(99)).toEqual(getNovaVolley(5));
    expect(getNovaVolley(2.9)).toEqual(getNovaVolley(2));
  });
});

describe('linear ARC progression', () => {
  it('adds exactly one bolt per level with a centered symmetric fan', () => {
    for (let level = 1; level <= 7; level += 1) {
      const volley = getArcVolley(level);
      expect(volley.angles).toHaveLength(level);
      expect(volley.angles.reduce((sum, angle) => sum + angle, 0)).toBeCloseTo(0);
      expect(Math.max(...volley.angles.map(Math.abs))).toBeLessThanOrEqual(0.225);
      expect(volley.angles[0]).toBeCloseTo(-volley.angles.at(-1)!);
    }
    expect(WEAPON_MAX_LEVEL).toEqual({ spread: 7, missile: 5, laser: 5, drone: 5, ion: 5 });
  });

  it('caps bad inputs and gently improves damage and cadence', () => {
    expect(getArcVolley(NaN)).toEqual(getArcVolley(1));
    expect(getArcVolley(-2)).toEqual(getArcVolley(1));
    expect(getArcVolley(99)).toEqual(getArcVolley(7));
    expect(getArcVolley(2).angles).toEqual([-0.0375, 0.0375]);
    expect(getArcVolley(7)).toMatchObject({ damage: 1.2, intervalMs: 94 });
    for (let level = 2; level <= 7; level += 1) {
      expect(getArcVolley(level).damage).toBeGreaterThanOrEqual(getArcVolley(level - 1).damage);
      expect(getArcVolley(level).intervalMs).toBe(getArcVolley(level - 1).intervalMs - 8);
    }
    const theoreticalDps = (level: number) => {
      const volley = getArcVolley(level);
      return volley.angles.length * volley.damage * 1_000 / volley.intervalMs;
    };
    expect(theoreticalDps(2)).toBeLessThan(3 * 1_000 / 130);
    expect(theoreticalDps(7)).toBeLessThan(7 * 1.2 * 1_000 / 84.6);
    expect(theoreticalDps(7)).toBeGreaterThan(80);
  });
});

describe('upgrade catalogue review', () => {
  it('gives every upgrade exactly one sibling and a complete prerequisite chain', () => {
    expect(UPGRADE_NODES).toHaveLength(40);
    expect(new Set(UPGRADE_NODES.map(({ id }) => id)).size).toBe(40);
    for (const node of UPGRADE_NODES) {
      expect(UPGRADE_NODES.filter((candidate) => candidate.branch === node.branch && candidate.tier === node.tier)).toHaveLength(2);
      expect(getSibling(getSibling(node)).id).toBe(node.id);
      expect(node.icon).toMatch(/ui\/upgrades\/[a-z-]+\.png$/);
      expect(node.cost).toBeGreaterThan(0);
      if (node.tier > 1) expect(UPGRADE_NODES.some((candidate) => candidate.branch === node.branch && candidate.tier === node.tier - 1)).toBe(true);
      expect(buildCombatModifiers([node.id])).not.toEqual(buildCombatModifiers([]));
    }
  });

  it('keeps late weapon refinement modest and additive with earlier technology', () => {
    const modifiers = buildCombatModifiers(['rapid-cycling', 'amplified-munitions', 'precision-feed']);
    expect(modifiers.fireIntervalMultiplier).toBeCloseTo(0.9 * 0.94);
    expect(modifiers.damageMultiplier).toBeCloseTo(1.12 * 1.08);
    expect(buildCombatModifiers(['tractor-array']).passiveTractorRadius).toBe(180);
  });
});
