import type { DroneFormationSlot, WeaponLevel } from '../simulation/types';

const LEVEL_FORMATIONS: Record<WeaponLevel, readonly Omit<DroneFormationSlot, 'variant'>[]> = {
  0: [],
  1: [{ x: -64, y: 18 }],
  2: [{ x: -64, y: 18 }, { x: 64, y: 18 }],
  3: [{ x: -64, y: 18 }, { x: 64, y: 18 }],
  4: [{ x: -68, y: 14 }, { x: 68, y: 14 }, { x: 0, y: 72 }],
  5: [{ x: -58, y: 12 }, { x: 58, y: 12 }, { x: -112, y: 42 }, { x: 112, y: 42 }],
};

export function droneFormation(level: WeaponLevel, wingmanBeacon = false): DroneFormationSlot[] {
  const variant = level >= 3 ? 'mk2' : 'standard';
  const slots: DroneFormationSlot[] = LEVEL_FORMATIONS[level].map((slot) => ({ ...slot, variant }));
  if (wingmanBeacon) {
    const beacon = level === 4 ? { x: 0, y: -62 } : { x: 0, y: 92 };
    slots.push({ ...beacon, variant: 'beacon' });
  }
  return slots;
}

export function droneStatus(level: WeaponLevel, wingmanBeacon = false): string {
  const count = droneFormation(level, wingmanBeacon).length;
  if (count === 0) return 'OFFLINE';
  if (level >= 5) return `${count} DRONES // RAPID VOLLEY`;
  if (level >= 3) return `${count} DRONES // FAST VOLLEY`;
  return `${count} DRONE${count === 1 ? '' : 'S'} // STANDARD`;
}
