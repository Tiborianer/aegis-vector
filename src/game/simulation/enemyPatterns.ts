/** Locked, telegraphed volleys. Coordinates are offsets from the firing craft. */
export interface EnemyShot { x: number; y: number; angle: number; heavy: boolean; ion?: boolean }
export interface EnemyVolley {
  name: string;
  warningMs: number;
  recoveryMs: number;
  color: number;
  shots: EnemyShot[];
}
type Point = { x: number; y: number };
export type PatternEnemy = 'skimmer' | 'weaver' | 'prism' | 'leech' | 'seraph' | 'nullArchitect';
const aim = (from: Point, to: Point): number => Math.atan2(to.y - from.y, to.x - from.x);
const clamp = (n: number, low: number, high: number): number => Math.max(low, Math.min(high, n));
export const bossPhase = (healthRatio: number): 1 | 2 | 3 => healthRatio > .66 ? 1 : healthRatio > .33 ? 2 : 3;

export function buildEnemyVolley(kind: PatternEnemy, attack: number, healthRatio: number, origin: Point, target: Point): EnemyVolley {
  const phase = bossPhase(healthRatio);
  const shots: EnemyShot[] = [];
  const addFan = (x: number, y: number, angle: number, count: number, spacing: number, heavy: boolean, ion = false): void => {
    for (let i = 0; i < count; i++) shots.push({ x, y, angle: angle + (i - (count - 1) / 2) * spacing, heavy, ion });
  };
  if (kind === 'prism') {
    // Lock once before the warning, then split the energy into three narrow
    // rays. No homing or post-warning correction: one deliberate sidestep wins.
    addFan(0, 26, aim({ x: origin.x, y: origin.y + 26 }, target), 3, .16, false, true);
    return { name: 'PRISM // REFRACTION FAN', warningMs: 900, recoveryMs: 2200, color: 0x8af7ff, shots };
  }
  if (kind === 'leech') {
    // Alternating pressure banks converge either side of the *locked* target.
    // The middle remains an escape lane, unlike Prism's direct center ray.
    const side = attack % 2 === 0 ? -1 : 1;
    const locked = { x: clamp(target.x + side * 95, 90, 1190), y: Math.max(origin.y + 270, target.y) };
    for (const x of [-30, 30]) addFan(x, 26, aim({ x: origin.x + x, y: origin.y + 26 }, locked), 2, .075, true);
    return { name: 'LEECH // PRESSURE BURST', warningMs: 1150, recoveryMs: 2600, color: 0xffbd75, shots };
  }
  if (kind === 'skimmer') {
    for (const x of [-21, 21]) addFan(x, 24, aim({ x: origin.x + x, y: origin.y + 24 }, target), 1, 0, false, true);
    return { name: 'ION LANCE', warningMs: 780, recoveryMs: 1800, color: 0x71f7ef, shots };
  }
  if (kind === 'weaver') {
    // Two small outward forks leave the locked target's corridor visibly open.
    const corridor = clamp(target.x, 190, 1090);
    for (const side of [-1, 1]) {
      const x = side * 36;
      const angle = aim({ x: origin.x + x, y: origin.y + 24 }, { x: corridor + side * 170, y: Math.max(origin.y + 300, target.y) });
      addFan(x, 24, angle, 2, .055, true);
    }
    return { name: 'CROSSFIRE GATE', warningMs: 1000, recoveryMs: 2400, color: 0xcaa1ff, shots };
  }
  if (kind === 'seraph') {
    if (attack % 2 === 0) {
      // Broad wings fire separate fans with a readable center lane.
      for (const side of [-1, 1]) {
        const x = side * 108;
        const angle = aim({ x: origin.x + x, y: origin.y + 34 }, { x: clamp(target.x + side * 150, 80, 1200), y: Math.max(target.y, 450) });
        addFan(x, 34, angle, phase + 2, .095, true);
      }
      return { name: 'SERAPH // WING BATTERIES', warningMs: 1050, recoveryMs: 1350, color: 0xffc66e, shots };
    }
    const locked = aim(origin, target);
    addFan(0, 48, locked, phase === 3 ? 7 : 5, .14, false, true);
    if (phase >= 2) {
      addFan(-115, 24, Math.PI / 2 - .16, 2, .07, true);
      addFan(115, 24, Math.PI / 2 + .16, 2, .07, true);
    }
    return { name: 'SERAPH // SPEAR ARRAY', warningMs: 900, recoveryMs: 1400, color: 0x7ef2ef, shots };
  }
  if (attack % 2 === 0) {
    const safeAngle = aim(origin, target);
    const count = phase === 3 ? 22 : phase === 2 ? 18 : 14;
    for (let i = 0; i < count; i++) {
      const angle = safeAngle + Math.PI * 2 * i / count;
      const fromGap = Math.abs(Math.atan2(Math.sin(angle - safeAngle), Math.cos(angle - safeAngle)));
      if (fromGap < .43) continue;
      shots.push({ x: 0, y: 0, angle, heavy: i % 3 === 0 });
    }
    return { name: 'OBSIDIAN CROWN // OPEN SEAM', warningMs: 1200, recoveryMs: 1600, color: 0xb794ff, shots };
  }
  const safeX = clamp(target.x, 210, 1070);
  for (const columnX of [150, 350, 550, 750, 950, 1150]) {
    if (Math.abs(columnX - safeX) < 155) continue;
    addFan(columnX - origin.x, 0, Math.PI / 2, phase === 3 ? 2 : 1, .035, true);
  }
  return { name: 'OBSIDIAN CROWN // LATTICE FALL', warningMs: 1250, recoveryMs: 1800, color: 0xcf9fff, shots };
}
