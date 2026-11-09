import { asteroidShape, sceneryRandom } from './asteroidField';

/** Bake a small height-field material for native procedural rock geometry.
 * This runs once per cached texture, never in the animation loop. */
export function asteroidRelief(seed: number, size: number): Uint8ClampedArray {
  const shape = asteroidShape(seed);
  const random = sceneryRandom(seed * 6143 + 817);
  const noise = [5, 10, 20, 40, 80].map((cells) => ({ cells,
    grid: Float32Array.from({ length: (cells + 1) ** 2 }, () => random() * 2 - 1),
  }));
  const heights = new Float32Array(size * size);
  const albedo = new Float32Array(size * size);
  const mask = new Float32Array(size * size);
  const pixels = new Uint8ClampedArray(size * size * 4);
  const scale = size * .456;
  const step = 1 / scale;
  const smooth = (n: number) => n * n * (3 - 2 * n);
  const outlineAngles = shape.outline.map(({ x, y }) => (Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2));
  const radialBoundary = Float32Array.from({ length: 1025 }, (_, i) => {
    const angle = i / 1024 * Math.PI * 2;
    let segment = 0;
    while (segment < outlineAngles.length - 1 && angle >= outlineAngles[segment + 1]) segment++;
    const a = shape.outline[segment]; const b = shape.outline[(segment + 1) % shape.outline.length];
    const ex = b.x - a.x; const ey = b.y - a.y;
    return (a.x * ey - a.y * ex) / (Math.cos(angle) * ey - Math.sin(angle) * ex);
  });
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
    const px = (x - size / 2) / scale; const py = (y - size / 2) / scale;
    const angle = (Math.atan2(py, px) + Math.PI * 2) % (Math.PI * 2);
    // Intersect this ray with the polygon edge rather than approximating a disc.
    const ray = angle / (Math.PI * 2) * 1024;
    const low = Math.floor(ray); const blend = ray - low;
    const boundary = radialBoundary[low] * (1 - blend) + radialBoundary[low + 1] * blend;
    const distance = Math.hypot(px, py);
    const margin = boundary - distance;
    if (margin <= 0) continue;
    const index = y * size + x;
    mask[index] = Math.min(1, margin * scale);
    let roughness = 0; let amplitude = .090;
    for (const octave of noise) {
      const nx = x / size * octave.cells; const ny = y / size * octave.cells;
      const ix = Math.floor(nx); const iy = Math.floor(ny);
      const fx = smooth(nx - ix); const fy = smooth(ny - iy);
      const offset = iy * (octave.cells + 1) + ix;
      const top = octave.grid[offset] * (1 - fx) + octave.grid[offset + 1] * fx;
      const bottom = octave.grid[offset + octave.cells + 1] * (1 - fx) + octave.grid[offset + octave.cells + 2] * fx;
      roughness += (top * (1 - fy) + bottom * fy) * amplitude;
      amplitude *= .48;
    }
    const radius = distance / boundary;
    let height = Math.sqrt(Math.max(0, 1 - radius * radius)) * .54 + roughness;
    for (const crater of shape.craters) {
      const cx = px - crater.x; const cy = (py - crater.y) / crater.squash;
      const ratio = Math.hypot(cx, cy) / crater.radius;
      if (ratio >= 1.4) continue;
      // Smooth eroded bowl and a low uplifted rim, not black painted circles.
      const bowl = Math.max(0, 1 - ratio * ratio);
      const lip = Math.max(0, 1 - Math.abs(ratio - 1) / .28);
      height += crater.radius * (-.48 * bowl * bowl + .10 * lip * lip);
    }
    heights[index] = height;
    albedo[index] = roughness * 1.2 + (random() - .5) * .055;
  }
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
    const index = y * size + x;
    if (mask[index] === 0) continue;
    const nx = -(heights[index + 1] - heights[index - 1]) / (step * 2);
    const ny = -(heights[index + size] - heights[index - size]) / (step * 2);
    const normal = Math.hypot(nx, ny, 1);
    const light = Math.max(0, (nx * -.48 + ny * -.55 + .68) / normal);
    const shade = Math.max(.12, .20 + light * .78 + albedo[index]);
    const warm = shape.warmth;
    pixels[index * 4] = (142 + warm * 18) * shade;
    pixels[index * 4 + 1] = (155 + warm * 4) * shade;
    pixels[index * 4 + 2] = (166 - warm * 12) * shade;
    pixels[index * 4 + 3] = mask[index] * 255;
  }
  return pixels;
}
