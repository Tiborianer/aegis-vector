import { describe, expect, it } from 'vitest';
import { MINIBOSSES, minibossForMission } from './minibosses';

describe('campaign minibosses', () => {
  it('adds three distinct command encounters', () => {
    expect(MINIBOSSES.map(({ kind }) => kind)).toEqual(['razorwing', 'gatekeeper', 'pursuer']);
    expect(new Set(MINIBOSSES.map(({ kind }) => kind)).size).toBe(3);
  });

  it('uses a route-specific Pursuer encounter', () => {
    expect(minibossForMission('stormbreak')?.kind).toBe('pursuer');
    expect(minibossForMission('graveyard')?.kind).toBe('pursuer');
    expect(minibossForMission('minefield')).toBeUndefined();
  });
});
