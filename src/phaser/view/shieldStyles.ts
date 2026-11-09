export type ShieldStyle = 'hex' | 'bubble';
export const SHIELD_STYLE_KEY = 'aegis-vector-shield-style-v1';
export const SHIELD_STYLES: ReadonlyArray<{ value: ShieldStyle; label: string }> = [
  { value: 'bubble', label: 'ROUND ION SHIELD' },
];
/** The owner selected the round Ion field for every run. Legacy links and
 * preferences no longer switch it, and their stored data is left untouched. */
export function resolveShieldStyle(_query: string, _saved?: string | null): ShieldStyle {
  return 'bubble';
}
export function currentShieldStyle(_query = ''): ShieldStyle {
  return 'bubble';
}
/** View-only intensity: one visible shell for the current charge, not extra HP. */
export function shieldPresentation(cells: number, maxCells: number, sinceHitMs: number, visible: boolean): { visible: boolean; opacity: number; flash: number } {
  const active = visible && cells > 0;
  const flash = active ? Math.max(0, 1 - Math.max(0, sinceHitMs) / 420) : 0;
  return { visible: active, opacity: active ? .10 + .04 * Math.min(1, cells / Math.max(1, maxCells)) + flash * .25 : 0, flash };
}

/** A small, once-baked spherical field. Fresnel reflection lives at the edge;
 * the middle stays nearly transparent so the fighter remains fully readable.
 * Pixel shading is independent of simulation, GPU and time. */
export function shieldShellPixels(size: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(size * size * 4);
  const radius = size * .435;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = (x + .5 - size / 2) / radius;
    const ny = (y + .5 - size / 2) / radius;
    const r = Math.hypot(nx, ny);
    if (r > 1.13) continue;
    const inside = r <= 1;
    const nz = inside ? Math.sqrt(Math.max(0, 1 - r * r)) : 0;
    const fresnel = inside ? Math.pow(1 - nz, 3) : 0;
    const rim = Math.exp(-Math.pow((r - .985) / .016, 2));
    const halo = Math.exp(-Math.pow((r - 1.025) / .055, 2));
    // Broad off-axis highlight, rather than a solid white outline or disk.
    const light = Math.max(0, -nx * .46 - ny * .68 + nz * .55);
    const glint = inside ? Math.pow(light, 28) : 0;
    const lower = Math.max(0, ny * .5 + nx * .25);
    const offset = (y * size + x) * 4;
    pixels[offset] = 52 + lower * 70 + glint * 125 + rim * 45;
    pixels[offset + 1] = 151 + fresnel * 48 + glint * 95;
    pixels[offset + 2] = 255;
    pixels[offset + 3] = 255 * Math.min(.64,
      (inside ? .006 + fresnel * .17 + glint * .15 : 0) + rim * .30 + halo * .045);
  }
  return pixels;
}
