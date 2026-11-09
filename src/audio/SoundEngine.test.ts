import { describe, expect, it, vi } from 'vitest';
import { buildMusicVoiceSchedule, missionScoreLoop, MUSIC_ASSETS, MISSION_SCORE_STATUS, RADIO_TRIM_DB, RADIO_TRIM_GAIN, SoundEngine, VOICE_ASSETS } from './SoundEngine';
import radioFiles from './radio-files.json';

describe('music asset loop strategy', () => {
  it('uses only reviewed new mission scores and retains explicit beds until then', () => {
    expect(Object.keys(MISSION_SCORE_STATUS)).toHaveLength(6);
    for (const track of Object.keys(MISSION_SCORE_STATUS) as Array<keyof typeof MISSION_SCORE_STATUS>) {
      const score = MISSION_SCORE_STATUS[track];
      expect(MUSIC_ASSETS[track].files).toEqual([score.status === 'reviewed' && score.file ? score.file : score.fallback]);
      expect(MUSIC_ASSETS[track].loop).toEqual(score.status === 'reviewed' && score.file
        ? missionScoreLoop(track) : { mode: 'tail', tailSeconds: 40, crossfadeSeconds: 2 });
      const schedule = buildMusicVoiceSchedule(180, MUSIC_ASSETS[track].loop, 12);
      for (let second = 0; second < 600; second++) {
        expect(schedule.some((voice) => second >= voice.startSeconds && second < voice.startSeconds + voice.durationSeconds)).toBe(true);
      }
    }
  });

  it('activates the six owner-approved November 8 recordings without reusing temporary beds', () => {
    for (const [track, version] of Object.entries({
      'mission-stormbreak': 2, 'mission-graveyard': 2, 'mission-carrier-siege': 2,
      'mission-dreadnought': 2, 'mission-last-light': 2, 'mission-aurora': 1,
    })) {
      const key = track as keyof typeof MISSION_SCORE_STATUS;
      expect(MISSION_SCORE_STATUS[key]).toMatchObject({
        file: `audio/missions/${track}-v${version}.mp3`, status: 'reviewed',
        review: expect.stringContaining('2026-11-08: Approve all six scores'),
      });
      expect(MUSIC_ASSETS[key].files).toEqual([MISSION_SCORE_STATUS[key].file]);
    }
    expect(MISSION_SCORE_STATUS['mission-aurora']).toMatchObject({
      fallback: 'audio/mission-coastal.mp3',
      requestedDurationSeconds: 180,
    });
  });

  it('uses the reviewed endpoints for each active score and preserves the complete Carrier Siege recording', () => {
    for (const [track, endSeconds] of Object.entries({
      'mission-stormbreak': 172, 'mission-graveyard': 174, 'mission-dreadnought': 177,
      'mission-last-light': 205, 'mission-aurora': 176,
    })) {
      expect(missionScoreLoop(track as keyof typeof MISSION_SCORE_STATUS))
        .toEqual({ mode: 'tail', tailSeconds: 40, crossfadeSeconds: 2, endSeconds });
    }
    expect(missionScoreLoop('mission-carrier-siege')).toEqual({ mode: 'tail', tailSeconds: 40, crossfadeSeconds: 2 });
  });

  it('ends Graveyard playback at 174 seconds and crossfades its 134–174-second tail every 38 seconds', () => {
    const schedule = buildMusicVoiceSchedule(180.03591836734694, missionScoreLoop('mission-graveyard'), 3);
    expect(schedule[0]).toEqual({ startSeconds: 0, offsetSeconds: 0, durationSeconds: 174, crossfadeSeconds: 2, iteration: 0 });
    expect(schedule[1]).toEqual({ startSeconds: 172, offsetSeconds: 134, durationSeconds: 40, crossfadeSeconds: 2, iteration: 1 });
    expect(schedule[2].startSeconds).toBe(210);
    expect(schedule[3].startSeconds).toBe(248);
    expect(schedule.every((voice) => voice.offsetSeconds + voice.durationSeconds <= 174)).toBe(true);
  });

  it('clamps endpoints to the decoded file and ignores nonpositive or nonfinite endpoints', () => {
    const base = { mode: 'tail' as const, tailSeconds: 40, crossfadeSeconds: 2 };
    for (const endSeconds of [180, 1000, 0, -2, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(buildMusicVoiceSchedule(180, { ...base, endSeconds }, 2)).toEqual(buildMusicVoiceSchedule(180, base, 2));
    }
    const short = buildMusicVoiceSchedule(180, { ...base, endSeconds: 1 }, 2);
    expect(short[0].durationSeconds).toBe(1);
    expect(short.every((voice) => Number.isFinite(voice.startSeconds) && voice.startSeconds >= 0
      && voice.offsetSeconds >= 0 && voice.durationSeconds > 0 && voice.offsetSeconds + voice.durationSeconds <= 1)).toBe(true);
    for (const duration of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(buildMusicVoiceSchedule(duration, base)).toEqual([]);
    }
  });

  it('keeps schedules finite and positive for malformed tail and crossfade values', () => {
    for (const tailSeconds of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      for (const crossfadeSeconds of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
        const schedule = buildMusicVoiceSchedule(180, { mode: 'tail', tailSeconds, crossfadeSeconds, endSeconds: 174 }, 2);
        expect(schedule).toHaveLength(3);
        expect(schedule.every((voice) => Object.values(voice).every(Number.isFinite)
          && voice.durationSeconds > 0 && voice.startSeconds >= 0 && voice.offsetSeconds >= 0 && voice.crossfadeSeconds >= 0)).toBe(true);
      }
    }
  });

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

  it('keeps cinematic music continuous for slow readers without restarting the whole cue', () => {
    for (const track of ['story-discovery', 'story-revelation'] as const) {
      const definition = MUSIC_ASSETS[track];
      expect(definition.gain).toBeLessThan(MUSIC_ASSETS.hangar.gain);
      expect(definition.loop).toEqual({ mode: 'tail', tailSeconds: 44, crossfadeSeconds: 3 });
      const schedule = buildMusicVoiceSchedule(180, definition.loop, 8);
      expect(schedule[1]).toMatchObject({ startSeconds: 177, offsetSeconds: 136, durationSeconds: 44 });
      for (let second = 0; second < 480; second++) {
        expect(schedule.some((voice) => second >= voice.startSeconds && second < voice.startSeconds + voice.durationSeconds)).toBe(true);
      }
    }
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

describe('one-shot music replay lifecycle', () => {
  it('ignores the old fading ending voice while clearing the replacement on its own natural end', async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { location: { search: '' }, dispatchEvent });
    vi.stubGlobal('localStorage', { getItem: () => null });
    vi.stubGlobal('CustomEvent', class extends Event {
      readonly detail: unknown;
      constructor(type: string, init: CustomEventInit) {
        super(type);
        this.detail = init.detail;
      }
    });
    try {
      const createGain = () => ({
        gain: {
          value: 1,
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
          cancelScheduledValues: vi.fn(),
          setValueCurveAtTime: vi.fn(),
        },
        connect: vi.fn((destination: unknown) => destination),
      });
      const createSource = () => Object.assign(new EventTarget(), {
        buffer: null,
        connect: vi.fn((destination: unknown) => destination),
        start: vi.fn(),
        stop: vi.fn(),
      });
      const sources: ReturnType<typeof createSource>[] = [];
      const context = {
        currentTime: 10,
        state: 'running',
        createGain,
        createBufferSource: () => {
          const source = createSource();
          sources.push(source);
          return source;
        },
      };
      const buffer = {
        duration: 120,
        length: 4,
        numberOfChannels: 1,
        getChannelData: () => new Float32Array([0.1, -0.1, 0.1, -0.1]),
      };
      const engine = new SoundEngine();
      // Supply only browser audio primitives; exercise the real public playback path.
      Object.assign(engine, {
        context,
        musicBus: createGain(),
        buffers: new Map([[MUSIC_ASSETS.ending.files[0], buffer]]),
      });
      const runtime = engine as unknown as { activeMusic?: unknown };

      await engine.playMusic('ending');
      const original = runtime.activeMusic;
      engine.stopMusic(0.6);
      expect(sources[0].stop).toHaveBeenCalledOnce();
      await engine.playMusic('ending');
      const replacement = runtime.activeMusic;
      expect(replacement).toBeDefined();
      expect(replacement).not.toBe(original);
      expect(sources).toHaveLength(2);
      expect(engine.getDebugState()).toMatchObject({ currentTrack: 'ending', playbackState: 'playing', logicalStartCount: 2 });

      const eventsBeforeOldEnd = dispatchEvent.mock.calls.length;
      sources[0].dispatchEvent(new Event('ended'));
      expect(runtime.activeMusic).toBe(replacement);
      expect(engine.getDebugState()).toMatchObject({ currentTrack: 'ending', playbackState: 'playing' });
      expect(dispatchEvent).toHaveBeenCalledTimes(eventsBeforeOldEnd);

      sources[1].dispatchEvent(new Event('ended'));
      expect(runtime.activeMusic).toBeUndefined();
      expect(engine.getDebugState()).toMatchObject({ currentTrack: undefined, playbackState: 'locked' });
      expect(dispatchEvent).toHaveBeenCalledTimes(eventsBeforeOldEnd + 1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('radio voice assets', () => {
  it('maps the eleven production recordings and preserves subtitle fallbacks', () => {
    expect(Object.keys(VOICE_ASSETS)).toHaveLength(11);
    expect(VOICE_ASSETS['shield-hit']).toMatchObject({ file: 'audio/voice-v5/shield-hit.wav', subtitle: 'Shield hit.', priority: 'status', transient: true, cooldownMs: 6_000 });
    expect(VOICE_ASSETS['shield-down'].file).toBe('audio/voice-v2/shield-down.wav');
    expect(VOICE_ASSETS['hull-critical'].file).toBe('audio/voice-v2/hull-critical.wav');
    expect(VOICE_ASSETS['arc-upgraded'].file).toBe('audio/voice-v3/arc-upgraded.wav');
    expect(VOICE_ASSETS['ion-upgraded'].file).toBe('audio/voice-v4/ion-upgraded.wav');
    expect(VOICE_ASSETS['ion-upgraded'].subtitle).toBe('ION conductor upgraded.');
    expect(VOICE_ASSETS['shield-restored'].file).toBe('audio/voice-v2/shield-restored.wav');
    expect(Object.values(VOICE_ASSETS).filter((asset) => asset.speaker === 'Vale')).toHaveLength(6);
    expect(Object.values(VOICE_ASSETS).filter((asset) => asset.speaker === 'ECHO-7')).toHaveLength(5);
    expect(Object.fromEntries(Object.entries(VOICE_ASSETS).map(([cue, asset]) => [cue, asset.file]))).toEqual(radioFiles);
    expect(Object.values(VOICE_ASSETS).filter((asset) => asset.file.startsWith('audio/voice-v2/'))).toHaveLength(8);
    expect(Object.values(VOICE_ASSETS).filter((asset) => asset.file.startsWith('audio/voice-v3/'))).toHaveLength(1);
    expect(Object.values(VOICE_ASSETS).filter((asset) => asset.file.startsWith('audio/voice-v4/'))).toHaveLength(1);
    expect(Object.values(VOICE_ASSETS).filter((asset) => asset.file.startsWith('audio/voice-v5/'))).toHaveLength(1);
    expect(Object.values(VOICE_ASSETS).every((asset) => asset.file.endsWith('.wav'))).toBe(true);
    expect(Object.values(VOICE_ASSETS).every((asset) => asset.gain === .52)).toBe(true);
    expect(RADIO_TRIM_DB).toBe(-6);
    expect(RADIO_TRIM_GAIN).toBeCloseTo(.501187, 5);
  });
});
