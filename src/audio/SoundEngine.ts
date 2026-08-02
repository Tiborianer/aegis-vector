import type { MusicTrack } from '../game/simulation/types';

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
  gain: GainNode;
  sources: AudioScheduledSourceNode[];
}

const AUDIO_SETTINGS_KEY = 'aegis-vector-audio-v1';
const MUSIC_FILES: Record<MusicTrack, string> = {
  menu: 'audio/menu.mp3',
  mission: 'audio/mission.mp3',
  boss: 'audio/boss.mp3',
  victory: 'audio/victory.mp3',
  defeat: 'audio/defeat.mp3',
};

export class SoundEngine {
  private context?: AudioContext;
  private master?: GainNode;
  private sfxBus?: GainNode;
  private musicBus?: GainNode;
  private settings: AudioSettings = SoundEngine.loadSettings();
  private buffers = new Map<MusicTrack, AudioBuffer | null>();
  private activeMusic?: ActiveMusic;
  private currentTrack?: MusicTrack;
  private musicRequest = 0;
  private ducked = false;

  async unlock(): Promise<void> {
    if (!this.context) {
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
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  setMusicVolume(value: number): void {
    this.settings.music = SoundEngine.clampVolume(value);
    this.applyMusicVolume();
    this.saveSettings();
  }

  setSfxVolume(value: number): void {
    this.settings.sfx = SoundEngine.clampVolume(value);
    if (this.sfxBus && this.context) this.sfxBus.gain.setTargetAtTime(this.settings.sfx, this.context.currentTime, 0.03);
    this.saveSettings();
  }

  setMusicDucked(ducked: boolean): void {
    this.ducked = ducked;
    this.applyMusicVolume();
  }

  async playMusic(track: MusicTrack): Promise<void> {
    await this.unlock();
    if (!this.context || !this.musicBus) return;
    if (this.currentTrack === track && this.activeMusic) return;
    const request = ++this.musicRequest;
    const buffer = await this.loadTrack(track);
    if (request !== this.musicRequest || !this.context) return;
    this.fadeOutActiveMusic();
    this.currentTrack = track;

    if (buffer) this.activeMusic = this.startBufferMusic(track, buffer);
    else if (track === 'menu' || track === 'mission' || track === 'boss') this.activeMusic = this.startSynthMusic(track);
    else {
      this.currentTrack = undefined;
      this.play(track === 'victory' ? 'victory' : 'defeat');
    }
  }

  stopMusic(): void {
    this.musicRequest += 1;
    this.currentTrack = undefined;
    this.fadeOutActiveMusic();
  }

  play(cue: SoundCue): void {
    if (!this.context || !this.sfxBus || this.settings.sfx <= 0) return;
    switch (cue) {
      case 'fire':
        this.tone(235, 120, 0.045, 'square', 0.025);
        break;
      case 'laser':
        this.tone(650, 180, 0.13, 'sawtooth', 0.055);
        break;
      case 'missile':
        this.tone(150, 65, 0.16, 'sawtooth', 0.05);
        break;
      case 'enemy-fire':
        this.tone(180, 110, 0.08, 'triangle', 0.025);
        break;
      case 'explode':
        this.noise(0.18, 0.09);
        this.tone(92, 36, 0.2, 'sawtooth', 0.05);
        break;
      case 'pickup':
        this.sequence([440, 660, 880], 0.055, 'sine', 0.08);
        break;
      case 'shield-hit':
        this.tone(520, 210, 0.2, 'sine', 0.09);
        break;
      case 'shield-ready':
        this.sequence([330, 495, 742], 0.08, 'sine', 0.065);
        break;
      case 'hull-hit':
        this.noise(0.26, 0.13);
        this.tone(110, 42, 0.24, 'square', 0.075);
        break;
      case 'warning':
        this.sequence([170, 110, 170], 0.14, 'square', 0.08);
        break;
      case 'emp':
        this.tone(92, 920, 0.38, 'sawtooth', 0.09);
        this.noise(0.28, 0.045);
        break;
      case 'purchase':
        this.sequence([330, 494, 659], 0.07, 'triangle', 0.07);
        break;
      case 'victory':
        this.sequence([330, 440, 554, 660], 0.16, 'triangle', 0.09);
        break;
      case 'defeat':
        this.sequence([220, 165, 110], 0.18, 'triangle', 0.07);
        break;
      default:
        break;
    }
  }

  private async loadTrack(track: MusicTrack): Promise<AudioBuffer | null> {
    if (this.buffers.has(track)) return this.buffers.get(track) ?? null;
    if (!this.context) return null;
    try {
      const url = new URL(MUSIC_FILES[track], document.baseURI);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Missing optional music asset: ${track}`);
      const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
      this.buffers.set(track, buffer);
      return buffer;
    } catch {
      this.buffers.set(track, null);
      return null;
    }
  }

  private startBufferMusic(track: MusicTrack, buffer: AudioBuffer): ActiveMusic {
    const context = this.context!;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = track === 'menu' || track === 'mission' || track === 'boss';
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(1, context.currentTime + 0.8);
    source.connect(gain).connect(this.musicBus!);
    source.start();
    source.addEventListener('ended', () => {
      if (this.currentTrack === track && !source.loop) this.currentTrack = undefined;
    });
    return { gain, sources: [source] };
  }

  private startSynthMusic(track: 'menu' | 'mission' | 'boss'): ActiveMusic {
    const context = this.context!;
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    const bass = context.createOscillator();
    const fifth = context.createOscillator();
    const base = track === 'boss' ? 46.25 : track === 'mission' ? 55 : 65.41;
    bass.type = track === 'menu' ? 'triangle' : 'sawtooth';
    fifth.type = 'triangle';
    bass.frequency.value = base;
    fifth.frequency.value = base * 1.5;
    filter.type = 'lowpass';
    filter.frequency.value = track === 'boss' ? 330 : track === 'mission' ? 260 : 210;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(track === 'menu' ? 0.025 : 0.035, context.currentTime + 0.8);
    bass.connect(filter);
    fifth.connect(filter);
    filter.connect(gain).connect(this.musicBus!);
    bass.start();
    fifth.start();
    return { gain, sources: [bass, fifth] };
  }

  private fadeOutActiveMusic(): void {
    if (!this.activeMusic || !this.context) return;
    const previous = this.activeMusic;
    this.activeMusic = undefined;
    const now = this.context.currentTime;
    previous.gain.gain.cancelScheduledValues(now);
    previous.gain.gain.setValueAtTime(Math.max(0.0001, previous.gain.gain.value), now);
    previous.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
    previous.sources.forEach((source) => {
      try {
        source.stop(now + 0.7);
      } catch {
        // The source may already have ended.
      }
    });
  }

  private applyMusicVolume(): void {
    if (!this.musicBus || !this.context) return;
    const target = this.settings.music * (this.ducked ? 0.45 : 1);
    this.musicBus.gain.setTargetAtTime(target, this.context.currentTime, 0.08);
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
    try {
      localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // Storage is optional.
    }
  }

  private static loadSettings(): AudioSettings {
    try {
      const parsed = JSON.parse(localStorage.getItem(AUDIO_SETTINGS_KEY) ?? '{}') as Partial<AudioSettings>;
      return {
        music: SoundEngine.clampVolume(parsed.music ?? 0.32),
        sfx: SoundEngine.clampVolume(parsed.sfx ?? 0.8),
      };
    } catch {
      return { music: 0.32, sfx: 0.8 };
    }
  }

  private static clampVolume(value: number): number {
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  }
}
