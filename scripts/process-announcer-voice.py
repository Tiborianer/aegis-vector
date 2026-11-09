from __future__ import annotations

import sys
import wave
from pathlib import Path

import numpy as np


SAMPLE_RATE = 44_100


def low_pass(signal: np.ndarray, cutoff_hz: float, sample_rate: int) -> np.ndarray:
    alpha = 1.0 - np.exp(-2.0 * np.pi * cutoff_hz / sample_rate)
    output = np.empty_like(signal)
    output[0] = signal[0]
    for index in range(1, signal.size):
        output[index] = output[index - 1] + alpha * (signal[index] - output[index - 1])
    return output


def high_pass(signal: np.ndarray, cutoff_hz: float, sample_rate: int) -> np.ndarray:
    return signal - low_pass(signal, cutoff_hz, sample_rate)


def process(source: Path, destination: Path) -> None:
    with wave.open(str(source), "rb") as reader:
        channels = reader.getnchannels()
        sample_width = reader.getsampwidth()
        source_rate = reader.getframerate()
        frames = reader.readframes(reader.getnframes())
    if channels != 1 or sample_width != 2:
        raise ValueError("Expected mono 16-bit PCM source audio")
    signal = np.frombuffer(frames, dtype="<i2").astype(np.float64) / 32768.0
    if signal.size == 0:
        raise ValueError("The speech renderer returned an empty audio stream")
    signal -= np.mean(signal)

    # Resample to 44.1kHz while lowering pitch and pacing by about 12 percent.
    speed = 0.88
    duration = signal.size / source_rate / speed
    output_length = int(duration * SAMPLE_RATE)
    source_positions = np.arange(output_length, dtype=np.float64) * source_rate * speed / SAMPLE_RATE
    pitched = np.interp(source_positions, np.arange(signal.size), signal, left=0.0, right=0.0)
    filtered = high_pass(pitched, 72.0, SAMPLE_RATE)
    filtered = low_pass(filtered, 9_500.0, SAMPLE_RATE)
    bass = low_pass(high_pass(pitched, 85.0, SAMPLE_RATE), 245.0, SAMPLE_RATE)
    presence = low_pass(high_pass(pitched, 1_900.0, SAMPLE_RATE), 4_200.0, SAMPLE_RATE)
    filtered += bass * 0.18 + presence * 0.12

    envelope = low_pass(np.abs(filtered), 24.0, SAMPLE_RATE)
    threshold = 0.16
    desired = np.where(envelope > threshold, threshold + (envelope - threshold) / 3.5, envelope)
    filtered *= desired / np.maximum(envelope, 1e-5)
    filtered = np.tanh(filtered * 1.45) / np.tanh(1.45)

    # Centered voice with short cinematic reflections, not a cavernous trailer reverb.
    tail = int(0.48 * SAMPLE_RATE)
    padded = np.pad(filtered, (int(0.08 * SAMPLE_RATE), tail))
    left = padded.copy()
    right = padded.copy()
    for delay_ms, gain in ((43, 0.12), (88, 0.075), (146, 0.045)):
        delay = int(delay_ms * SAMPLE_RATE / 1000)
        left[delay:] += padded[:-delay] * gain
        right[delay:] += padded[:-delay] * gain * 0.92
    fade = int(0.025 * SAMPLE_RATE)
    left[:fade] *= np.linspace(0.0, 1.0, fade)
    right[:fade] *= np.linspace(0.0, 1.0, fade)
    left[-fade:] *= np.linspace(1.0, 0.0, fade)
    right[-fade:] *= np.linspace(1.0, 0.0, fade)
    stereo = np.column_stack((left, right))
    peak = float(np.max(np.abs(stereo))) or 1.0
    stereo *= 0.84 / peak
    pcm = np.clip(stereo * 32767.0, -32768, 32767).astype("<i2")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(destination), "wb") as writer:
        writer.setnchannels(2)
        writer.setsampwidth(2)
        writer.setframerate(SAMPLE_RATE)
        writer.writeframes(pcm.tobytes())


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: process-announcer-voice.py <source.wav> <destination.wav>")
    process(Path(sys.argv[1]), Path(sys.argv[2]))
