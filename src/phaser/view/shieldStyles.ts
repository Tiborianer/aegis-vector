export type ShieldStyle = 'hull' | 'bubble' | 'hex';
export const SHIELD_STYLE_KEY = 'aegis-vector-shield-style-v1';
export const SHIELD_STYLES = [{ value: 'hull', label: 'CONFORMAL ION FIELD' }] as const;
// Old links and local preferences may still name the retired fields.
export function resolveShieldStyle(_query = '', _saved?: string | null): ShieldStyle { return 'hull'; }
export function currentShieldStyle(_query = ''): ShieldStyle { return 'hull'; }

export const FIELD_EDGE = [[0,-46],[8,-31],[13,-16],[24,-8],[40,15],[38,25],[21,22],[15,37],[7,32],[0,35]] as const;
export const SHIELD_BREAK_MS = 420;
export const SHIELD_RESTORE_MS = 560;
export function impactSide(dx: number, dy: number, bank: number): number {
  const x = dx * Math.cos(bank) + dy * Math.sin(bank);
  const y = dy * Math.cos(bank) - dx * Math.sin(bank);
  return Math.atan2(y, x);
}
export function fieldLight(direction: number, segment: number, age: number): number {
  if (age < 0 || age >= 380) return 0;
  const distance = Math.abs(Math.atan2(Math.sin(segment-direction), Math.cos(segment-direction)));
  const travel = Math.max(0, age - distance * 65);
  return age < distance * 65 ? 0 : Math.exp(-travel / 94) * (1 - .15 * distance);
}
