/** A finite audition of the same 40-second tail / 2-second equal-power seam
 * used by the game. It never changes an active soundtrack or campaign save. */
export function loopPreviewSchedule(durationSeconds, endSeconds) {
  const end = Number.isFinite(endSeconds) && endSeconds > 0 ? Math.min(durationSeconds, endSeconds) : durationSeconds;
  if (!Number.isFinite(end) || end < 40) {
    throw new Error('A loop preview requires at least 40 seconds of decoded audio.');
  }
  return {
    durationSeconds: 14,
    crossfadeSeconds: 2,
    voices: [
      { startSeconds: 0, offsetSeconds: end - 8, durationSeconds: 8, fade: 'out' },
      { startSeconds: 6, offsetSeconds: end - 40, durationSeconds: 8, fade: 'in' },
    ],
  };
}

export function equalPowerCurve(direction, length = 128) {
  return Float32Array.from({ length }, (_, index) => {
    const angle = index / (length - 1) * Math.PI / 2;
    return direction === 'in' ? Math.sin(angle) : Math.cos(angle);
  });
}

/** Injected dependencies keep cancellation and disposal testable offline. */
export function createLoopAuditioner({
  AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext,
  fetchImpl = globalThis.fetch,
} = {}) {
  let active;

  function stop() {
    const previous = active;
    active = undefined; // onended and pending fetch/decode callbacks become inert.
    if (!previous) return;
    previous.abort.abort();
    for (const source of previous.sources) {
      source.onended = null;
      try { source.stop(); } catch { /* Already ended or not yet started. */ }
      source.disconnect();
    }
    for (const gain of previous.gains) gain.disconnect();
    if (previous.context.state !== 'closed') void previous.context.close().catch(() => {});
  }

  async function play(url, onState, { endSeconds } = {}) {
    stop();
    if (!AudioContextClass) {
      onState({ phase: 'error', message: 'Loop preview is unavailable in this browser. The full recording still plays in its native control.' });
      return;
    }
    let request;
    try {
      const context = new AudioContextClass();
      request = { context, abort: new AbortController(), sources: [], gains: [] };
      active = request;
      onState({ phase: 'loading' });
      // Called directly from the button gesture, before awaiting a download.
      await context.resume();
      if (active !== request) return;
      if (context.state !== 'running') throw new Error('Audio is suspended.');
      const response = await fetchImpl(url, { signal: request.abort.signal });
      if (active !== request) return;
      if (!response.ok) throw new Error('Audio file is unavailable.');
      const bytes = await response.arrayBuffer();
      if (active !== request) return;
      const buffer = await context.decodeAudioData(bytes);
      if (active !== request) return;
      const schedule = loopPreviewSchedule(buffer.duration, endSeconds);
      const master = context.createGain();
      master.gain.setValueAtTime(.5, context.currentTime);
      master.connect(context.destination);
      request.gains.push(master);
      const start = context.currentTime + .05;
      for (const voice of schedule.voices) {
        const source = context.createBufferSource(), gain = context.createGain();
        request.sources.push(source);
        request.gains.push(gain);
        source.buffer = buffer;
        source.connect(gain).connect(master);
        const at = start + voice.startSeconds;
        if (voice.fade === 'in') {
          gain.gain.setValueCurveAtTime(equalPowerCurve('in'), at, schedule.crossfadeSeconds);
          // End the finite sample gently; the actual seam is unchanged.
          gain.gain.setValueAtTime(1, at + voice.durationSeconds - .03);
          gain.gain.linearRampToValueAtTime(0, at + voice.durationSeconds);
          source.onended = () => {
            if (active !== request) return;
            stop();
            onState({ phase: 'ended' });
          };
        } else {
          gain.gain.setValueAtTime(1, at);
          gain.gain.setValueCurveAtTime(equalPowerCurve('out'), at + voice.durationSeconds - schedule.crossfadeSeconds, schedule.crossfadeSeconds);
        }
        source.start(at, voice.offsetSeconds, voice.durationSeconds);
      }
      onState({ phase: 'playing', durationSeconds: schedule.durationSeconds });
    } catch {
      if (request && active !== request) return;
      stop();
      onState({ phase: 'error', message: 'Loop preview did not start. Try it again, or use the full recording’s native play control. No game changes were made.' });
    }
  }

  return { play, stop };
}
