import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MUSIC_ASSETS, SoundEngine } from './SoundEngine';
import type { MusicTrack } from '../game/simulation/types';

const AMPLITUDE = 0.125;
const NORMALIZATION = 0.13 / AMPLITUDE;
const BASE_URI = 'https://preview.example/aegis-vector/index.html';

type Automation =
  | { type: 'set' | 'exponential' | 'target'; time: number; value: number }
  | { type: 'curve'; time: number; duration: number; values: Float32Array };

// Unlike a mock that immediately assigns the ramp endpoint, this reads the
// instantaneous automated value. Cancelling the timeline exposes the intrinsic
// value again, so a fade must snapshot its current gain before cancellation.
function audioParam(now: () => number, initial = 0) {
  let intrinsic = initial;
  let automation: Automation[] = [];
  const valueAt = (time: number): number => {
    let value = intrinsic;
    let lastTime = 0;
    for (const event of [...automation].sort((a, b) => a.time - b.time)) {
      if (event.type === 'exponential' && time < event.time) {
        const progress = Math.max(0, Math.min(1, (time - lastTime) / (event.time - lastTime)));
        return value * (event.value / value) ** progress;
      }
      if (time < event.time) break;
      if (event.type === 'curve') {
        const index = Math.max(0, Math.min(event.values.length - 1,
          (time - event.time) / event.duration * (event.values.length - 1)));
        const low = Math.floor(index), high = Math.ceil(index);
        value = event.values[low] + (event.values[high] - event.values[low]) * (index - low);
        if (time < event.time + event.duration) return value;
        lastTime = event.time + event.duration;
      } else {
        value = event.value;
        lastTime = event.time;
      }
    }
    return value;
  };
  return {
    get value() { return valueAt(now()); },
    set value(value: number) { intrinsic = value; },
    valueAt,
    setValueAtTime: vi.fn((value: number, time: number) => automation.push({ type: 'set', value, time })),
    exponentialRampToValueAtTime: vi.fn((value: number, time: number) => automation.push({ type: 'exponential', value, time })),
    setTargetAtTime: vi.fn((value: number, time: number, _timeConstant: number) => automation.push({ type: 'target', value, time })),
    cancelScheduledValues: vi.fn((time: number) => { automation = automation.filter((event) => event.time < time); }),
    setValueCurveAtTime: vi.fn((values: Float32Array, time: number, duration: number) => {
      if (automation.some((event) => event.type === 'curve'
        && event.time < time + duration && event.time + event.duration > time)) {
        throw new Error('Overlapping gain curves must be cancelled before replacement');
      }
      automation.push({ type: 'curve', values: values.slice(), time, duration });
    }),
  };
}

function audioNode() {
  return Object.assign(new EventTarget(), {
    connections: [] as unknown[],
    connect(destination: unknown) { this.connections.push(destination); return destination; },
  });
}
function gainNode(now: () => number) {
  return Object.assign(audioNode(), { gain: audioParam(now, 1) });
}
function decodedBuffer(file: string) {
  const samples = Float32Array.from([1, -1, 1, -1], (value) => value * AMPLITUDE);
  return { file, duration: 90, length: samples.length, numberOfChannels: 1, getChannelData: () => samples };
}
function bufferSource() {
  return Object.assign(audioNode(), {
    buffer: null as ReturnType<typeof decodedBuffer> | null,
    start: vi.fn((_when: number, _offset: number, _duration: number) => undefined),
    stop: vi.fn((_when: number) => undefined),
  });
}
class MockAudioContext extends EventTarget {
  currentTime = 10;
  state = 'running';
  destination = audioNode();
  gains: ReturnType<typeof gainNode>[] = [];
  sources: ReturnType<typeof bufferSource>[] = [];
  resume = vi.fn(async () => { this.state = 'running'; });
  decodeAudioData = vi.fn(async (bytes: ArrayBuffer) => decodedBuffer(new TextDecoder().decode(bytes)));
  createGain() {
    const node = gainNode(() => this.currentTime);
    this.gains.push(node);
    return node;
  }
  createBufferSource() {
    const node = bufferSource();
    this.sources.push(node);
    return node;
  }
  createBiquadFilter() {
    const param = () => audioParam(() => this.currentTime);
    return Object.assign(audioNode(), { type: 'lowpass', frequency: param(), Q: param(), gain: param() });
  }
  createDynamicsCompressor() {
    const param = () => audioParam(() => this.currentTime);
    return Object.assign(audioNode(), { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() });
  }
}

async function flushPromises() {
  for (let index = 0; index < 16; index++) await Promise.resolve();
}

async function harness() {
  const context = new MockAudioContext();
  const storage = new Map<string, string>();
  const responses = new Map<string, Promise<void>>();
  vi.stubGlobal('window', {
    location: { search: '' }, dispatchEvent: vi.fn(),
    setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  });
  vi.stubGlobal('document', { baseURI: BASE_URI });
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.stubGlobal('CustomEvent', class extends Event {
    readonly detail: unknown;
    constructor(type: string, init: CustomEventInit) { super(type); this.detail = init.detail; }
  });
  vi.stubGlobal('AudioContext', class { constructor() { return context; } });
  const fetchMock = vi.fn(async (url: URL) => {
    const file = url.pathname.replace('/aegis-vector/', '');
    await responses.get(file);
    return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(file).buffer };
  });
  vi.stubGlobal('fetch', fetchMock);
  const engine = new SoundEngine();
  await engine.unlock();
  await flushPromises();
  const play = async (track: MusicTrack, next?: MusicTrack) => {
    const before = context.sources.length;
    await engine.playMusic(track, next);
    const sources = context.sources.slice(before);
    expect(sources.length).toBeGreaterThan(0);
    const voiceGain = sources[0].connections[0] as ReturnType<typeof gainNode>;
    const trackGain = voiceGain.connections[0] as ReturnType<typeof gainNode>;
    return { sources, trackGain };
  };
  return { context, engine, play, responses, fetchMock, musicBus: context.gains[2] };
}

describe('music track transitions through browser audio primitives', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps standalone playback exponential and applies the measured track normalization', async () => {
    const { context, engine, play, musicBus } = await harness();
    const track = await play('mission-coastal');
    expect(track.trackGain.connections).toEqual([musicBus]);
    expect(track.trackGain.gain.setValueAtTime).toHaveBeenCalledWith(.0001, 10);
    expect(track.trackGain.gain.exponentialRampToValueAtTime).toHaveBeenCalledExactlyOnceWith(
      MUSIC_ASSETS['mission-coastal'].gain * NORMALIZATION, 10.8);
    expect(track.trackGain.gain.setValueCurveAtTime).not.toHaveBeenCalled();
    expect(track.sources).toHaveLength(49);
    expect(track.sources[0].start).toHaveBeenCalledExactlyOnceWith(10.025, 0, 90);
    context.currentTime = 11;
    expect(track.trackGain.gain.value).toBeCloseTo(.76 * NORMALIZATION);
    expect(engine.getDebugState()).toMatchObject({ currentTrack: 'mission-coastal', logicalStartCount: 1, queuedSources: 48 });
  });

  it('crossfades equal-level tracks without an energy dip at any of the 48 curve samples', async () => {
    const { context, engine, play } = await harness();
    const outgoing = await play('mission-coastal');
    context.currentTime = 12;
    const incoming = await play('mission-minefield');
    const [fadeIn, inStart, inDuration] = incoming.trackGain.gain.setValueCurveAtTime.mock.calls[0];
    const [fadeOut, outStart, outDuration] = outgoing.trackGain.gain.setValueCurveAtTime.mock.calls[0];
    const normalized = .76 * NORMALIZATION;
    expect(fadeIn).toHaveLength(48);
    expect(fadeOut).toHaveLength(48);
    expect([inStart, outStart, inDuration, outDuration]).toEqual([12, 12, .8, .8]);
    expect(fadeIn[0]).toBe(0);
    expect(fadeIn[47]).toBeCloseTo(normalized, 7);
    expect(fadeOut[0]).toBeCloseTo(normalized, 7);
    expect(fadeOut[47]).toBeCloseTo(0, 12);
    for (let index = 0; index < 48; index++) {
      expect(fadeIn[index] ** 2 + fadeOut[index] ** 2).toBeCloseTo(normalized ** 2, 6);
      expect(fadeIn[index]).toBeCloseTo(normalized * Math.sin(index / 47 * Math.PI / 2), 7);
      expect(fadeOut[index]).toBeCloseTo(normalized * Math.cos(index / 47 * Math.PI / 2), 7);
    }
    expect(incoming.trackGain.gain.exponentialRampToValueAtTime).not.toHaveBeenCalled();
    expect(outgoing.trackGain.gain.cancelScheduledValues).toHaveBeenCalledExactlyOnceWith(0);
    outgoing.sources.forEach((source) => expect(source.stop).toHaveBeenCalledExactlyOnceWith(12.83));
    expect(engine.getDebugState()).toMatchObject({ currentTrack: 'mission-minefield', logicalStartCount: 2 });
  });

  it.each([
    ['menu', 'hangar', .8],
    ['mission-coastal', 'boss', 1.2],
    ['victory', 'hangar', 1.2],
    ['hangar', 'story-discovery', 1.6],
  ] as const)('scales %s → %s curves to their own normalized targets over %ss', async (from, to, duration) => {
    const { context, play } = await harness();
    const outgoing = await play(from);
    context.currentTime = 12;
    const incoming = await play(to);
    const [fadeIn, inStart, inDuration] = incoming.trackGain.gain.setValueCurveAtTime.mock.calls[0];
    const [fadeOut, outStart, outDuration] = outgoing.trackGain.gain.setValueCurveAtTime.mock.calls[0];
    expect([inStart, outStart, inDuration, outDuration]).toEqual([12, 12, duration, duration]);
    expect(fadeIn[47]).toBeCloseTo(MUSIC_ASSETS[to].gain * NORMALIZATION, 7);
    expect(fadeOut[0]).toBeCloseTo(MUSIC_ASSETS[from].gain * NORMALIZATION, 7);
    outgoing.sources.forEach((source) => expect(source.stop.mock.calls[0][0]).toBeCloseTo(12 + duration + .03));
  });

  it('changes pause ducking and Music volume on the bus without restarting either track', async () => {
    const { context, engine, play, musicBus } = await harness();
    await play('mission-coastal');
    context.currentTime = 12;
    await play('mission-minefield');
    context.currentTime = 12.2;
    const count = context.sources.length;
    const before = engine.getDebugState();
    for (const volume of [0, .5, 1]) {
      engine.setMusicVolume(volume);
      expect(musicBus.gain.setTargetAtTime).toHaveBeenLastCalledWith(volume, 12.2, .25);
      engine.setMusicDucked(true);
      expect(musicBus.gain.setTargetAtTime).toHaveBeenLastCalledWith(volume * .45, 12.2, .25);
      engine.setMusicDucked(false);
      expect(musicBus.gain.setTargetAtTime).toHaveBeenLastCalledWith(volume, 12.2, .25);
    }
    await engine.playMusic('mission-minefield');
    expect(context.sources).toHaveLength(count);
    context.sources.forEach((source) => expect(source.start).toHaveBeenCalledOnce());
    expect(engine.getDebugState()).toMatchObject({
      currentTrack: 'mission-minefield', logicalStartCount: before.logicalStartCount,
      positionSeconds: before.positionSeconds, queuedSources: before.queuedSources,
    });
  });

  it('interrupts an unfinished fade from its instantaneous gain and cancels the old curve first', async () => {
    const { context, engine, play } = await harness();
    await play('mission-coastal');
    context.currentTime = 12;
    const middle = await play('mission-minefield');
    context.currentTime = 12.2;
    const interruptedGain = middle.trackGain.gain.value;
    expect(interruptedGain).toBeGreaterThan(0);
    expect(interruptedGain).toBeLessThan(MUSIC_ASSETS['mission-minefield'].gain * NORMALIZATION);
    await play('mission-fortress');
    expect(middle.trackGain.gain.cancelScheduledValues).toHaveBeenCalledExactlyOnceWith(0);
    const [replacement, start, duration] = middle.trackGain.gain.setValueCurveAtTime.mock.calls[1];
    expect(middle.trackGain.gain.cancelScheduledValues.mock.invocationCallOrder[0])
      .toBeLessThan(middle.trackGain.gain.setValueCurveAtTime.mock.invocationCallOrder[1]);
    expect(replacement[0]).toBeCloseTo(interruptedGain, 7);
    expect(replacement[47]).toBeCloseTo(0, 12);
    expect([start, duration]).toEqual([12.2, .8]);
    expect(middle.trackGain.gain.value).toBeCloseTo(interruptedGain, 7);
    middle.sources.forEach((source) => expect(source.stop.mock.calls[0][0]).toBeCloseTo(13.03));
    expect(engine.getDebugState()).toMatchObject({ currentTrack: 'mission-fortress', logicalStartCount: 3, playbackState: 'playing' });
  });

  it('stops all current and future loop voices when stopped midway through a crossfade', async () => {
    const { context, engine, play } = await harness();
    const first = await play('mission-coastal');
    context.currentTime = 12;
    const second = await play('mission-minefield');
    context.currentTime = 12.1;
    const beforeStop = second.trackGain.gain.value;
    engine.stopMusic(.2);
    expect(second.trackGain.gain.cancelScheduledValues).toHaveBeenCalledExactlyOnceWith(0);
    const [curve, start, duration] = second.trackGain.gain.setValueCurveAtTime.mock.calls[1];
    expect(curve[0]).toBeCloseTo(beforeStop, 7);
    expect(curve[47]).toBeCloseTo(0, 12);
    expect([start, duration]).toEqual([12.1, .2]);
    expect(first.sources).toHaveLength(49);
    expect(second.sources).toHaveLength(49);
    first.sources.forEach((source) => expect(source.stop).toHaveBeenCalledOnce());
    second.sources.forEach((source) => expect(source.stop.mock.calls[0][0]).toBeCloseTo(12.33));
    // Even voices scheduled many minutes from now receive a stop before start.
    expect(second.sources.at(-1)!.start.mock.calls[0][0]).toBeGreaterThan(1_000);
    expect(engine.getDebugState()).toMatchObject({ currentTrack: undefined, desiredTrack: undefined, queuedSources: 0, logicalStartCount: 2 });
    second.sources[0].dispatchEvent(new Event('ended'));
    expect(engine.getDebugState().currentTrack).toBeUndefined();
  });

  it('cancels a stopped one-shot continuation so its timer cannot restart music', async () => {
    const { context, engine, play } = await harness();
    const victory = await play('victory', 'hangar');
    expect(vi.getTimerCount()).toBe(1);
    engine.stopMusic(.4);
    expect(vi.getTimerCount()).toBe(0);
    expect(victory.sources[0].stop.mock.calls[0][0]).toBeCloseTo(context.currentTime + .43);
    await vi.advanceTimersByTimeAsync(100_000);
    expect(context.sources).toHaveLength(1);
    expect(engine.getDebugState()).toMatchObject({ currentTrack: undefined, desiredTrack: undefined, logicalStartCount: 1 });
  });

  it('does not start a pending fetch after stopMusic invalidates its request', async () => {
    const { context, engine, responses } = await harness();
    let release!: () => void;
    responses.set(MUSIC_ASSETS.menu.files[0], new Promise<void>((resolve) => { release = resolve; }));
    const pending = engine.playMusic('menu');
    await flushPromises();
    expect(context.sources).toHaveLength(0);
    engine.stopMusic();
    release();
    await pending;
    expect(context.sources).toHaveLength(0);
    expect(engine.getDebugState()).toMatchObject({ currentTrack: undefined, desiredTrack: undefined, queuedSources: 0, logicalStartCount: 0 });
  });
});
