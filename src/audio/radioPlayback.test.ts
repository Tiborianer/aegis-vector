import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { missionScoreLoop, MUSIC_ASSETS, RADIO_TRIM_GAIN, SoundEngine, VOICE_ASSETS, type RadioCue } from './SoundEngine';
import radioFiles from './radio-files.json';

// Browser primitives are mocked, but preload, routing, gain normalization,
// subtitle events, interruption and music lifecycle use SoundEngine's public API.
const FIXTURE_AMPLITUDE = 0.125;
const FIXTURE_CORRECTION = 10 ** (-18 / 20) / FIXTURE_AMPLITUDE;
const BASE_URI = 'https://preview.example/aegis-vector/index.html';

function audioParam(value = 0) {
  const param = {
    value,
    setValueAtTime: vi.fn((next: number) => { param.value = next; }),
    setTargetAtTime: vi.fn((next: number) => { param.value = next; }),
    exponentialRampToValueAtTime: vi.fn((next: number) => { param.value = next; }),
    cancelScheduledValues: vi.fn(),
    setValueCurveAtTime: vi.fn(),
  };
  return param;
}

function audioNode() {
  return Object.assign(new EventTarget(), {
    connections: [] as unknown[],
    connect(destination: unknown) {
      this.connections.push(destination);
      return destination;
    },
  });
}

function gainNode() {
  return Object.assign(audioNode(), { gain: audioParam(1) });
}

function bufferSource() {
  return Object.assign(audioNode(), {
    buffer: null as ReturnType<typeof decodedBuffer> | null,
    start: vi.fn(),
    stop: vi.fn(),
  });
}

function decodedBuffer(file: string) {
  const data = Float32Array.from([1, -1, 1, -1, 1, -1, 1, -1], (value) => value * FIXTURE_AMPLITUDE);
  return {
    file,
    duration: file.endsWith('.wav') ? 1.25 : 90,
    length: data.length,
    numberOfChannels: 1,
    getChannelData: () => data,
  };
}

class MockAudioContext extends EventTarget {
  currentTime = 10;
  state = 'running';
  destination = audioNode();
  gains: ReturnType<typeof gainNode>[] = [];
  sources: ReturnType<typeof bufferSource>[] = [];
  failedDecodeFile?: string;
  resume = vi.fn(async () => { this.state = 'running'; });
  decodeAudioData = vi.fn(async (bytes: ArrayBuffer) => {
    const file = new TextDecoder().decode(bytes);
    if (file === this.failedDecodeFile) throw new Error(`Decode failed: ${file}`);
    return decodedBuffer(file);
  });
  createGain() {
    const node = gainNode();
    this.gains.push(node);
    return node;
  }
  createBufferSource() {
    const node = bufferSource();
    this.sources.push(node);
    return node;
  }
  createBiquadFilter() {
    return Object.assign(audioNode(), { type: 'lowpass', frequency: audioParam(), Q: audioParam(), gain: audioParam() });
  }
  createDynamicsCompressor() {
    return Object.assign(audioNode(), {
      threshold: audioParam(), knee: audioParam(), ratio: audioParam(), attack: audioParam(), release: audioParam(),
    });
  }
}

interface RadioEventDetail {
  active: boolean;
  cue: RadioCue;
  speaker?: string;
  subtitle?: string;
  subtitles?: boolean;
}

async function flushAudioPromises() {
  // Each fetch/arrayBuffer/decode/preload stage schedules only promise microtasks.
  // No real-time sleeps or automatically fired mock ended events are needed.
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

function harness(options: { failedDecodeFile?: string; emptyFile?: string } = {}) {
  const context = new MockAudioContext();
  context.failedDecodeFile = options.failedDecodeFile;
  const radioEvents: RadioEventDetail[] = [];
  const dispatchEvent = vi.fn((event: CustomEvent<RadioEventDetail>) => {
    if (event.type === 'aegis:radio-state') radioEvents.push(event.detail);
    return true;
  });
  const storage = new Map<string, string>();
  const fetchMock = vi.fn(async (url: URL) => {
    const file = url.pathname.replace('/aegis-vector/', '');
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => file === options.emptyFile ? new ArrayBuffer(0) : new TextEncoder().encode(file).buffer,
    };
  });
  vi.stubGlobal('window', {
    location: { search: '' }, dispatchEvent,
    setTimeout: (handler: () => void, milliseconds: number) => setTimeout(handler, milliseconds),
    clearTimeout: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
  });
  vi.stubGlobal('document', { baseURI: BASE_URI });
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.stubGlobal('CustomEvent', class extends Event {
    readonly detail: unknown;
    constructor(type: string, init: CustomEventInit) {
      super(type);
      this.detail = init.detail;
    }
  });
  vi.stubGlobal('AudioContext', class { constructor() { return context; } });
  vi.stubGlobal('fetch', fetchMock);
  const engine = new SoundEngine();
  return { context, engine, radioEvents, fetchMock, storage };
}

async function unlockedHarness(options: Parameters<typeof harness>[0] = {}) {
  const fixture = harness(options);
  await fixture.engine.unlock();
  await flushAudioPromises();
  return fixture;
}

function mostRecentVoice(context: MockAudioContext) {
  const source = context.sources.filter((candidate) => candidate.buffer?.file.endsWith('.wav')).at(-1);
  expect(source).toBeDefined();
  return source!;
}

function gainAutomation(node: ReturnType<typeof gainNode>) {
  return {
    value: node.gain.value,
    set: [...node.gain.setValueAtTime.mock.calls],
    target: [...node.gain.setTargetAtTime.mock.calls],
    ramp: [...node.gain.exponentialRampToValueAtTime.mock.calls],
    cancel: [...node.gain.cancelScheduledValues.mock.calls],
    curve: [...node.gain.setValueCurveAtTime.mock.calls],
  };
}

describe('versioned radio browser playback', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('preloads and browser-decodes exactly the eleven active mapped files using the deployment base path', async () => {
    const { context, engine, fetchMock } = await unlockedHarness();
    const expectedFiles = Object.values(VOICE_ASSETS).map(({ file }) => file);
    expect(expectedFiles).toHaveLength(11);
    expect([...expectedFiles].sort()).toEqual(Object.values(radioFiles).sort());
    expect(fetchMock.mock.calls.map(([url]) => url.href).sort()).toEqual(expectedFiles.map((file) => new URL(file, BASE_URI).href).sort());
    expect(context.decodeAudioData).toHaveBeenCalledTimes(11);
    expect(context.decodeAudioData.mock.calls.map(([bytes]) => new TextDecoder().decode(bytes)).sort()).toEqual([...expectedFiles].sort());
    expect(engine.getDebugState()).toMatchObject({
      voiceAssetCheckComplete: true, voiceAssetsReady: 11, voiceAssetsMissing: 0,
      lastVoiceError: undefined, radioTrimDb: -6, radioTrimGain: RADIO_TRIM_GAIN,
    });

    // Playback reuses the decoded file; preloading is not counted as playing.
    expect(context.sources).toHaveLength(0);
    engine.playRadio('shield-down');
    await flushAudioPromises();
    expect(fetchMock).toHaveBeenCalledTimes(11);
    expect(context.decodeAudioData).toHaveBeenCalledTimes(11);
    expect(mostRecentVoice(context).start).toHaveBeenCalledOnce();
  });

  it.each([0, 0.5, 1])('applies Voice %s independently after the exact -6dB cue trim', async (volume) => {
    const { context, engine, radioEvents } = await unlockedHarness();
    engine.setVoiceVolume(volume);
    engine.playRadio('shield-hit');
    await flushAudioPromises();
    const voiceBus = context.gains[3];
    expect(voiceBus.gain.setTargetAtTime).toHaveBeenLastCalledWith(volume, 10, 0.03);
    expect(engine.getDebugState().voiceGain).toBe(volume);
    expect(radioEvents.at(-1)).toMatchObject({ active: true, cue: 'shield-hit', subtitles: true, subtitle: 'Shield hit.' });
    if (volume === 0) {
      expect(context.sources).toHaveLength(0);
      expect(engine.getDebugState().voicePlaybackState).toBe('subtitle-only');
    } else {
      const source = mostRecentVoice(context);
      const cueGain = source.connections[0] as ReturnType<typeof gainNode>;
      expect(cueGain.connections).toEqual([voiceBus]);
      expect(cueGain.gain.value).toBeCloseTo(.52 * FIXTURE_CORRECTION * 10 ** (-6 / 20), 12);
      expect(cueGain.gain.value * voiceBus.gain.value).toBeCloseTo(.52 * FIXTURE_CORRECTION * RADIO_TRIM_GAIN * volume, 12);
      expect(engine.getDebugState()).toMatchObject({ voicePlaybackState: 'playing', voiceDurationSeconds: 1.25 });
      expect(engine.getDebugState().voiceGainCorrection).toBeCloseTo(FIXTURE_CORRECTION, 12);
    }
  });

  it('changes the Voice slider during playback without restarting the current line', async () => {
    const { context, engine } = await unlockedHarness();
    engine.playRadio('shield-restored');
    await flushAudioPromises();
    const source = mostRecentVoice(context);
    for (const volume of [0, 0.5, 1]) {
      engine.setVoiceVolume(volume);
      expect(context.gains[3].gain.value).toBe(volume);
      expect(engine.getDebugState().activeRadioCue).toBe('shield-restored');
    }
    expect(context.sources).toHaveLength(1);
    expect(source.start).toHaveBeenCalledOnce();
    expect(source.stop).not.toHaveBeenCalled();
  });

  it('critical warnings interrupt upgrades, and lower-priority cues wait for the warning to finish', async () => {
    const { context, engine, radioEvents } = await unlockedHarness();
    engine.playRadio('arc-upgraded');
    await flushAudioPromises();
    const upgrade = mostRecentVoice(context);
    engine.playRadio('hull-critical');
    await flushAudioPromises();
    const critical = mostRecentVoice(context);
    expect(upgrade.stop).toHaveBeenCalledOnce();
    expect(critical).not.toBe(upgrade);
    expect(critical.buffer?.file).toBe(VOICE_ASSETS['hull-critical'].file);
    expect(engine.getDebugState().activeRadioCue).toBe('hull-critical');
    expect(radioEvents.slice(-2)).toMatchObject([
      { active: false, cue: 'arc-upgraded' }, { active: true, cue: 'hull-critical' },
    ]);

    // The interrupted source can deliver its ended event after the warning starts.
    upgrade.dispatchEvent(new Event('ended'));
    expect(engine.getDebugState().activeRadioCue).toBe('hull-critical');
    engine.playRadio('nova-upgraded');
    await flushAudioPromises();
    expect(critical.stop).not.toHaveBeenCalled();
    expect(context.sources).toHaveLength(2);
    critical.dispatchEvent(new Event('ended'));
    await flushAudioPromises();
    expect(mostRecentVoice(context).buffer?.file).toBe(VOICE_ASSETS['nova-upgraded'].file);
    expect(engine.getDebugState().activeRadioCue).toBe('nova-upgraded');
    expect(context.sources).toHaveLength(3);
  });

  it('limits Shield Hit to once per six seconds and lets shield-down interrupt it immediately', async () => {
    const { context, engine, radioEvents } = await unlockedHarness();
    engine.playRadio('shield-hit');
    await flushAudioPromises();
    const firstHit = mostRecentVoice(context);
    firstHit.dispatchEvent(new Event('ended'));
    await vi.advanceTimersByTimeAsync(5_999);
    engine.playRadio('shield-hit');
    await flushAudioPromises();
    expect(context.sources).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    engine.playRadio('shield-hit');
    await flushAudioPromises();
    const secondHit = mostRecentVoice(context);
    expect(context.sources).toHaveLength(2);
    engine.playRadio('shield-down');
    await flushAudioPromises();
    expect(secondHit.stop).toHaveBeenCalledOnce();
    expect(engine.getDebugState().activeRadioCue).toBe('shield-down');
    secondHit.dispatchEvent(new Event('ended'));
    expect(engine.getDebugState().activeRadioCue).toBe('shield-down');
    expect(radioEvents.filter((event) => event.active && event.cue === 'shield-hit')).toHaveLength(2);
  });

  it('discards an interrupted slow Shield Hit decode even after a new Shield Hit starts', async () => {
    const { context, engine, radioEvents } = harness();
    const delayedDecodes: Array<() => void> = [];
    let holdHitDecodes = true;
    context.decodeAudioData.mockImplementation(async (bytes: ArrayBuffer) => {
      const file = new TextDecoder().decode(bytes);
      if (holdHitDecodes && file === VOICE_ASSETS['shield-hit'].file) {
        return new Promise<ReturnType<typeof decodedBuffer>>((resolve) => {
          delayedDecodes.push(() => resolve(decodedBuffer(file)));
        });
      }
      return decodedBuffer(file);
    });
    await engine.unlock();
    await flushAudioPromises();
    engine.playRadio('shield-hit');
    await flushAudioPromises();
    expect(engine.getDebugState()).toMatchObject({ activeRadioCue: 'shield-hit', voicePlaybackState: 'loading' });
    expect(delayedDecodes).toHaveLength(2); // Initial preload plus the first requested transmission.

    engine.playRadio('shield-down');
    await flushAudioPromises();
    mostRecentVoice(context).dispatchEvent(new Event('ended'));
    await vi.advanceTimersByTimeAsync(6_000);
    holdHitDecodes = false;
    engine.playRadio('shield-hit');
    await flushAudioPromises();
    const currentHit = mostRecentVoice(context);
    const startedBeforeLateDecode = context.sources.length;
    expect(currentHit.buffer?.file).toBe(VOICE_ASSETS['shield-hit'].file);

    delayedDecodes.forEach((resolve) => resolve());
    await flushAudioPromises();
    expect(context.sources).toHaveLength(startedBeforeLateDecode);
    expect(engine.getDebugState()).toMatchObject({ activeRadioCue: 'shield-hit', voicePlaybackState: 'playing' });
    expect(currentHit.start).toHaveBeenCalledOnce();
    expect(currentHit.stop).not.toHaveBeenCalled();
    expect(radioEvents.filter((event) => event.active && event.cue === 'shield-hit')).toHaveLength(2);
    currentHit.dispatchEvent(new Event('ended'));
    expect(engine.getDebugState().activeRadioCue).toBeUndefined();
  });

  it('ignores an old interrupted source ending after the same cue starts again', async () => {
    const { context, engine, radioEvents } = await unlockedHarness();
    engine.playRadio('shield-hit');
    await flushAudioPromises();
    const interruptedHit = mostRecentVoice(context);
    engine.playRadio('shield-down');
    await flushAudioPromises();
    expect(interruptedHit.stop).toHaveBeenCalledOnce();
    mostRecentVoice(context).dispatchEvent(new Event('ended'));
    await vi.advanceTimersByTimeAsync(6_000);
    engine.playRadio('shield-hit');
    await flushAudioPromises();
    const currentHit = mostRecentVoice(context);
    expect(currentHit).not.toBe(interruptedHit);
    const eventsBeforeOldEnded = radioEvents.length;

    interruptedHit.dispatchEvent(new Event('ended'));
    expect(engine.getDebugState()).toMatchObject({ activeRadioCue: 'shield-hit', voicePlaybackState: 'playing' });
    expect(radioEvents).toHaveLength(eventsBeforeOldEnded);
    expect(currentHit.stop).not.toHaveBeenCalled();
    currentHit.dispatchEvent(new Event('ended'));
    expect(engine.getDebugState().activeRadioCue).toBeUndefined();
  });

  it.each(['arc-upgraded', 'shield-restored', 'hull-critical'] as const)('drops transient hits during %s without replacing the queued transmission', async (cue) => {
    const { context, engine, radioEvents } = await unlockedHarness();
    engine.playRadio(cue);
    await flushAudioPromises();
    const active = mostRecentVoice(context);
    engine.playRadio('nova-upgraded');
    engine.playRadio('shield-hit');
    await flushAudioPromises();
    expect(active.stop).not.toHaveBeenCalled();
    active.dispatchEvent(new Event('ended'));
    await flushAudioPromises();
    expect(engine.getDebugState().activeRadioCue).toBe('nova-upgraded');
    mostRecentVoice(context).dispatchEvent(new Event('ended'));
    await flushAudioPromises();
    expect(engine.getDebugState().activeRadioCue).toBeUndefined();
    expect(radioEvents.some((event) => event.cue === 'shield-hit')).toBe(false);
    // A discarded observation does not consume the next real hit's cooldown.
    engine.playRadio('shield-hit');
    await flushAudioPromises();
    expect(engine.getDebugState().activeRadioCue).toBe('shield-hit');
  });

  it.each([true, false])('honours radio subtitles=%s without muting audible speech', async (enabled) => {
    const { context, engine, radioEvents } = await unlockedHarness();
    engine.setRadioSubtitles(enabled);
    engine.playRadio('aegis-upgraded');
    await flushAudioPromises();
    expect(radioEvents.at(-1)).toEqual({
      active: true, cue: 'aegis-upgraded', speaker: 'Vale', subtitle: 'Aegis capacity upgraded.', subtitles: enabled,
    });
    expect(engine.getSettings().radioSubtitles).toBe(enabled);
    expect(engine.getDebugState().voicePlaybackState).toBe('playing');
    mostRecentVoice(context).dispatchEvent(new Event('ended'));
    expect(radioEvents.at(-1)).toEqual({ active: false, cue: 'aegis-upgraded' });
    expect(engine.getDebugState().voicePlaybackState).toBe('idle');
  });

  it.each([true, false])('keeps the subtitles=%s preference when Voice is muted', async (enabled) => {
    const { context, engine, radioEvents } = await unlockedHarness();
    engine.setVoiceVolume(0);
    engine.setRadioSubtitles(enabled);
    engine.playRadio('emp-ready');
    await flushAudioPromises();
    expect(radioEvents.at(-1)).toMatchObject({ active: true, cue: 'emp-ready', subtitle: 'EMP ready.', subtitles: enabled });
    expect(context.sources).toHaveLength(0);
    expect(engine.getDebugState().voicePlaybackState).toBe('subtitle-only');
    await vi.advanceTimersByTimeAsync(2_200);
    expect(engine.getDebugState()).toMatchObject({ activeRadioCue: undefined, voicePlaybackState: 'idle' });
  });

  it('uses subtitle-only fallback for a browser decode failure and reports ten available recordings', async () => {
    const { context, engine, radioEvents } = await unlockedHarness({ failedDecodeFile: VOICE_ASSETS['shield-down'].file });
    expect(engine.getDebugState()).toMatchObject({ voiceAssetCheckComplete: true, voiceAssetsReady: 10, voiceAssetsMissing: 1 });
    engine.playRadio('shield-down');
    await flushAudioPromises();
    expect(engine.getDebugState().lastVoiceError).toContain('Decode failed');
    expect(engine.getDebugState().voicePlaybackState).toBe('subtitle-only');
    expect(radioEvents.at(-1)).toMatchObject({ active: true, cue: 'shield-down', subtitle: 'Shield down.' });
    expect(context.sources).toHaveLength(0);
  });

  it('rejects an empty fetch response before browser decoding and preserves the subtitle fallback', async () => {
    const { context, engine } = await unlockedHarness({ emptyFile: VOICE_ASSETS['emp-ready'].file });
    expect(context.decodeAudioData).toHaveBeenCalledTimes(10);
    expect(engine.getDebugState()).toMatchObject({ voiceAssetsReady: 10, voiceAssetsMissing: 1 });
    engine.playRadio('emp-ready');
    await flushAudioPromises();
    expect(engine.getDebugState().lastVoiceError).toContain('is empty');
    expect(engine.getDebugState().voicePlaybackState).toBe('subtitle-only');
    expect(context.sources).toHaveLength(0);
  });

  it('does not duck, re-automate, stop, or restart music during voice playback, interruption, and completion', async () => {
    const { context, engine } = await unlockedHarness();
    await engine.playMusic('mission-coastal');
    await flushAudioPromises();
    const baseline = engine.getDebugState();
    const musicSources = [...context.sources];
    const musicNodes = [context.gains[2], ...context.gains.slice(4)];
    const originalAutomation = musicNodes.map(gainAutomation);
    expect(baseline).toMatchObject({ currentTrack: 'mission-coastal', playbackState: 'playing', logicalStartCount: 1 });
    expect(musicSources).toHaveLength(49);

    engine.setVoiceVolume(0.5);
    engine.playRadio('shield-hit');
    await flushAudioPromises();
    engine.playRadio('wing-upgraded');
    await flushAudioPromises();
    engine.playRadio('shield-down');
    await flushAudioPromises();
    engine.playRadio('shield-restored');
    await flushAudioPromises();
    mostRecentVoice(context).dispatchEvent(new Event('ended'));
    await flushAudioPromises();
    mostRecentVoice(context).dispatchEvent(new Event('ended'));
    context.currentTime += 4;

    expect(musicNodes.map(gainAutomation)).toEqual(originalAutomation);
    for (const source of musicSources) {
      expect(source.start).toHaveBeenCalledOnce();
      expect(source.stop).not.toHaveBeenCalled();
    }
    expect(engine.getDebugState()).toMatchObject({
      currentTrack: baseline.currentTrack, desiredTrack: baseline.desiredTrack,
      playbackState: baseline.playbackState, source: baseline.source,
      musicGain: baseline.musicGain, logicalStartCount: baseline.logicalStartCount,
      activeRadioCue: undefined, voicePlaybackState: 'idle',
    });
    expect(engine.getDebugState().positionSeconds).toBeGreaterThan(baseline.positionSeconds + 3.9);
  });

  it('uses the nondestructive candidate endpoint for source scheduling and runtime loop diagnostics', async () => {
    const previous = MUSIC_ASSETS['mission-graveyard'];
    MUSIC_ASSETS['mission-graveyard'] = { ...previous, loop: missionScoreLoop('mission-graveyard') };
    try {
      const { context, engine } = await unlockedHarness();
      context.decodeAudioData.mockImplementation(async (bytes: ArrayBuffer) => ({
        ...decodedBuffer(new TextDecoder().decode(bytes)), duration: 180.03591836734694,
      }));
      await engine.playMusic('mission-graveyard');
      await flushAudioPromises();
      expect(context.sources[0].buffer?.duration).toBe(180.03591836734694);
      expect(context.sources[0].start).toHaveBeenCalledWith(10.025, 0, 174);
      expect(context.sources[1].start).toHaveBeenCalledWith(182.025, 134, 40);
      expect(engine.getDebugState().loopRegion).toEqual({ startSeconds: 134, endSeconds: 174 });
      context.currentTime = 182.04;
      expect(engine.getDebugState().loopIteration).toBe(1);
    } finally {
      MUSIC_ASSETS['mission-graveyard'] = previous;
    }
  });
});
