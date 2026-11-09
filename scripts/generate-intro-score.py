from __future__ import annotations

import math
import sys
import wave
from pathlib import Path

import numpy as np


SAMPLE_RATE = 44_100
DURATION_SECONDS = 100.0
RNG = np.random.default_rng(8077)


def midi(note: float) -> float:
    return 440.0 * (2.0 ** ((note - 69.0) / 12.0))


def envelope(length: int, attack: float, release: float) -> np.ndarray:
    env = np.ones(length, dtype=np.float32)
    attack_samples = min(length, max(1, int(attack * SAMPLE_RATE)))
    release_samples = min(length, max(1, int(release * SAMPLE_RATE)))
    env[:attack_samples] = np.linspace(0.0, 1.0, attack_samples, dtype=np.float32)
    env[-release_samples:] *= np.linspace(1.0, 0.0, release_samples, dtype=np.float32)
    return env


def pan_stereo(mono: np.ndarray, pan: float) -> np.ndarray:
    angle = (np.clip(pan, -1.0, 1.0) + 1.0) * math.pi / 4.0
    return np.column_stack((mono * math.cos(angle), mono * math.sin(angle))).astype(np.float32)


def additive_wave(time: np.ndarray, frequency: float, harmonics: int = 5) -> np.ndarray:
    result = np.zeros_like(time, dtype=np.float32)
    for harmonic in range(1, harmonics + 1):
        result += np.sin(2.0 * math.pi * frequency * harmonic * time).astype(np.float32) / (harmonic ** 1.22)
    return result / 1.65


class Score:
    def __init__(self) -> None:
        self.samples = np.zeros((int(DURATION_SECONDS * SAMPLE_RATE), 2), dtype=np.float32)

    def add(self, start: float, stereo: np.ndarray) -> None:
        first = max(0, int(start * SAMPLE_RATE))
        last = min(self.samples.shape[0], first + stereo.shape[0])
        if last > first:
            self.samples[first:last] += stereo[: last - first]

    def note(
        self,
        start: float,
        duration: float,
        note: float,
        amplitude: float,
        pan: float = 0.0,
        attack: float = 0.015,
        release: float = 0.12,
        color: str = "sine",
    ) -> None:
        length = max(2, int(duration * SAMPLE_RATE))
        time = np.arange(length, dtype=np.float32) / SAMPLE_RATE
        frequency = midi(note)
        if color == "saw":
            mono = additive_wave(time, frequency, 6)
        elif color == "brass":
            mono = additive_wave(time, frequency, 4) * 0.72
            mono += np.sin(2.0 * math.pi * frequency * 0.501 * time).astype(np.float32) * 0.28
        elif color == "glass":
            mono = np.sin(2.0 * math.pi * frequency * time).astype(np.float32)
            mono += np.sin(2.0 * math.pi * frequency * 2.01 * time).astype(np.float32) * 0.32
            mono += np.sin(2.0 * math.pi * frequency * 3.98 * time).astype(np.float32) * 0.12
        else:
            mono = np.sin(2.0 * math.pi * frequency * time).astype(np.float32)
        mono *= envelope(length, attack, release) * amplitude
        self.add(start, pan_stereo(mono, pan))

    def pad(self, start: float, duration: float, chord: tuple[int, ...], amplitude: float) -> None:
        length = int(duration * SAMPLE_RATE)
        time = np.arange(length, dtype=np.float32) / SAMPLE_RATE
        stereo = np.zeros((length, 2), dtype=np.float32)
        pans = np.linspace(-0.65, 0.65, len(chord))
        for index, note in enumerate(chord):
            frequency = midi(note)
            detuned = (
                np.sin(2.0 * math.pi * frequency * 0.997 * time)
                + np.sin(2.0 * math.pi * frequency * 1.003 * time)
                + 0.3 * np.sin(2.0 * math.pi * frequency * 2.0 * time)
            ).astype(np.float32)
            slow_motion = 0.82 + 0.18 * np.sin(2.0 * math.pi * (0.045 + index * 0.007) * time + index)
            stereo += pan_stereo(detuned * slow_motion.astype(np.float32) * amplitude / 2.3, float(pans[index]))
        stereo *= envelope(length, 2.5, 3.2)[:, None]
        self.add(start, stereo)

    def kick(self, start: float, amplitude: float = 0.6) -> None:
        duration = 0.52
        length = int(duration * SAMPLE_RATE)
        time = np.arange(length, dtype=np.float32) / SAMPLE_RATE
        phase = 2.0 * math.pi * (47.0 * time + 52.0 * np.exp(-time * 23.0) * time)
        body = np.sin(phase).astype(np.float32) * np.exp(-time * 8.5)
        click = RNG.normal(0.0, 1.0, length).astype(np.float32) * np.exp(-time * 70.0) * 0.12
        self.add(start, pan_stereo((body + click) * amplitude, 0.0))

    def snare(self, start: float, amplitude: float = 0.28) -> None:
        length = int(0.34 * SAMPLE_RATE)
        time = np.arange(length, dtype=np.float32) / SAMPLE_RATE
        noise = RNG.normal(0.0, 1.0, length).astype(np.float32)
        noise = np.concatenate((noise[:1], np.diff(noise))).astype(np.float32)
        tone = np.sin(2.0 * math.pi * 178.0 * time).astype(np.float32)
        mono = (noise * 0.25 + tone * 0.34) * np.exp(-time * 13.5) * amplitude
        self.add(start, pan_stereo(mono, 0.06))

    def hat(self, start: float, amplitude: float = 0.08, pan: float = 0.0) -> None:
        length = int(0.075 * SAMPLE_RATE)
        time = np.arange(length, dtype=np.float32) / SAMPLE_RATE
        noise = RNG.normal(0.0, 1.0, length).astype(np.float32)
        bright = np.concatenate((noise[:1], np.diff(noise))).astype(np.float32)
        self.add(start, pan_stereo(bright * np.exp(-time * 55.0) * amplitude, pan))

    def pulse(self, start: float, note: int, amplitude: float = 0.12) -> None:
        self.note(start, 0.22, note, amplitude, 0.0, 0.004, 0.15, "saw")

    def radar(self, start: float, pan: float) -> None:
        self.note(start, 0.55, 81, 0.065, pan, 0.006, 0.45, "glass")
        self.note(start + 0.12, 0.42, 88, 0.04, -pan, 0.006, 0.35, "glass")

    def impact(self, start: float, amplitude: float = 0.7) -> None:
        length = int(2.2 * SAMPLE_RATE)
        time = np.arange(length, dtype=np.float32) / SAMPLE_RATE
        sweep_phase = 2.0 * math.pi * (31.0 * time + 38.0 * (1.0 - np.exp(-time * 7.0)))
        sub = np.sin(sweep_phase).astype(np.float32) * np.exp(-time * 2.2)
        noise = RNG.normal(0.0, 1.0, length).astype(np.float32)
        crack = np.concatenate((noise[:1], np.diff(noise))).astype(np.float32) * np.exp(-time * 18.0)
        self.add(start, pan_stereo((sub + crack * 0.13) * amplitude, 0.0))

    def riser(self, start: float, duration: float, amplitude: float = 0.12) -> None:
        length = int(duration * SAMPLE_RATE)
        time = np.arange(length, dtype=np.float32) / SAMPLE_RATE
        noise = RNG.normal(0.0, 1.0, length).astype(np.float32)
        bright = np.concatenate((noise[:1], np.diff(noise))).astype(np.float32)
        phase = 2.0 * math.pi * (80.0 * time + 420.0 * time * time / max(duration, 0.1))
        tone = np.sin(phase).astype(np.float32)
        rise = np.linspace(0.0, 1.0, length, dtype=np.float32) ** 2
        mono = (bright * 0.055 + tone * 0.15) * rise * amplitude
        self.add(start, pan_stereo(mono, 0.0))

    def finish(self, destination: Path) -> None:
        # Preserve a clearly rising dramatic contour across the complete film.
        story_gain = np.interp(
            np.arange(self.samples.shape[0], dtype=np.float32) / SAMPLE_RATE,
            (0.0, 24.0, 32.0, 65.0, 90.0, 92.0, 100.0),
            (0.50, 0.58, 0.75, 1.00, 1.14, 1.25, 1.20),
        ).astype(np.float32)
        self.samples *= story_gain[:, None]
        # Wide short ambience without obscuring the center channel.
        delay_a = int(0.19 * SAMPLE_RATE)
        delay_b = int(0.31 * SAMPLE_RATE)
        left = self.samples[:, 0].copy()
        right = self.samples[:, 1].copy()
        self.samples[delay_a:, 0] += right[:-delay_a] * 0.09
        self.samples[delay_b:, 1] += left[:-delay_b] * 0.075
        fade_out = int(0.22 * SAMPLE_RATE)
        self.samples[-fade_out:] *= np.linspace(1.0, 0.0, fade_out, dtype=np.float32)[:, None]
        # Soft bus compression and conservative mastering.
        self.samples = np.tanh(self.samples * 1.18).astype(np.float32)
        peak = float(np.max(np.abs(self.samples))) or 1.0
        self.samples *= 0.89 / peak
        pcm = np.clip(self.samples * 32767.0, -32768, 32767).astype("<i2")
        destination.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(destination), "wb") as writer:
            writer.setnchannels(2)
            writer.setsampwidth(2)
            writer.setframerate(SAMPLE_RATE)
            writer.writeframes(pcm.tobytes())


def compose(destination: Path) -> None:
    score = Score()
    progression = (
        (50, 53, 57, 62),  # D minor
        (46, 50, 53, 57),  # B-flat major
        (41, 45, 48, 53),  # F major
        (48, 52, 55, 60),  # C major
    )

    # 0–32 seconds: distant threat and the first CROWN signal.
    score.pad(0.0, 17.0, (38, 45, 50, 53), 0.075)
    score.pad(14.0, 18.0, (34, 41, 46, 50), 0.07)
    score.note(1.2, 12.0, 26, 0.15, -0.12, 2.2, 3.0, "sine")
    score.note(18.0, 13.0, 27, 0.12, 0.12, 2.0, 3.0, "sine")
    for start, pan in ((6.0, -0.65), (12.5, 0.45), (20.0, -0.2), (27.0, 0.7)):
        score.radar(start, pan)
    score.note(23.5, 5.0, 74, 0.045, -0.5, 1.4, 2.5, "glass")
    score.riser(27.0, 5.0, 0.6)

    # 32–66 seconds: movement gathers and the approaching fleet becomes clear.
    for index, start in enumerate(np.arange(30.0, 66.0, 8.0)):
        score.pad(float(start), 10.2, progression[index % 4], 0.058 + index * 0.004)
    beat = 60.0 / 96.0
    bass_notes = (38, 38, 34, 34, 41, 41, 36, 36)
    for step, start in enumerate(np.arange(32.0, 66.0, beat)):
        if step % 2 == 0:
            score.kick(float(start), 0.32)
        if step % 4 == 2:
            score.snare(float(start), 0.22)
        score.pulse(float(start), bass_notes[(step // 2) % len(bass_notes)], 0.075)
        if step % 2 == 1:
            score.hat(float(start), 0.038, -0.35 if step % 4 == 1 else 0.35)
    arp = (62, 65, 69, 74, 69, 65, 60, 64, 67, 72, 67, 64)
    for step, start in enumerate(np.arange(44.0, 66.0, beat / 2.0)):
        score.note(float(start), beat * 0.42, arp[step % len(arp)], 0.036, -0.45 + (step % 5) * 0.22, 0.006, 0.16, "glass")

    # 66–91 seconds: battle readiness and an unmistakable rise.
    beat = 60.0 / 116.0
    for index, start in enumerate(np.arange(64.0, 92.0, 7.0)):
        score.pad(float(start), 9.0, progression[index % 4], 0.072)
    for step, start in enumerate(np.arange(66.0, 92.0, beat)):
        score.kick(float(start), 0.43 if step % 4 == 0 else 0.31)
        if step % 4 == 2:
            score.snare(float(start), 0.31)
        score.pulse(float(start), bass_notes[step % len(bass_notes)], 0.105)
        score.hat(float(start + beat / 2.0), 0.052, -0.45 if step % 2 else 0.45)
    heroic = (62, 69, 70, 65)
    for phrase_start in (70.0, 78.0, 86.0):
        for index, note in enumerate(heroic):
            score.note(phrase_start + index * 1.0, 1.3, note, 0.075 + (phrase_start - 70.0) * 0.002, -0.22 + index * 0.14, 0.025, 0.4, "brass")
    score.riser(84.0, 8.0, 0.95)

    # 92–100 seconds: title strike and concise heroic resolution.
    score.impact(92.0, 0.76)
    score.pad(91.7, 8.3, (38, 45, 50, 54, 57), 0.12)
    for index, note in enumerate((62, 69, 70, 65)):
        score.note(92.1 + index * 1.25, 1.65, note, 0.16, (-0.25, 0.2, -0.08, 0.28)[index], 0.018, 0.48, "brass")
    for start in (92.0, 94.5, 97.0):
        score.kick(start, 0.62)
    score.impact(97.0, 0.54)
    score.note(97.0, 3.0, 50, 0.19, -0.24, 0.03, 1.15, "brass")
    score.note(97.0, 3.0, 57, 0.17, 0.24, 0.03, 1.15, "brass")
    score.note(97.0, 3.0, 74, 0.075, 0.0, 0.03, 1.3, "glass")
    score.finish(destination)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: generate-intro-score.py <destination.wav>")
    compose(Path(sys.argv[1]))
