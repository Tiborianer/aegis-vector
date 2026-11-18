import { describe, expect, it } from 'vitest';
import { readPlaytestMode } from './playtestMode';

describe('campaign and private playtest builds', () => {
  const off = { lab: false, debug: false, graphics: false, ending: false, god: false };
  it.each(['', '?god=1&mission=lastLight', '?lab=1', '?lab=1&mission=lastLight&loadout=max&god=1',
    '?debug=1&graphics=1&mission=fortress&god=1', '?debug=1&ending=1', '?debug=1&quick=1&story=forked-truth',
    '?lab=1&debug=1&graphics=1&ending=1&god=1'])('keeps production campaign-only for %s', (query) => {
    expect(readPlaytestMode(query, false)).toEqual(off);
  });
  it('retains explicit, local-only test sessions and their damage setting', () => {
    expect(readPlaytestMode('?mission=lastLight&god=1', true)).toEqual(off);
    expect(readPlaytestMode('?lab=1', true)).toMatchObject({ lab: true, graphics: true, god: true });
    expect(readPlaytestMode('?lab=1&god=0&ending=1', true)).toMatchObject({ god: false, ending: false });
    expect(readPlaytestMode('?debug=1&graphics=1&god=1', true)).toMatchObject({ lab: false, graphics: true, god: true });
    expect(readPlaytestMode('?debug=1&ending=1', true)).toMatchObject({ ending: true, god: false });
  });
});
