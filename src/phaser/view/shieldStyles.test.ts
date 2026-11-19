import { describe,it,expect } from 'vitest';
import { currentShieldStyle, resolveShieldStyle, impactSide, fieldLight } from './shieldStyles';
describe('conformal shield', () => {
  it('uses the hull silhouette on legacy links and legacy saves', () => {
    expect(resolveShieldStyle('?shield=hex','bubble')).toBe('hull');
    expect(currentShieldStyle()).toBe('hull');
  });
  it('lights the struck plate before the opposite side, relative to current bank', () => {
    const right = impactSide(100,0,0);
    expect(fieldLight(right,0,12)).toBeGreaterThan(.8);
    expect(fieldLight(right,Math.PI,12)).toBe(0);
    expect(fieldLight(right,Math.PI,215)).toBeGreaterThan(0);
    expect(fieldLight(right,0,500)).toBe(0);
    expect(impactSide(0,1,Math.PI/2)).toBeCloseTo(0);
  });
});