import { describe, expect, it } from 'vitest';
import { buildMusicVoiceSchedule, MUSIC_ASSETS } from './SoundEngine';

describe('music asset loop strategy', () => {
  it('uses tail crossfades for every long-form track', () => {
    expect(MUSIC_ASSETS.menu.loop).toEqual({ mode: 'tail', tailSeconds: 24, crossfadeSeconds: 1.5 });
    expect(MUSIC_ASSETS.hangar.loop).toEqual({ mode: 'tail', tailSeconds: 24, crossfadeSeconds: 1.5 });
    expect(MUSIC_ASSETS['mission-coastal'].loop).toEqual({ mode: 'tail', tailSeconds: 32, crossfadeSeconds: 1 });
    expect(MUSIC_ASSETS.boss.loop).toEqual({ mode: 'tail', tailSeconds: 32, crossfadeSeconds: 1.2 });
  });

  it('keeps stings as one-shots', () => {
    expect(MUSIC_ASSETS.victory.loop).toEqual({ mode: 'none' });
    expect(MUSIC_ASSETS.defeat.loop).toEqual({ mode: 'none' });
  });

  it('crossfades a 180-second mission into its tail without a full-file restart', () => {
    const schedule = buildMusicVoiceSchedule(180.036, MUSIC_ASSETS['mission-coastal'].loop, 3);
    expect(schedule).toHaveLength(4);
    expect(schedule[0]).toMatchObject({ startSeconds: 0, offsetSeconds: 0, durationSeconds: 180.036, iteration: 0 });
    expect(schedule[1]).toMatchObject({ startSeconds: 179.036, offsetSeconds: 148.036, durationSeconds: 32, iteration: 1 });
    expect(schedule[2].startSeconds).toBeCloseTo(210.036);
    const playingAt185 = schedule.filter((voice) => voice.startSeconds <= 185 && voice.startSeconds + voice.durationSeconds > 185);
    expect(playingAt185.map((voice) => voice.iteration)).toEqual([1]);
  });

  it('keeps hangar audio covered beyond 100 seconds with overlapping tail voices', () => {
    const schedule = buildMusicVoiceSchedule(75.05, MUSIC_ASSETS.hangar.loop, 4);
    const playingAt100 = schedule.filter((voice) => voice.startSeconds <= 100 && voice.startSeconds + voice.durationSeconds > 100);
    expect(playingAt100.length).toBeGreaterThanOrEqual(1);
    expect(schedule.every((voice) => voice.offsetSeconds === 0 || voice.offsetSeconds === 51.05)).toBe(true);
  });
});
