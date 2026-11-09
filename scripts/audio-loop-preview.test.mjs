import { describe, expect, it, vi } from 'vitest';
import { createLoopAuditioner, equalPowerCurve, loopPreviewSchedule } from '../public/reviews/audio-loop-preview.js';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const flush = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };

function harness({ resume, decode, fetchImpl } = {}) {
  const contexts = [];
  class FakeContext {
    constructor() {
      this.state = 'suspended'; this.currentTime = 10; this.destination = {}; this.sources = []; this.gains = [];
      this.resume = vi.fn(resume ?? (async () => { this.state = 'running'; }));
      this.close = vi.fn(async () => { this.state = 'closed'; });
      this.decodeAudioData = vi.fn(decode ?? (async () => ({ duration: 180.036 })));
      contexts.push(this);
    }
    createGain() {
      const gain = { gain: { setValueAtTime: vi.fn(), setValueCurveAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        connect: vi.fn((target) => target), disconnect: vi.fn() };
      this.gains.push(gain); return gain;
    }
    createBufferSource() {
      const source = { connect: vi.fn((target) => target), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null };
      this.sources.push(source); return source;
    }
  }
  const fetcher = fetchImpl ?? vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }));
  return { contexts, fetcher, audition: createLoopAuditioner({ AudioContextClass: FakeContext, fetchImpl: fetcher }) };
}

describe('candidate-only loop boundary audition', () => {
  it('builds exactly the analyzer seam: six seconds, two-second overlap, six seconds', () => {
    const schedule = loopPreviewSchedule(180.036);
    expect(schedule.durationSeconds).toBe(14);
    expect(schedule.crossfadeSeconds).toBe(2);
    expect(schedule.voices).toEqual([
      { startSeconds: 0, offsetSeconds: 172.036, durationSeconds: 8, fade: 'out' },
      { startSeconds: 6, offsetSeconds: 140.036, durationSeconds: 8, fade: 'in' },
    ]);
    for (const invalid of [0, 20, 39.99, NaN, Infinity]) expect(() => loopPreviewSchedule(invalid)).toThrow();
  });
  it('supports a candidate-specific endpoint without reading the active manifest', () => {
    expect(loopPreviewSchedule(180.036, 174).voices.map((voice) => voice.offsetSeconds)).toEqual([166, 134]);
    for (const end of [undefined, 0, -1, NaN, Infinity, 200]) {
      expect(loopPreviewSchedule(180.036, end)).toEqual(loopPreviewSchedule(180.036));
    }
    expect(() => loopPreviewSchedule(180.036, 30)).toThrow();
  });
  it('uses complementary equal-power curves', () => {
    const incoming = equalPowerCurve('in'), outgoing = equalPowerCurve('out');
    expect(incoming[0]).toBe(0); expect(incoming.at(-1)).toBe(1);
    expect(outgoing[0]).toBe(1); expect(outgoing.at(-1)).toBeCloseTo(0);
    incoming.forEach((value, index) => expect(value ** 2 + outgoing[index] ** 2).toBeCloseTo(1, 6));
  });
  it('schedules both voices at 50 percent and disposes the finite preview on completion', async () => {
    const { audition, contexts, fetcher } = harness(), events = vi.fn();
    expect(contexts).toHaveLength(0); // Import/construction never starts playback.
    await audition.play('/audio/candidate.mp3', events);
    const context = contexts[0];
    expect(fetcher).toHaveBeenCalledExactlyOnceWith('/audio/candidate.mp3', { signal: expect.any(AbortSignal) });
    expect(context.gains[0].gain.setValueAtTime).toHaveBeenCalledWith(.5, 10);
    expect(context.sources[0].start).toHaveBeenCalledWith(10.05, 172.036, 8);
    expect(context.sources[1].start).toHaveBeenCalledWith(16.05, 140.036, 8);
    expect(context.gains[1].gain.setValueCurveAtTime).toHaveBeenCalledWith(expect.any(Float32Array), 16.05, 2);
    expect(context.gains[2].gain.setValueCurveAtTime).toHaveBeenCalledWith(expect.any(Float32Array), 16.05, 2);
    expect(events.mock.calls.map(([event]) => event.phase)).toEqual(['loading', 'playing']);
    context.sources[1].onended();
    expect(events.mock.calls.map(([event]) => event.phase)).toEqual(['loading', 'playing', 'ended']);
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(context.sources.every((source) => source.disconnect.mock.calls.length === 1)).toBe(true);
  });
  it('cancels pending fetch without late playback or an erroneous error message', async () => {
    const waiting = deferred(), fetcher = vi.fn(() => waiting.promise), events = vi.fn();
    const { audition, contexts } = harness({ fetchImpl: fetcher });
    const playing = audition.play('/audio/candidate.mp3', events);
    await flush(); audition.stop();
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    waiting.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) });
    await playing;
    expect(contexts[0].sources).toHaveLength(0);
    expect(contexts[0].close).toHaveBeenCalledTimes(1);
    expect(events.mock.calls.map(([event]) => event.phase)).toEqual(['loading']);
  });
  it('cancels pending decode and prevents a stale completion from overriding a replacement', async () => {
    const waiting = deferred(), events = vi.fn();
    const { audition, contexts } = harness({ decode: () => waiting.promise });
    const playing = audition.play('/audio/first.mp3', events);
    await flush();
    expect(contexts[0].decodeAudioData).toHaveBeenCalledTimes(1);
    audition.stop(); waiting.resolve({ duration: 180 }); await playing;
    expect(contexts[0].sources).toHaveLength(0);
    expect(events.mock.calls.map(([event]) => event.phase)).toEqual(['loading']);

    const ready = harness(), first = vi.fn(), second = vi.fn();
    await ready.audition.play('/audio/first.mp3', first);
    const staleEnd = ready.contexts[0].sources[1].onended;
    await ready.audition.play('/audio/second.mp3', second, { endSeconds: 174 });
    staleEnd();
    expect(first.mock.calls.map(([event]) => event.phase)).toEqual(['loading', 'playing']);
    expect(ready.contexts[0].close).toHaveBeenCalledTimes(1);
    expect(ready.contexts[1].state).toBe('running');
    expect(ready.contexts[1].sources[1].start).toHaveBeenCalledWith(16.05, 134, 8);
    ready.audition.stop(); ready.audition.stop();
    expect(ready.contexts[1].close).toHaveBeenCalledTimes(1);
  });
  it('handles autoplay rejection and network/decode errors without leaking a context', async () => {
    for (const options of [
      { resume: async () => { throw new Error('blocked'); } },
      { fetchImpl: vi.fn(async () => ({ ok: false })) },
      { decode: async () => { throw new Error('bad audio'); } },
      { decode: async () => ({ duration: 8 }) },
    ]) {
      const { audition, contexts } = harness(options), events = vi.fn();
      await audition.play('/audio/candidate.mp3', events);
      expect(events.mock.calls.map(([event]) => event.phase)).toEqual(['loading', 'error']);
      expect(events.mock.calls.at(-1)[0].message).toContain('native play control');
      expect(contexts[0].close).toHaveBeenCalledTimes(1);
    }
  });
});
