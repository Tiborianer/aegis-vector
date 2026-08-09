import type {
  AudioDebugState,
  MusicAssetDefinition,
  MusicLoopStrategy,
  MusicPlaybackState,
  MusicTrack,
  VoicePlaybackState,
} from '../game/simulation/types';

export type SoundCue =
  | 'fire'
  | 'laser'
  | 'missile'
  | 'arc-fire'
  | 'arc-impact'
  | 'nova-fire'
  | 'nova-impact'
  | 'lance-fire'
  | 'lance-impact'
  | 'wing-fire'
  | 'wing-impact'
  | 'ion-fire'
  | 'ion-impact'
  | 'enemy-fire'
  | 'explode'
  | 'pickup'
  | 'shield-hit'
  | 'shield-ready'
  | 'hull-hit'
  | 'warning'
  | 'emp'
  | 'purchase'
  | 'victory'
  | 'defeat';

export interface SoundRequest {
  cue: SoundCue;
  pan?: number;
}

export interface AudioSettings {
  music: number;
  sfx: number;
  voice: number;
  cinematic: number;
  radioSubtitles: boolean;
}

export type RadioCue =
  | 'shield-down'
  | 'hull-critical'
  | 'shield-restored'
  | 'emp-ready'
  | 'arc-upgraded'
  | 'nova-upgraded'
  | 'lance-upgraded'
  | 'wing-upgraded'
  | 'ion-upgraded'
  | 'aegis-upgraded';

export interface VoiceAssetDefinition {
  file: string;
  speaker: 'ECHO-7' | 'Rook';
  subtitle: string;
  priority: 'critical' | 'tactical' | 'upgrade';
  cooldownMs: number;
  gain: number;
}

export const VOICE_ASSETS: Record<RadioCue, VoiceAssetDefinition> = {
  'shield-down': { file: 'audio/voice/shield-down.wav', speaker: 'ECHO-7', subtitle: 'Shield down.', priority: 'critical', cooldownMs: 10_000, gain: .52 },
  'hull-critical': { file: 'audio/voice/hull-critical.wav', speaker: 'ECHO-7', subtitle: 'Hull critical.', priority: 'critical', cooldownMs: 20_000, gain: .52 },
  'shield-restored': { file: 'audio/voice/shield-restored.wav', speaker: 'ECHO-7', subtitle: 'Shields restored.', priority: 'tactical', cooldownMs: 8_000, gain: .52 },
  'emp-ready': { file: 'audio/voice/emp-ready.wav', speaker: 'ECHO-7', subtitle: 'EMP ready.', priority: 'tactical', cooldownMs: 8_000, gain: .52 },
  'arc-upgraded': { file: 'audio/voice/arc-upgraded.wav', speaker: 'Rook', subtitle: 'ARC cannon upgraded.', priority: 'upgrade', cooldownMs: 1_000, gain: .52 },
  'nova-upgraded': { file: 'audio/voice/nova-upgraded.wav', speaker: 'Rook', subtitle: 'NOVA missiles upgraded.', priority: 'upgrade', cooldownMs: 1_000, gain: .52 },
  'lance-upgraded': { file: 'audio/voice/lance-upgraded.wav', speaker: 'Rook', subtitle: 'LANCE laser upgraded.', priority: 'upgrade', cooldownMs: 1_000, gain: .52 },
  'wing-upgraded': { file: 'audio/voice/wing-upgraded.wav', speaker: 'Rook', subtitle: 'WING drones upgraded.', priority: 'upgrade', cooldownMs: 1_000, gain: .52 },
  'ion-upgraded': { file: 'audio/voice/ion-upgraded.wav', speaker: 'Rook', subtitle: 'ION conductor upgraded.', priority: 'upgrade', cooldownMs: 1_000, gain: .52 },
  'aegis-upgraded': { file: 'audio/voice/aegis-upgraded.wav', speaker: 'Rook', subtitle: 'Aegis capacity upgraded.', priority: 'upgrade', cooldownMs: 1_000, gain: .52 },
};

interface ActiveMusic {
  track: MusicTrack;
  gain: GainNode;
  voices: Array<{
    source: AudioScheduledSourceNode;
    gain: GainNode;
    startAt: number;
    endAt: number;
    iteration: number;
  }>;
  startedAt: number;
  bufferDuration: number;
  loop: MusicLoopStrategy;
  transitionTimer?: number;
}

interface DesiredMusic {
  track: MusicTrack;
  nextTrack?: MusicTrack;
  variantIndex: number;
}

const AUDIO_SETTINGS_KEY = 'aegis-vector-audio-v1';
const DEFAULT_SETTINGS: AudioSettings = { music: 0.5, sfx: 0.7, voice: 0.9, cinematic: 0.8, radioSubtitles: true };
const RADIO_PRIORITY = { upgrade: 1, tactical: 2, critical: 3 } as const;
export const RADIO_TRIM_DB = -6;
export const RADIO_TRIM_GAIN = 10 ** (RADIO_TRIM_DB / 20);
const CUE_INTERVALS: Partial<Record<SoundCue, number>> = {
  'arc-fire': 64, 'arc-impact': 80, 'wing-fire': 130, 'wing-impact': 95,
  'nova-fire': 240, 'nova-impact': 160, 'lance-fire': 260, 'lance-impact': 150,
  'ion-fire': 420, 'ion-impact': 130,
};

export interface MusicVoiceSchedule {
  startSeconds: number;
  offsetSeconds: number;
  durationSeconds: number;
  crossfadeSeconds: number;
  iteration: number;
}

export function buildMusicVoiceSchedule(
  bufferDuration: number,
  loop: MusicLoopStrategy,
  repeats = 48,
): MusicVoiceSchedule[] {
  const crossfade = loop.mode === 'none' ? 0 : Math.min(loop.crossfadeSeconds, bufferDuration * 0.45);
  const schedule: MusicVoiceSchedule[] = [{
    startSeconds: 0,
    offsetSeconds: 0,
    durationSeconds: bufferDuration,
    crossfadeSeconds: crossfade,
    iteration: 0,
  }];
  if (loop.mode === 'none') return schedule;
  const tailSeconds = loop.mode === 'full' ? bufferDuration : Math.min(bufferDuration, loop.tailSeconds);
  const tailCrossfade = Math.min(loop.crossfadeSeconds, tailSeconds * 0.45);
  const offset = loop.mode === 'full' ? 0 : Math.max(0, bufferDuration - tailSeconds);
  const step = Math.max(0.1, tailSeconds - tailCrossfade);
  let startSeconds = bufferDuration - tailCrossfade;
  for (let iteration = 1; iteration <= repeats; iteration += 1) {
    schedule.push({
      startSeconds,
      offsetSeconds: offset,
      durationSeconds: tailSeconds,
      crossfadeSeconds: tailCrossfade,
      iteration,
    });
    startSeconds += step;
  }
  return schedule;
}

export const MUSIC_ASSETS: Record<MusicTrack, MusicAssetDefinition> = {
  menu: { files: ['audio/menu.mp3'], loop: { mode: 'tail', tailSeconds: 24, crossfadeSeconds: 1.5 }, gain: 0.88, preloadNext: 'mission-coastal' },
  hangar: { files: ['audio/hangar.mp3'], loop: { mode: 'tail', tailSeconds: 24, crossfadeSeconds: 1.5 }, gain: 0.9 },
  'mission-coastal': { files: ['audio/mission-coastal.mp3'], loop: { mode: 'tail', tailSeconds: 32, crossfadeSeconds: 1 }, gain: 0.76, preloadNext: 'hangar' },
  'mission-minefield': { files: ['audio/mission-minefield.mp3'], loop: { mode: 'tail', tailSeconds: 32, crossfadeSeconds: 1 }, gain: 0.76, preloadNext: 'hangar' },
  'mission-fortress': { files: ['audio/mission-fortress.mp3'], loop: { mode: 'tail', tailSeconds: 32, crossfadeSeconds: 1 }, gain: 0.73, preloadNext: 'hangar' },
  boss: {
    files: ['audio/boss.mp3', 'audio/boss-mech-tyrants.mp3'],
    loop: { mode: 'tail', tailSeconds: 32, crossfadeSeconds: 1.2 },
    gain: 0.72,
    preloadNext: 'victory',
  },
  victory: {
    files: [
      'audio/victory-coastal.mp3',
      'audio/victory-minefield.mp3',
      'audio/victory-fortress.mp3',
      'audio/victory-campaign.mp3',
    ],
    loop: { mode: 'none' },
    gain: 0.88,
  },
  defeat: { files: ['audio/defeat-signal.mp3', 'audio/defeat-debrief.mp3'], loop: { mode: 'none' }, gain: 0.84 },
};

export class SoundEngine {
  private context?: AudioContext;
  private master?: GainNode;
  private sfxBus?: GainNode;
  private musicBus?: GainNode;
  private voiceBus?: GainNode;
  private settings: AudioSettings = SoundEngine.loadSettings();
  private buffers = new Map<string, AudioBuffer | null>();
  private activeMusic?: ActiveMusic;
  private desired?: DesiredMusic;
  private currentTrack?: MusicTrack;
  private playbackState: MusicPlaybackState = 'locked';
  private voicePlaybackState: VoicePlaybackState = 'idle';
  private musicRequest = 0;
  private pauseDucked = false;
  private lastError?: string;
  private lastVoiceError?: string;
  private voiceDurationSeconds?: number;
  private voiceGainCorrection?: number;
  private voiceAssetCheckComplete = false;
  private voiceAssetsReady = 0;
  private voiceAssetsMissing = 0;
  private source?: AudioDebugState['source'];
  private logicalStartCount = 0;
  private activeRadio?: { cue: RadioCue; source?: AudioBufferSourceNode; timer?: number };
  private pendingRadio?: RadioCue;
  private readonly voiceBuffers = new Map<string, AudioBuffer | null>();
  private readonly radioCooldowns = new Map<RadioCue, number>();
  private readonly lastCueAt = new Map<SoundCue, number>();
  private readonly debugSynth = new URLSearchParams(window.location.search).get('audioSynth') === '1';

  async unlock(): Promise<void> {
    try {
      if (!this.context) this.createAudioGraph();
      if (this.context?.state === 'suspended') await this.context.resume();
      if (this.context?.state === 'running' && this.activeMusic) this.playbackState = 'playing';
      this.emitState();
      if (this.context?.state === 'running' && this.desired && this.currentTrack !== this.desired.track) {
        await this.startDesired(++this.musicRequest);
      }
    } catch (error) {
      this.fail(error);
    }
  }

  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  getDebugState(): AudioDebugState {
    const now = this.context?.currentTime ?? 0;
    const active = this.activeMusic;
    const positionSeconds = active ? Math.max(0, now - active.startedAt) : 0;
    const loopRegion = active ? SoundEngine.loopRegion(active.bufferDuration, active.loop) : undefined;
    const loopIteration = active && active.loop.mode !== 'none'
      ? Math.max(0, Math.floor(Math.max(0, positionSeconds - (active.bufferDuration - active.loop.crossfadeSeconds)) / Math.max(0.1, (loopRegion!.endSeconds - loopRegion!.startSeconds) - active.loop.crossfadeSeconds)) + (positionSeconds >= active.bufferDuration - active.loop.crossfadeSeconds ? 1 : 0))
      : 0;
    return {
      contextState: this.context?.state ?? 'uninitialized',
      playbackState: this.playbackState,
      desiredTrack: this.desired?.track,
      currentTrack: this.currentTrack,
      source: this.source,
      musicGain: this.settings.music,
      sfxGain: this.settings.sfx,
      voiceGain: this.settings.voice,
      cinematicGain: this.settings.cinematic,
      activeRadioCue: this.activeRadio?.cue,
      voicePlaybackState: this.voicePlaybackState,
      voiceDurationSeconds: this.voiceDurationSeconds,
      voiceGainCorrection: this.voiceGainCorrection,
      lastVoiceError: this.lastVoiceError,
      voiceAssetCheckComplete: this.voiceAssetCheckComplete,
      voiceAssetsReady: this.voiceAssetsReady,
      voiceAssetsMissing: this.voiceAssetsMissing,
      radioTrimDb: RADIO_TRIM_DB,
      radioTrimGain: RADIO_TRIM_GAIN,
      positionSeconds,
      logicalStartCount: this.logicalStartCount,
      loopRegion,
      queuedSources: active?.voices.filter((voice) => voice.startAt > now).length ?? 0,
      loopIteration,
      lastError: this.lastError,
    };
  }

  resetMix(): AudioSettings {
    this.settings = { ...DEFAULT_SETTINGS };
    this.applyMusicVolume();
    if (this.sfxBus && this.context) this.sfxBus.gain.setTargetAtTime(this.settings.sfx, this.context.currentTime, 0.03);
    if (this.voiceBus && this.context) this.voiceBus.gain.setTargetAtTime(this.settings.voice, this.context.currentTime, 0.03);
    this.saveSettings();
    this.emitState();
    return this.getSettings();
  }

  setMusicVolume(value: number): void {
    this.settings.music = SoundEngine.clampVolume(value);
    this.applyMusicVolume();
    this.saveSettings();
    this.emitState();
  }

  setSfxVolume(value: number): void {
    this.settings.sfx = SoundEngine.clampVolume(value);
    if (this.sfxBus && this.context) this.sfxBus.gain.setTargetAtTime(this.settings.sfx, this.context.currentTime, 0.03);
    this.saveSettings();
    this.emitState();
  }

  setVoiceVolume(value: number): void {
    this.settings.voice = SoundEngine.clampVolume(value);
    if (this.voiceBus && this.context) this.voiceBus.gain.setTargetAtTime(this.settings.voice, this.context.currentTime, 0.03);
    this.saveSettings();
    this.emitState();
  }

  setCinematicVolume(value: number): void {
    this.settings.cinematic = SoundEngine.clampVolume(value);
    this.saveSettings();
    this.emitState();
  }

  setRadioSubtitles(enabled: boolean): void {
    this.settings.radioSubtitles = enabled;
    this.saveSettings();
  }

  setMusicDucked(ducked: boolean): void {
    this.pauseDucked = ducked;
    this.applyMusicVolume();
  }

  playRadio(cue: RadioCue): void {
    const definition = VOICE_ASSETS[cue];
    const now = performance.now();
    if ((this.radioCooldowns.get(cue) ?? 0) > now) return;
    this.radioCooldowns.set(cue, now + definition.cooldownMs);
    if (this.activeRadio) {
      const activePriority = RADIO_PRIORITY[VOICE_ASSETS[this.activeRadio.cue].priority];
      const nextPriority = RADIO_PRIORITY[definition.priority];
      if (nextPriority > activePriority) this.stopRadio();
      else {
        this.pendingRadio = cue;
        return;
      }
    }
    void this.startRadio(cue);
  }

  async playMusic(track: MusicTrack, nextTrack?: MusicTrack, variantIndex = 0): Promise<void> {
    this.desired = { track, nextTrack, variantIndex };
    this.lastError = undefined;
    const request = ++this.musicRequest;
    if (!this.context || this.context.state !== 'running') {
      this.playbackState = 'locked';
      this.emitState();
      return;
    }
    if (this.currentTrack === track && this.activeMusic) return;
    await this.startDesired(request);
  }

  stopMusic(fadeSeconds = 0.65): void {
    this.musicRequest += 1;
    this.desired = undefined;
    this.currentTrack = undefined;
    this.playbackState = this.context?.state === 'running' ? 'loading' : 'locked';
    if (this.activeMusic) this.fadeOut(this.activeMusic, Math.max(0.05, fadeSeconds));
    this.activeMusic = undefined;
    this.emitState();
  }

  play(cue: SoundCue, pan = 0): void {
    if (!this.context || this.context.state !== 'running' || !this.sfxBus || this.settings.sfx <= 0) return;
    const nowMs = performance.now();
    const minimum = CUE_INTERVALS[cue] ?? 0;
    if (nowMs - (this.lastCueAt.get(cue) ?? -Infinity) < minimum) return;
    this.lastCueAt.set(cue, nowMs);
    switch (cue) {
      case 'fire':
      case 'arc-fire':
        this.tone(290, 82, 0.075, 'square', 0.035, pan);
        this.tone(92, 48, 0.11, 'sine', 0.045, pan);
        this.noise(0.055, 0.025, 1_800, pan);
        break;
      case 'arc-impact': this.tone(520, 145, 0.08, 'square', 0.022, pan); this.noise(0.065, 0.018, 3_400, pan); break;
      case 'laser':
      case 'lance-fire':
        this.tone(1_280, 270, 0.19, 'sawtooth', 0.042, pan);
        this.tone(640, 410, 0.24, 'sine', 0.036, pan);
        this.noise(0.11, 0.014, 5_800, pan);
        break;
      case 'lance-impact': this.tone(1_850, 340, 0.15, 'sawtooth', 0.026, pan); this.noise(0.12, 0.012, 6_600, pan); break;
      case 'missile':
      case 'nova-fire':
        this.tone(145, 48, 0.25, 'sawtooth', 0.046, pan);
        this.tone(70, 40, 0.31, 'sine', 0.04, pan);
        this.noise(0.22, 0.027, 1_100, pan);
        break;
      case 'nova-impact': this.tone(108, 34, 0.31, 'sawtooth', 0.055, pan); this.noise(0.3, 0.052, 920, pan); break;
      case 'wing-fire': this.tone(510, 155, 0.055, 'square', 0.022, pan); this.noise(0.035, 0.012, 2_600, pan); break;
      case 'wing-impact': this.tone(760, 290, 0.055, 'triangle', 0.015, pan); this.noise(0.04, 0.008, 4_200, pan); break;
      case 'ion-fire':
        this.tone(1_120, 180, 0.31, 'sawtooth', 0.035, pan);
        this.sequence([1_760, 1_120, 2_260, 720], 0.045, 'square', 0.018, pan);
        this.noise(0.24, 0.02, 7_200, pan);
        break;
      case 'ion-impact': this.sequence([1_480, 860, 1_920], 0.027, 'square', 0.013, pan); this.noise(0.07, 0.008, 8_000, pan); break;
      case 'enemy-fire': this.tone(180, 110, 0.08, 'triangle', 0.025); break;
      case 'explode':
        this.noise(0.18, 0.09);
        this.tone(92, 36, 0.2, 'sawtooth', 0.05);
        break;
      case 'pickup': this.sequence([440, 660, 880], 0.055, 'sine', 0.08); break;
      case 'shield-hit': this.tone(520, 210, 0.2, 'sine', 0.09); break;
      case 'shield-ready': this.sequence([330, 495, 742], 0.08, 'sine', 0.065); break;
      case 'hull-hit':
        this.noise(0.26, 0.13);
        this.tone(110, 42, 0.24, 'square', 0.075);
        break;
      case 'warning': this.sequence([170, 110, 170], 0.14, 'square', 0.08); break;
      case 'emp':
        this.tone(92, 920, 0.38, 'sawtooth', 0.09);
        this.noise(0.28, 0.045);
        break;
      case 'purchase': this.sequence([330, 494, 659], 0.07, 'triangle', 0.07); break;
      case 'victory': this.sequence([330, 440, 554, 660], 0.16, 'triangle', 0.09); break;
      case 'defeat': this.sequence([220, 165, 110], 0.18, 'triangle', 0.07); break;
      default: break;
    }
  }

  private createAudioGraph(): void {
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.sfxBus = this.context.createGain();
    this.musicBus = this.context.createGain();
    this.voiceBus = this.context.createGain();
    const limiter = this.context.createDynamicsCompressor();
    limiter.threshold.value = -5;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.18;
    this.master.gain.value = 1;
    this.sfxBus.gain.value = this.settings.sfx;
    this.musicBus.gain.value = this.settings.music;
    this.voiceBus.gain.value = this.settings.voice;
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    const voiceHighPass = this.context.createBiquadFilter();
    voiceHighPass.type = 'highpass';
    voiceHighPass.frequency.value = 140;
    voiceHighPass.Q.value = 0.7;
    const voicePresence = this.context.createBiquadFilter();
    voicePresence.type = 'peaking';
    voicePresence.frequency.value = 2_750;
    voicePresence.Q.value = 0.85;
    voicePresence.gain.value = 3.2;
    const voiceCompressor = this.context.createDynamicsCompressor();
    voiceCompressor.threshold.value = -24;
    voiceCompressor.knee.value = 9;
    voiceCompressor.ratio.value = 3.5;
    voiceCompressor.attack.value = 0.008;
    voiceCompressor.release.value = 0.16;
    this.voiceBus.connect(voiceHighPass).connect(voicePresence).connect(voiceCompressor).connect(this.master);
    this.master.connect(limiter).connect(this.context.destination);
    this.context.addEventListener('statechange', () => {
      if (this.context?.state === 'suspended' && this.currentTrack) this.playbackState = 'locked';
      this.emitState();
    });
    void this.preloadVoiceAssets();
  }

  private async preloadVoiceAssets(): Promise<void> {
    this.voiceAssetCheckComplete = false;
    const buffers = await Promise.all(Object.values(VOICE_ASSETS).map((definition) => this.loadVoice(definition.file)));
    this.voiceAssetsReady = buffers.filter((buffer) => buffer !== null).length;
    this.voiceAssetsMissing = buffers.length - this.voiceAssetsReady;
    this.voiceAssetCheckComplete = true;
    if (this.voiceAssetsMissing === 0) this.lastVoiceError = undefined;
    this.emitState();
  }

  private async startRadio(cue: RadioCue): Promise<void> {
    const definition = VOICE_ASSETS[cue];
    this.activeRadio = { cue };
    this.voiceDurationSeconds = undefined;
    this.voiceGainCorrection = undefined;
    this.voicePlaybackState = this.context && this.settings.voice > 0 ? 'loading' : 'subtitle-only';
    window.dispatchEvent(new CustomEvent('aegis:radio-state', {
      detail: { active: true, cue, speaker: definition.speaker, subtitle: definition.subtitle, subtitles: this.settings.radioSubtitles },
    }));
    this.emitState();

    const buffer = this.context && this.settings.voice > 0 ? await this.loadVoice(definition.file) : null;
    if (!this.activeRadio || this.activeRadio.cue !== cue) return;
    if (buffer && this.context && this.voiceBus) {
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      const correction = SoundEngine.measuredVoiceGain(buffer);
      source.buffer = buffer;
      gain.gain.value = definition.gain * correction * RADIO_TRIM_GAIN;
      source.connect(gain).connect(this.voiceBus);
      source.addEventListener('ended', () => this.finishRadio(cue));
      this.activeRadio.source = source;
      this.voicePlaybackState = 'playing';
      this.voiceDurationSeconds = buffer.duration;
      this.voiceGainCorrection = correction;
      this.lastVoiceError = undefined;
      source.start();
      this.activeRadio.timer = window.setTimeout(() => this.finishRadio(cue), Math.max(2_200, buffer.duration * 1_000 + 100));
    } else {
      this.voicePlaybackState = 'subtitle-only';
      this.activeRadio.timer = window.setTimeout(() => this.finishRadio(cue), 2_200);
    }
    this.emitState();
  }

  private finishRadio(cue: RadioCue): void {
    if (!this.activeRadio || this.activeRadio.cue !== cue) return;
    if (this.activeRadio.timer !== undefined) window.clearTimeout(this.activeRadio.timer);
    this.activeRadio = undefined;
    this.voicePlaybackState = 'idle';
    window.dispatchEvent(new CustomEvent('aegis:radio-state', { detail: { active: false, cue } }));
    this.emitState();
    const pending = this.pendingRadio;
    this.pendingRadio = undefined;
    if (pending) void this.startRadio(pending);
  }

  private stopRadio(): void {
    if (!this.activeRadio) return;
    const cue = this.activeRadio.cue;
    if (this.activeRadio.timer !== undefined) window.clearTimeout(this.activeRadio.timer);
    try { this.activeRadio.source?.stop(); } catch { /* already ended */ }
    this.activeRadio = undefined;
    this.voicePlaybackState = 'idle';
    window.dispatchEvent(new CustomEvent('aegis:radio-state', { detail: { active: false, cue } }));
    this.emitState();
  }

  private async loadVoice(file: string): Promise<AudioBuffer | null> {
    if (this.voiceBuffers.has(file)) return this.voiceBuffers.get(file) ?? null;
    if (!this.context) return null;
    try {
      const response = await fetch(new URL(file, document.baseURI));
      if (!response.ok) throw new Error(`${file} returned HTTP ${response.status}`);
      const data = await response.arrayBuffer();
      if (data.byteLength === 0) throw new Error(`${file} is empty`);
      const buffer = await this.context.decodeAudioData(data);
      this.voiceBuffers.set(file, buffer);
      return buffer;
    } catch (error) {
      this.voiceBuffers.set(file, null);
      this.lastVoiceError = error instanceof Error ? error.message : String(error);
      return null;
    }
  }

  private async startDesired(request: number): Promise<void> {
    const desired = this.desired;
    if (!desired || !this.context || !this.musicBus) return;
    this.playbackState = 'loading';
    this.emitState();
    const definition = MUSIC_ASSETS[desired.track];
    const file = SoundEngine.musicFile(desired.track, desired.variantIndex);
    const buffer = await this.loadTrack(file);
    if (request !== this.musicRequest || desired !== this.desired || !this.context) return;
    if (!buffer) {
      if (this.debugSynth && definition.loop.mode !== 'none') {
        const previous = this.activeMusic;
        this.activeMusic = this.startDebugSynth(desired.track);
        this.currentTrack = desired.track;
        this.source = 'debug-synth';
        this.playbackState = 'playing';
        if (previous) this.fadeOut(previous, this.crossfadeSeconds(previous.track, desired.track));
        this.emitState();
        return;
      }
      this.currentTrack = undefined;
      this.source = undefined;
      this.playbackState = 'unavailable';
      this.lastError ??= `Unable to load ${file}`;
      this.emitState();
      return;
    }

    const previous = this.activeMusic;
    const fadeSeconds = previous ? this.crossfadeSeconds(previous.track, desired.track) : definition.loop.mode !== 'none' ? 0.8 : 0.1;
    this.activeMusic = this.startBufferMusic(desired, buffer, definition, request, fadeSeconds);
    this.currentTrack = desired.track;
    this.source = 'buffer';
    this.playbackState = 'playing';
    if (previous) this.fadeOut(previous, fadeSeconds);
    this.emitState();

    const preload = desired.nextTrack ?? definition.preloadNext;
    if (preload) void this.preload(preload);
  }

  private async loadTrack(file: string): Promise<AudioBuffer | null> {
    if (this.buffers.has(file)) return this.buffers.get(file) ?? null;
    if (!this.context) return null;
    try {
      const response = await fetch(new URL(file, document.baseURI));
      if (!response.ok) throw new Error(`${file} returned HTTP ${response.status}`);
      const data = await response.arrayBuffer();
      if (data.byteLength === 0) throw new Error(`${file} is empty`);
      const buffer = await this.context.decodeAudioData(data);
      this.buffers.set(file, buffer);
      this.trimBufferCache(file);
      return buffer;
    } catch (error) {
      this.buffers.set(file, null);
      this.lastError = error instanceof Error ? error.message : String(error);
      return null;
    }
  }

  private async preload(track: MusicTrack): Promise<void> {
    if (!this.context) return;
    await this.loadTrack(SoundEngine.musicFile(track, 0));
  }

  private startBufferMusic(
    desired: DesiredMusic,
    buffer: AudioBuffer,
    definition: MusicAssetDefinition,
    request: number,
    fadeSeconds: number,
  ): ActiveMusic {
    const context = this.context!;
    const trackGain = context.createGain();
    const measuredGain = SoundEngine.measuredGain(buffer);
    const startedAt = context.currentTime + 0.025;
    trackGain.gain.setValueAtTime(0.0001, context.currentTime);
    trackGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, definition.gain * measuredGain), context.currentTime + fadeSeconds);
    trackGain.connect(this.musicBus!);
    const active: ActiveMusic = {
      track: desired.track,
      gain: trackGain,
      voices: [],
      startedAt,
      bufferDuration: buffer.duration,
      loop: definition.loop,
    };

    buildMusicVoiceSchedule(buffer.duration, definition.loop).forEach((voice) => {
      this.scheduleVoice(
        active,
        buffer,
        startedAt + voice.startSeconds,
        voice.offsetSeconds,
        voice.durationSeconds,
        voice.iteration,
        voice.crossfadeSeconds,
      );
    });

    if (definition.loop.mode === 'none' && desired.nextTrack) {
      const transitionSeconds = desired.track === 'victory' && desired.nextTrack === 'hangar' ? 1.2 : 0.8;
      active.transitionTimer = window.setTimeout(() => {
        if (this.musicRequest === request && this.currentTrack === desired.track) {
          void this.playMusic(desired.nextTrack!);
        }
      }, Math.max(0, (buffer.duration - transitionSeconds) * 1_000));
    }
    const primary = active.voices[0].source;
    primary.addEventListener('ended', () => {
      if (this.currentTrack === desired.track && definition.loop.mode === 'none' && !desired.nextTrack) {
        this.currentTrack = undefined;
        this.activeMusic = undefined;
        this.playbackState = 'locked';
        this.emitState();
      }
    });
    this.logicalStartCount += 1;
    return active;
  }

  private scheduleVoice(
    active: ActiveMusic,
    buffer: AudioBuffer,
    startAt: number,
    offset: number,
    duration: number,
    iteration: number,
    crossfade: number,
  ): void {
    const context = this.context!;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    const endAt = startAt + duration;
    const fade = Math.min(crossfade, duration * 0.45);
    if (iteration === 0 || fade <= 0) gain.gain.setValueAtTime(1, startAt);
    else gain.gain.setValueCurveAtTime(SoundEngine.equalPowerIn(), startAt, fade);
    if (active.loop.mode !== 'none' && fade > 0) {
      gain.gain.setValueAtTime(1, Math.max(startAt + fade, endAt - fade));
      gain.gain.setValueCurveAtTime(SoundEngine.equalPowerOut(), endAt - fade, fade);
    }
    source.connect(gain).connect(active.gain);
    source.start(startAt, offset, duration);
    active.voices.push({ source, gain, startAt, endAt, iteration });
  }

  private startDebugSynth(track: MusicTrack): ActiveMusic {
    const context = this.context!;
    const gain = context.createGain();
    const oscillator = context.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.value = track === 'boss' ? 46.25 : 65.41;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.018, context.currentTime + 0.8);
    oscillator.connect(gain).connect(this.musicBus!);
    oscillator.start();
    this.logicalStartCount += 1;
    return {
      track,
      gain,
      voices: [{ source: oscillator, gain, startAt: context.currentTime, endAt: Number.POSITIVE_INFINITY, iteration: 0 }],
      startedAt: context.currentTime,
      bufferDuration: 0,
      loop: { mode: 'full', crossfadeSeconds: 0.8 },
    };
  }

  private fadeOut(music: ActiveMusic, seconds: number): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    if (music.transitionTimer !== undefined) window.clearTimeout(music.transitionTimer);
    music.gain.gain.cancelScheduledValues(now);
    music.gain.gain.setValueAtTime(Math.max(0.0001, music.gain.gain.value), now);
    music.gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    music.voices.forEach((voice) => {
      try { voice.source.stop(now + seconds + 0.03); } catch { /* already ended */ }
    });
  }

  private crossfadeSeconds(from: MusicTrack, to: MusicTrack): number {
    if (from.startsWith('mission-') && to === 'boss') return 1.2;
    if (from === 'victory' && to === 'hangar') return 1.2;
    return 0.8;
  }

  private static loopRegion(bufferDuration: number, loop: MusicLoopStrategy): { startSeconds: number; endSeconds: number } | undefined {
    if (loop.mode === 'none') return undefined;
    return {
      startSeconds: loop.mode === 'full' ? 0 : Math.max(0, bufferDuration - loop.tailSeconds),
      endSeconds: bufferDuration,
    };
  }

  private static equalPowerIn(): Float32Array {
    return Float32Array.from({ length: 48 }, (_, index) => Math.sin((index / 47) * Math.PI * 0.5));
  }

  private static equalPowerOut(): Float32Array {
    return Float32Array.from({ length: 48 }, (_, index) => Math.cos((index / 47) * Math.PI * 0.5));
  }

  private trimBufferCache(activeFile: string): void {
    while (this.buffers.size > 3) {
      const oldest = this.buffers.keys().next().value as string | undefined;
      if (!oldest) return;
      if (oldest === activeFile) {
        const buffer = this.buffers.get(oldest);
        this.buffers.delete(oldest);
        this.buffers.set(oldest, buffer ?? null);
      } else this.buffers.delete(oldest);
    }
  }

  private applyMusicVolume(): void {
    if (!this.musicBus || !this.context) return;
    const duckScale = this.pauseDucked ? 0.45 : 1;
    const target = this.settings.music * duckScale;
    this.musicBus.gain.setTargetAtTime(target, this.context.currentTime, 0.25);
  }

  private emitState(): void {
    window.dispatchEvent(new CustomEvent<AudioDebugState>('aegis:audio-state', { detail: this.getDebugState() }));
  }

  private fail(error: unknown): void {
    this.playbackState = 'unavailable';
    this.lastError = error instanceof Error ? error.message : String(error);
    this.emitState();
  }

  private tone(startHz: number, endHz: number, duration: number, type: OscillatorType, volume: number, pan = 0): void {
    if (!this.context || !this.sfxBus) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startHz, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endHz), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    this.connectToSfx(gain, pan);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  private sequence(notes: number[], noteLength: number, type: OscillatorType, volume: number, pan = 0): void {
    if (!this.context || !this.sfxBus) return;
    const start = this.context.currentTime;
    notes.forEach((frequency, index) => {
      const oscillator = this.context!.createOscillator();
      const gain = this.context!.createGain();
      const time = start + index * noteLength;
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(volume, time + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + noteLength * 0.9);
      oscillator.connect(gain);
      this.connectToSfx(gain, pan);
      oscillator.start(time);
      oscillator.stop(time + noteLength);
    });
  }

  private noise(duration: number, volume: number, cutoff = 820, pan = 0): void {
    if (!this.context || !this.sfxBus) return;
    const buffer = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * duration), this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(volume, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
    source.buffer = buffer;
    source.connect(filter).connect(gain);
    this.connectToSfx(gain, pan);
    source.start();
  }

  private connectToSfx(node: AudioNode, pan: number): void {
    if (!this.context || !this.sfxBus) return;
    const panner = this.context.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(panner).connect(this.sfxBus);
  }

  private saveSettings(): void {
    try { localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* optional */ }
  }

  private static loadSettings(): AudioSettings {
    try {
      const parsed = JSON.parse(localStorage.getItem(AUDIO_SETTINGS_KEY) ?? '{}') as Partial<AudioSettings>;
      return {
        music: SoundEngine.clampVolume(parsed.music ?? DEFAULT_SETTINGS.music),
        sfx: SoundEngine.clampVolume(parsed.sfx ?? DEFAULT_SETTINGS.sfx),
        voice: SoundEngine.clampVolume(parsed.voice ?? DEFAULT_SETTINGS.voice),
        cinematic: SoundEngine.clampVolume(parsed.cinematic ?? DEFAULT_SETTINGS.cinematic),
        radioSubtitles: parsed.radioSubtitles !== false,
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  private static musicFile(track: MusicTrack, variantIndex: number): string {
    const files = MUSIC_ASSETS[track].files;
    return files[Math.abs(Math.trunc(variantIndex)) % files.length];
  }

  private static measuredGain(buffer: AudioBuffer): number {
    let sum = 0;
    let samples = 0;
    const stride = Math.max(1, Math.floor(buffer.length / 120_000));
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < data.length; index += stride) {
        sum += data[index] * data[index];
        samples += 1;
      }
    }
    const rms = Math.sqrt(sum / Math.max(1, samples));
    return Math.max(0.68, Math.min(1.18, 0.13 / Math.max(0.001, rms)));
  }

  private static measuredVoiceGain(buffer: AudioBuffer): number {
    let sum = 0;
    let peak = 0;
    let samples = 0;
    const stride = Math.max(1, Math.floor(buffer.length / 120_000));
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < data.length; index += stride) {
        const sample = Math.abs(data[index]);
        sum += sample * sample;
        peak = Math.max(peak, sample);
        samples += 1;
      }
    }
    const rms = Math.sqrt(sum / Math.max(1, samples));
    const rmsTarget = 10 ** (-18 / 20);
    const peakLimit = 10 ** (-3 / 20);
    const correction = Math.min(rmsTarget / Math.max(0.001, rms), peakLimit / Math.max(0.001, peak));
    return Math.max(0.5, Math.min(2.8, correction));
  }

  private static clampVolume(value: number): number {
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  }
}
