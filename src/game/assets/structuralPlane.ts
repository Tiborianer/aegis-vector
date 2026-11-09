import type { MissionId } from '../simulation/types';

export const STRUCTURE_TILE_WIDTH = 1400;
export const STRUCTURE_TILE_HEIGHT = 1600;
export const STRUCTURE_SPEED_PX_PER_SECOND = 34;
export const STRUCTURE_OPACITY = 1;
export const STRUCTURE_CLEAR_CORRIDOR = { left: 360, right: 1040 } as const;

export interface StructurePoint { x: number; y: number }
export interface FortressPlatform {
  side: 'left' | 'right';
  outline: StructurePoint[];
  deck: StructurePoint[];
  spine: StructurePoint[];
  vents: StructurePoint[];
  lights: StructurePoint[];
}

/** Separate coastal maintenance docks echo the industrial islands beneath,
 * replacing the continuous rib lattice. No platform spans the playfield. */
export const FORTRESS_PLATFORMS: FortressPlatform[] = [
  { side: 'left' as const, y: 120, scale: 1 },
  { side: 'right' as const, y: 470, scale: .86 },
  { side: 'left' as const, y: 940, scale: .78 },
  { side: 'right' as const, y: 1280, scale: 1.08 },
].map(({ side, y, scale }) => {
  const point = (x: number, localY: number): StructurePoint => ({
    x: side === 'left' ? 44 + x * scale : STRUCTURE_TILE_WIDTH - 44 - x * scale,
    y: y + localY * scale,
  });
  return {
    side,
    outline: [[0,0],[116,-24],[176,8],[210,53],[192,90],[222,111],[206,177],[136,210],[28,184],[-24,138]]
      .map(([x, localY]) => point(x, localY)),
    deck: [[16,10],[105,-4],[154,25],[173,68],[149,132],[173,153],[128,181],[40,161],[5,120]]
      .map(([x, localY]) => point(x, localY)),
    spine: [[27,24],[53,17],[80,142],[57,156]].map(([x, localY]) => point(x, localY)),
    vents: Array.from({ length: 5 }, (_, i) => point(90 + i * 9, 54 + i * 13)),
    lights: [[109,8],[159,44],[163,105],[139,164],[40,150]].map(([x, localY]) => point(x, localY)),
  };
});

function polygonArea(points: StructurePoint[]): number {
  return Math.abs(points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point.x * next.y - next.x * point.y;
  }, 0)) / 2;
}

export function structuralGapFractionLowerBound(): number {
  // Includes conservative shadow/bevel bounds around every dock.
  const occupied = FORTRESS_PLATFORMS.reduce((sum, platform) => sum + polygonArea(platform.outline) + 8_000, 0);
  return 1 - occupied / (STRUCTURE_TILE_WIDTH * STRUCTURE_TILE_HEIGHT);
}

export function structuralPlaneEnabled(mission: MissionId, query = ''): boolean {
  return mission === 'fortress' && new URLSearchParams(query).get('structuralPlane') !== 'off';
}
