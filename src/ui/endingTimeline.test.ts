import { describe, expect, it } from 'vitest';
import { advanceEndingTime, ENDING_CREDITS, ENDING_CREDITS_COMPLETE_MS, ENDING_CREDIT_PAGE_MS, ENDING_OPENING_MS, endingFrameAt, endingFreshPressAllowed } from './endingTimeline';

describe('Homeward ending timeline', () => {
  it('opens for twelve seconds then gives five credit pages ninety seconds', () => {
    expect(ENDING_OPENING_MS).toBe(12_000);
    expect(ENDING_CREDITS.length * ENDING_CREDIT_PAGE_MS).toBe(90_000);
    expect(endingFrameAt(11_999).phase).toBe('opening');
    for (let page = 0; page < 5; page++) {
      expect(endingFrameAt(12_000 + page * 18_000)).toMatchObject({ phase: 'credits', pageIndex: page });
      expect(endingFrameAt(12_000 + (page + 1) * 18_000 - 1).pageIndex).toBe(page);
    }
  });

  it('rests on the final horizon indefinitely without an automatic exit', () => {
    expect(ENDING_CREDITS_COMPLETE_MS).toBe(102_000);
    expect(endingFrameAt(102_000)).toEqual({ phase: 'complete', pageIndex: -1, progress: 1 });
    expect(endingFrameAt(180_000)).toEqual(endingFrameAt(10_000_000));
    expect(advanceEndingTime(102_000, 999, false, false)).toBe(102_000);
  });

  it('pauses visual time for user pause and background tabs, without seeking on return', () => {
    expect(advanceEndingTime(16_000, 500, true, false)).toBe(16_000);
    expect(advanceEndingTime(16_000, 30_000, false, true)).toBe(16_000);
    expect(advanceEndingTime(16_000, 16, false, false)).toBe(16_016);
    expect(advanceEndingTime(16_000, 30_000, false, false)).toBe(17_000);
  });

  it('sanitizes timing values and prevents negative progress', () => {
    expect(endingFrameAt(-1)).toEqual(endingFrameAt(0));
    expect(endingFrameAt(Number.NaN)).toEqual(endingFrameAt(0));
    expect(advanceEndingTime(-10, -20, false, false)).toBe(0);
    expect(advanceEndingTime(100, Number.NaN, false, false)).toBe(100);
  });

  it('rejects held or repeating keys across an ending transition', () => {
    expect(endingFreshPressAllowed(true, false, false, 1000)).toBe(false);
    expect(endingFreshPressAllowed(false, true, false, 1000)).toBe(false);
    expect(endingFreshPressAllowed(false, false, true, 1000)).toBe(false);
    expect(endingFreshPressAllowed(false, false, false, 399)).toBe(false);
    expect(endingFreshPressAllowed(false, false, false, 400)).toBe(true);
  });

  it('credits only the requested people and production tools', () => {
    const names = ENDING_CREDITS.flatMap((page) => page.lines.map((line) => line.name));
    expect(names).toEqual(['Tibor Banach', 'Codex-assisted', 'Phaser', 'Blender', 'AI-assisted production', 'Homeward Vector', 'ElevenLabs', 'This horizon is yours.']);
  });
});
