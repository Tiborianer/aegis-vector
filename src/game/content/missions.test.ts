import { describe, expect, it } from 'vitest';
import { getMissionById } from './missions';

describe('Dreadnought approach', () => {
  it('starts with a thirty-second escort before the boss soundtrack transition', () => {
    const finale = getMissionById('dreadnought');
    expect(finale.durationMs).toBe(150_000);
    expect(finale.approachDurationMs).toBe(30_000);
    expect(finale.music).toBe('mission-fortress');
    expect(finale.finale).toBe(true);
  });
});
