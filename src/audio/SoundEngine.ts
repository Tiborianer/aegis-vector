export type SoundCue = 'fire' | 'laser' | 'missile' | 'enemy-fire' | 'explode' | 'pickup' | 'shield-hit' | 'shield-ready' | 'hull-hit' | 'warning' | 'victory';

export class SoundEngine {
  private context?: AudioContext;
  private master?: GainNode;
  private music?: GainNode;
  private enabled = true;
  private musicStarted = false;

  async unlock(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.18;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') await this.context.resume();
    if (!this.musicStarted) this.startMusicBed();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(enabled ? 0.18 : 0, this.context.currentTime, 0.04);
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  play(cue: SoundCue): void {
    if (!this.context || !this.master || !this.enabled) return;
    const now = this.context.currentTime;

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
      case 'victory':
        this.sequence([330, 440, 554, 660], 0.16, 'triangle', 0.09);
        break;
      default:
        break;
    }

    // Keep Safari from aggressively suspending after long quiet sections.
    void now;
  }

  private tone(startHz: number, endHz: number, duration: number, type: OscillatorType, volume: number): void {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startHz, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endHz), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  private sequence(notes: number[], noteLength: number, type: OscillatorType, volume: number): void {
    if (!this.context || !this.master) return;
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
      oscillator.connect(gain).connect(this.master!);
      oscillator.start(time);
      oscillator.stop(time + noteLength);
    });
  }

  private noise(duration: number, volume: number): void {
    if (!this.context || !this.master) return;
    const buffer = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * duration), this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    filter.type = 'lowpass';
    filter.frequency.value = 820;
    gain.gain.setValueAtTime(volume, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
  }

  private startMusicBed(): void {
    if (!this.context || !this.master) return;
    this.musicStarted = true;
    this.music = this.context.createGain();
    this.music.gain.value = 0.035;
    this.music.connect(this.master);

    const bass = this.context.createOscillator();
    const fifth = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    bass.type = 'sawtooth';
    fifth.type = 'triangle';
    bass.frequency.value = 55;
    fifth.frequency.value = 82.4;
    filter.type = 'lowpass';
    filter.frequency.value = 260;
    bass.connect(filter);
    fifth.connect(filter);
    filter.connect(this.music);
    bass.start();
    fifth.start();

    const lfo = this.context.createOscillator();
    const lfoGain = this.context.createGain();
    lfo.frequency.value = 0.18;
    lfoGain.gain.value = 0.016;
    lfo.connect(lfoGain).connect(this.music.gain);
    lfo.start();
  }
}
