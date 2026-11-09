import type { EnemyKind, GraphicsQuality, MissionId } from '../simulation/types';

export type VisualStyle = 'classic' | 'dimensional';
export const VISUAL_STYLE_KEY = 'aegis-vector-visual-style-v2';
export const BANK_ANGLES = [-36, -30, -24, -18, -12, -8, -4, 0, 4, 8, 12, 18, 24, 30, 36, 42] as const;
export const NEUTRAL_BANK = 7;
export const SHIP_SIZES = {
  player: [88,104], scout: [64,60], interceptor: [76,68], bomber: [104,78],
  elite: [112,86], charger: [78,76], sniper: [88,70], mineLayer: [112,74],
  shieldCarrier: [104,84], bulwark: [140,96], phantom: [82,68], artillery: [126,82],
  reclaimer: [86,76], razorwing: [112,82], gatekeeper: [184,104], pursuer: [158,96],
  carrierBoss: [244,116], warden: [190,104], boss: [300,120], drone: [48,48], droneMk2: [48,48],
  skimmer: [100,76], weaver: [108,90], seraph: [320,164], nullArchitect: [260,210],
  prism: [96,84], leech: [98,88],
} as const satisfies Record<EnemyKind | 'player' | 'drone' | 'droneMk2', readonly [number, number]>;
export type ShipKind = keyof typeof SHIP_SIZES;
/** Texture pixels are independent of world size/collision geometry. Large bosses
 * carry extra real-rendered detail rather than stretching a small source. */
export const shipTextureDensity = (kind: ShipKind): number => kind === 'nullArchitect' ? 3 : kind === 'seraph' ? 2 : 1;
export const shipFrameSize = (kind: ShipKind): readonly [number, number] => {
  const density = shipTextureDensity(kind);
  return [SHIP_SIZES[kind][0] * density, SHIP_SIZES[kind][1] * density];
};
export const ENVIRONMENT_IDS: MissionId[] = ['coastal','minefield','aurora','fortress','stormbreak','graveyard','carrierSiege','dreadnought','lastLight'];
/** Compatibility preload only: Last Light hides this surface and renders its
 * own runtime starfield + sculpted asteroid layers (no duplicate download). */
export const environmentAsset = (mission: MissionId): string => `graphics-v2/environments/${mission === 'lastLight' ? 'dreadnought' : mission}.webp`;
export const shipKey = (kind: ShipKind): string => `dimensional-ship-${kind}`;
export const surfaceKey = (mission: MissionId): string => `dimensional-surface-${mission}`;
export const CLOUD_KEY = 'dimensional-cirrus';
export const isGraphicsPreview = (query: string): boolean => {
  const params = new URLSearchParams(query);
  // The Mission Lab lobby is save-isolated before a mission is launched too.
  return params.get('lab') === '1' || (params.get('debug') === '1' && params.get('graphics') === '1');
};

/** The approved artwork is fixed. Retain the old resolver signature so stale
 * links/preferences are harmless, without reading or rewriting any saved data.
 * Classic remains an internal load-failure fallback, never a player choice. */
export function resolveVisualStyle(_query: string, _saved?: string | null): VisualStyle {
  return 'dimensional';
}

export function currentVisualStyle(): VisualStyle {
  return 'dimensional';
}

/** Quantize a real 3D bank, independent of gameplay heading and physics. */
export function bankFrame(degrees: number): number {
  if (!Number.isFinite(degrees)) return NEUTRAL_BANK;
  let best = NEUTRAL_BANK;
  for (let i = 0; i < BANK_ANGLES.length; i += 1) {
    if (Math.abs(BANK_ANGLES[i] - degrees) < Math.abs(BANK_ANGLES[best] - degrees)) best = i;
  }
  return best;
}

/** Frame-rate-independent view easing; never written into simulation velocity. */
export function easeBank(previous: number, target: number, deltaMs: number): number {
  return previous + (target - previous) * (1 - Math.exp(-Math.max(0, deltaMs) / 110));
}

/** Position-driven enemies also bank; measured motion is strictly read-only. */
export function visualLateralSpeed(previousX: number | undefined, x: number, deltaMs: number, fallback: number): number {
  if (previousX === undefined || deltaMs <= 0 || deltaMs > 200) return fallback;
  return Math.max(-430, Math.min(430, (x - previousX) * 1000 / deltaMs));
}

export function wrappedPlaneY(offset: number, height: number, index: number): number {
  return (((offset + index * height + height) % (height * 2)) + height * 2) % (height * 2) - height;
}

/** Only the leading 10% is feathered; the other 90% keeps its authored pixels. */
export const SURFACE_SEAM_BLEND_FRACTION = .10;

export function forwardSurfaceFrame(offset: number, imageHeight: number, index: number): {
  y: number; stride: number; blendHeight: number; flipY: false; depthOffset: number;
} {
  const blendHeight = imageHeight * SURFACE_SEAM_BLEND_FRACTION;
  const stride = imageHeight - blendHeight;
  const y = wrappedPlaneY(offset, stride, index);
  // The lower image's feathered top must composite above the upper image's
  // opaque tail. Reassign the two tiny depth offsets when their positions wrap.
  return { y, stride, blendHeight, flipY: false, depthOffset: y >= 0 ? .001 : 0 };
}

/** Brighter cloud relief, with the nearest vapor receding during dense fire. */
export function cloudLayerVisibility(mission: MissionId, quality: GraphicsQuality, projectileDensity: number): {
  atmosphere: number; foreground: number;
} {
  if (mission === 'lastLight') return { atmosphere: 0, foreground: 0 };
  const density = Number.isFinite(projectileDensity) ? Math.max(0, Math.min(1, projectileDensity)) : 0;
  const space = ['aurora', 'graveyard', 'carrierSiege', 'dreadnought', 'lastLight'].includes(mission);
  const atmosphere = mission === 'stormbreak' ? .48 : space ? .30 : .40;
  const foreground = quality === 'low' ? 0 : quality === 'high' ? .22 : .18;
  return {
    atmosphere: atmosphere * (quality === 'low' ? .8 : 1) * (1 - density * .1),
    foreground: foreground * (1 - density * .7),
  };
}
