import type { GraphicsQuality } from '../simulation/types';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../content/balance';

export interface RockPoint { x: number; y: number }
export interface RockCrater { x: number; y: number; radius: number; squash: number }
export interface AsteroidShape {
  outline: RockPoint[];
  facets: RockPoint[][];
  craters: RockCrater[];
  fissures: RockPoint[][];
  warmth: number;
}
export interface AsteroidDefinition {
  id: number;
  shape: number;
  layer: 'distant' | 'middle' | 'near';
  x: number;
  y: number;
  size: number;
  stretch: number;
  speed: number;
  spin: number;
  rotation: number;
  depth: number;
  alpha: number;
}

/** Presentation never consumes encounter/offer randomness. */
export function sceneryRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

/** Unit-space sculpted fragments with flattened, notched and elongated
 * silhouettes. Craters and fractures are stable across refreshes. */
export function asteroidShape(seed: number): AsteroidShape {
  const random = sceneryRandom(seed * 9173 + 7907);
  const count = 13 + seed % 5;
  const stretch = .70 + random() * .26;
  const outline = Array.from({ length: count }, (_, i) => {
    const angle = i / count * Math.PI * 2;
    const radius = (.77 + random() * .20) * (i === seed % count ? .60 : 1);
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * stretch };
  });
  const core = { x: -.09 + random() * .18, y: -.08 + random() * .16 };
  const facets = outline.map((point, i) => [point, outline[(i + 1) % count], core]);
  const craters = Array.from({ length: 7 + seed % 5 }, (_, i) => {
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * .54;
    return {
      x: Math.cos(angle) * distance, y: Math.sin(angle) * distance * stretch,
      radius: i < 2 ? .12 + random() * .10 : .025 + random() * .065,
      squash: .66 + random() * .25,
    };
  });
  const fissures = Array.from({ length: 3 }, (_, i) => {
    const start = outline[(seed + i * 4) % count];
    return [start, { x: start.x * .65 + random() * .1, y: start.y * .65 },
      { x: start.x * .35, y: start.y * .38 + random() * .10 }];
  });
  return { outline, facets, craters, fissures, warmth: random() };
}

export const ASTEROID_TEXTURE_COUNT = 9;
export const ASTEROID_FIELD_HEIGHT = WORLD_HEIGHT + 600;
/** World pixels per second. Fast foreground fly-bys sell forward flight while
 * the remote field remains readable. Rotation is deliberately independent. */
export const ASTEROID_FLIGHT_SPEED = {
  distant: { minimum: 8, variation: 6 },
  middle: { minimum: 32, variation: 16 },
  near: { minimum: 88, variation: 32 },
} as const;
export const ASTEROID_REDUCED_MOTION_FACTOR = .04;

/** Large, detailed near fragments stay at the margins. Small rocks may cross
 * the center, but all layers remain behind every gameplay object. */
export function makeAsteroidField(quality: GraphicsQuality): AsteroidDefinition[] {
  const random = sceneryRandom(0xae615);
  const layers = quality === 'low' ? { distant: 5, middle: 3, near: 2 }
    : quality === 'high' ? { distant: 13, middle: 7, near: 4 } : { distant: 9, middle: 5, near: 3 };
  const asteroids: AsteroidDefinition[] = [];
  for (const layer of ['distant', 'middle', 'near'] as const) {
    for (let i = 0; i < layers[layer]; i++) {
      const size = layer === 'near' ? 150 + random() * 125 : layer === 'middle' ? 62 + random() * 62 : 18 + random() * 32;
      const id = asteroids.length;
      asteroids.push({
        id, shape: id % ASTEROID_TEXTURE_COUNT, layer,
        x: layer === 'near' ? (i % 2 === 0 ? 48 + random() * 75 : WORLD_WIDTH - 48 - random() * 75) : random() * WORLD_WIDTH,
        y: (i / layers[layer]) * ASTEROID_FIELD_HEIGHT - 240 + random() * 120,
        size, stretch: .78 + random() * .35,
        speed: ASTEROID_FLIGHT_SPEED[layer].minimum + random() * ASTEROID_FLIGHT_SPEED[layer].variation,
        spin: (random() > .5 ? 1 : -1) * (.012 + random() * .035),
        rotation: random() * Math.PI * 2,
        depth: layer === 'near' ? -7 : layer === 'middle' ? -14 : -17,
        alpha: layer === 'near' ? .76 : layer === 'middle' ? .63 : .42,
      });
    }
  }
  return asteroids;
}

export function asteroidFrame(rock: AsteroidDefinition, elapsedMs: number, follow: number, reducedMotion: boolean): {
  x: number; y: number; rotation: number;
} {
  const seconds = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0) / 1000;
  // Keep accessibility mode at the previous gentle drift, not 20% of the much
  // faster new flight speed. Neither mode changes collision or encounter time.
  const motion = reducedMotion ? ASTEROID_REDUCED_MOTION_FACTOR : 1;
  const parallax = rock.layer === 'near' ? 26 : rock.layer === 'middle' ? 12 : 5;
  const wrapped = ((rock.y + 300 + seconds * rock.speed * motion) % ASTEROID_FIELD_HEIGHT + ASTEROID_FIELD_HEIGHT) % ASTEROID_FIELD_HEIGHT;
  return {
    x: rock.x - (reducedMotion ? 0 : follow * parallax), y: wrapped - 300,
    rotation: rock.rotation + (reducedMotion ? 0 : seconds * rock.spin),
  };
}

export function asteroidAlpha(rock: AsteroidDefinition, density: number): number {
  const fire = Number.isFinite(density) ? Math.max(0, Math.min(1, density)) : 0;
  return rock.alpha * (1 - fire * (rock.layer === 'near' ? .30 : .15));
}

/** Remote, very faint meteor with long quiet intervals; not a combat cue. */
export function distantMeteorFrame(elapsedMs: number, reducedMotion: boolean): {
  visible: boolean; x: number; y: number; alpha: number;
} {
  const progress = (Math.max(0, elapsedMs) % 23_000 - 12_000) / 2_600;
  return {
    visible: !reducedMotion && progress >= 0 && progress <= 1,
    x: -120 + progress * 1_180, y: 40 + progress * 240,
    alpha: Math.max(0, Math.sin(Math.max(0, Math.min(1, progress)) * Math.PI)) * .18,
  };
}
