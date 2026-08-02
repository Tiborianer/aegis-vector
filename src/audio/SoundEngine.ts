import type {
  AudioDebugState,
  MusicAssetDefinition,
  MusicPlaybackState,
  MusicTrack,
} from '../game/simulation/types';

export type SoundCue =
  | 'fire'
  | 'laser'
  | 'missile'
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

export interface AudioSettings {
  music: number;
  sfx: number;
}

interface ActiveMusic {
  track: MusicTrack;
  gain: GainNode;
  sources: AudioScheduledSourceNode[];
}

interface DesiredMusic {
  track: MusicTrack;
  nextTrack?: MusicTrack;
  variantIndex: number;
}

const AUDIO_SETTINGS_KEY = 'aegis-vector-audio-v1';
const DEFAULT_SETTINGS: AudioSettings = { music: 0.5, sfx: 0.7 };

export const MUSIC_ASSETS: Record<MusicTrack, MusicAssetDefinition> = {
  menu: { files: ['audio/menu.mp3'], loop: true, gain: 0.88, preloadNext: 'mission-coastal' },
  hangar: { files: ['audio/hangar.mp3'], loop: true, gain: 0.9 },
  'mission-coastal': { files: ['audio/mission-coastal.mp3'], loop: true, gain: 0.76, preloadNext: 'hangar' },
  'mission-minefield': { files: ['audio/mission-minefield.mp3'], loop: true, gain: 0.76, preloadNext: 'hangar' },
  'mission-fortress': { files: ['audio/mission-fortress.mp3'], loop: true, gain: 0.73, preloadNext: 'hangar' },
  boss: {
    files: ['audio/boss.mp3', 'audio/boss-mech-tyrants.mp3'],
    loop: true,
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
    loop: false,
    gain: 0.88,
  },
  defeat: { files: ['audio/defeat-signal.mp3', 'audio/defeat-debrief.mp3'], loop: false, gain: 0.84 },
};

export class SoundEngine {
  private context?: AudioContext;
  private master?: GainNode;
  private sfxBus?: GainNode;
  private musicBus?: GainNode;
  private settings: AudioSettings = SoundEngine.loadSettings();
  private buffers = new Map<string, AudioBuffer | null>();
  private activeMusic?: ActiveMusic;
  private desired?: DesiredMusic;
  private currentTrack?: MusicTrack;
  private playbackState: MusicPlaybackState = 'locked';
  private musicRequest = 0;
  private ducked = false;
  private lastError?: string;
  private source?: AudioDebugState['source'];
  private readonly debugSynth = new URLSearchParams(window.location.search).get('audioSynth') === '1';

  async unlock(): Promise<void> {
    try {
      if (!this.context) this.createAudioGraph();
      if (this.context?.state === 'suspended') await this.context.resume();
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
    return {
      contextState: this.context?.state ?? 'uninitialized',
      playbackState: this.playbackState,
      desiredTrack: this.desired?.track,
      currentTrack: this.currentTrack,
      source: this.source,
      musicGain: this.settings.music,
      sfxGain: this.settings.sfx,
      lastError: this.lastError,
    };
  }

  resetMix(): AudioSettings {
    this.settings = { ...DEFAULT_SETTINGS };
    this.applyMusicVolume();
    if (this.sfxBus && this.context) this.sfxBus.gain.setTargetAtTime(this.settings.sfx, this.context.currentTime, 0.03);
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

  setMusicDucked(ducked: boolean): void {
    this.ducked = ducked;
    this.applyMusicVolume();
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

  stopMusic(): void {
    this.musicRequest += 1;
    this.desired = undefined;
    this.currentTrack = undefined;
    this.playbackState = this.context?.state === 'running' ? 'loading' : 'locked';
    if (this.activeMusic) this.fadeOut(this.activeMusic, 0.65);
    this.activeMusic = undefined;
    this.emitState();
  }

  play(cue: SoundCue): void {
    if (!this.context || this.context.state !== 'running' || !this.sfxBus || this.settings.sfx <= 0) return;
    switch (cue) {
      case 'fire': this.tone(235, 120, 0.045, 'square', 0.025); break;
      case 'laser': this.tone(650, 180, 0.13, 'sawtooth', 0.055); break;
      case 'missile': this.tone(150, 65, 0.16, 'sawtooth', 0.05); break;
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
    this.master.gain.value = 1;
    this.sfxBus.gain.value = this.settings.sfx;
    this.musicBus.gain.value = this.settings.music;
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.master.connect(this.context.destination);
    this.context.addEventListener('statechange', () => {
      if (this.context?.state === 'suspended' && this.currentTrack) this.playbackState = 'locked';
      this.emitState();
    });
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
      if (this.debugSynth && definition.loop) {
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
    const fadeSeconds = previous ? this.crossfadeSeconds(previous.track, desired.track) : definition.loop ? 0.8 : 0.1;
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
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = definition.loop;
    const measuredGain = SoundEngine.measuredGain(buffer);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, definition.gain * measuredGain), context.currentTime + fadeSeconds);
    source.connect(gain).connect(this.musicBus!);
    source.start();
    if (!definition.loop && desired.nextTrack) {
      window.setTimeout(() => {
        if (this.musicRequest === request && this.currentTrack === desired.track) {
          void this.playMusic(desired.nextTrack!);
        }
      }, Math.max(0, (buffer.duration - 0.65) * 1_000));
    }
    source.addEventListener('ended', () => {
      if (this.currentTrack === desired.track && !definition.loop) {
        this.currentTrack = undefined;
        this.activeMusic = undefined;
        this.playbackState = this.desired?.nextTrack ? 'loading' : 'locked';
        this.emitState();
      }
    });
    return { track: desired.track, gain, sources: [source] };
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
    return { track, gain, sources: [oscillator] };
  }

  private fadeOut(music: ActiveMusic, seconds: number): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    music.gain.gain.cancelScheduledValues(now);
    music.gain.gain.setValueAtTime(Math.max(0.0001, music.gain.gain.value), now);
    music.gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    music.sources.forEach((source) => {
      try { source.stop(now + seconds + 0.03); } catch { /* already ended */ }
    });
  }

  private crossfadeSeconds(from: MusicTrack, to: MusicTrack): number {
    return from.startsWith('mission-') && to === 'boss' ? 1.2 : 0.8;
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
    const target = this.settings.music * (this.ducked ? 0.45 : 1);
    this.musicBus.gain.setTargetAtTime(target, this.context.currentTime, 0.08);
  }

  private emitState(): void {
    window.dispatchEvent(new CustomEvent<AudioDebugState>('aegis:audio-state', { detail: this.getDebugState() }));
  }

  private fail(error: unknown): void {
    this.playbackState = 'unavailable';
    this.lastError = error instanceof Error ? error.message : String(error);
    this.emitState();
  }

  private tone(startHz: number, endHz: number, duration: number, type: OscillatorType, volume: number): void {
    if (!this.context || !this.sfxBus) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startHz, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endHz), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.sfxBus);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  private sequence(notes: number[], noteLength: number, type: OscillatorType, volume: number): void {
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
      oscillator.connect(gain).connect(this.sfxBus!);
      oscillator.start(time);
      oscillator.stop(time + noteLength);
    });
  }

  private noise(duration: number, volume: number): void {
    if (!this.context || !this.sfxBus) return;
    const buffer = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * duration), this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    filter.type = 'lowpass';
    filter.frequency.value = 820;
    gain.gain.setValueAtTime(volume, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(this.sfxBus);
    source.start();
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

  private static clampVolume(value: number): number {
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  }
}
