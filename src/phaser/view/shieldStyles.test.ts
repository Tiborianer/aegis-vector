import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentShieldStyle, resolveShieldStyle, SHIELD_STYLES, shieldPresentation, shieldShellPixels } from './shieldStyles';

afterEach(() => vi.unstubAllGlobals());
describe('player shield presentation', () => {
  it('fixes the round Ion field despite stale Hex links or saved preferences', () => {
    expect(SHIELD_STYLES.map((style) => style.value)).toEqual(['bubble']);
    expect(resolveShieldStyle('', 'bubble')).toBe('bubble');
    expect(resolveShieldStyle('?shield=hex', 'bubble')).toBe('bubble');
    expect(resolveShieldStyle('?shield=hex', 'hex')).toBe('bubble');
    expect(resolveShieldStyle('?shield=bubble', 'hex')).toBe('bubble');
    expect(resolveShieldStyle('?shield=invalid', 'invalid')).toBe('bubble');
    expect(resolveShieldStyle('')).toBe('bubble');
    expect(resolveShieldStyle('', 'hex')).toBe('bubble');
  });
  it('does not read or mutate preferences or campaign storage to select the shield', () => {
    const getItem = vi.fn(() => 'hex'), setItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem, setItem });
    expect(currentShieldStyle('?shield=hex')).toBe('bubble');
    expect(currentShieldStyle()).toBe('bubble');
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });
  it('bakes a spherical Fresnel shell with a transparent center and soft outside edge', () => {
    const size = 256, pixels = shieldShellPixels(size);
    const alpha = (x: number, y: number) => pixels[(y * size + x) * 4 + 3];
    expect(pixels).toHaveLength(size * size * 4);
    expect(alpha(128, 128)).toBeLessThan(5);
    expect(alpha(237, 128)).toBeGreaterThan(70);
    expect(alpha(128, 237)).toBeGreaterThan(70);
    expect(alpha(250, 128)).toBeLessThan(5);
    expect(alpha(0, 0)).toBe(0);
    expect(shieldShellPixels(size)).toEqual(pixels);
  });
  it('remains usable when local storage is denied', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Denied'); } });
    expect(currentShieldStyle('?shield=bubble')).toBe('bubble');
  });
  it('hides immediately at zero charge or outside gameplay, even during a hit flash', () => {
    expect(shieldPresentation(0, 3, 0, true)).toEqual({ visible: false, opacity: 0, flash: 0 });
    expect(shieldPresentation(3, 3, 0, false)).toEqual({ visible: false, opacity: 0, flash: 0 });
  });
  it('keeps the fighter readable and fades hit feedback independently of charge count', () => {
    const calm = shieldPresentation(3, 3, Infinity, true);
    expect(calm.visible).toBe(true);
    expect(calm.opacity).toBeLessThan(.2);
    expect(calm.flash).toBe(0);
    expect(shieldPresentation(2, 3, 0, true).flash).toBe(1);
    expect(shieldPresentation(2, 3, 210, true).flash).toBe(.5);
    expect(shieldPresentation(2, 3, 420, true).flash).toBe(0);
  });
});
