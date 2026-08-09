from __future__ import annotations

import sys
import wave
from pathlib import Path

import numpy as np


def low_pass(signal: np.ndarray, cutoff_hz: float, sample_rate: int) -> np.ndarray:
    alpha = 1.0 - np.exp(-2.0 * np.pi * cutoff_hz / sample_rate)
    output = np.empty_like(signal)
    output[0] = signal[0]
    for index in range(1, signal.size):
        output[index] = output[index - 1] + alpha * (signal[index] - output[index - 1])
    return output


def high_pass(signal: np.ndarray, cutoff_hz: float, sample_rate: int) -> np.ndarray:
    return signal - low_pass(signal, cutoff_hz, sample_rate)


def process(source: Path, destination: Path, seed: int) -> None:
    with wave.open(str(source), "rb") as reader:
        channels = reader.getnchannels()
        sample_width = reader.getsampwidth()
        sample_rate = reader.getframerate()
        frames = reader.readframes(reader.getnframes())

    if channels != 1 or sample_width != 2 or sample_rate != 22_050:
        raise ValueError(f"Expected mono 22.05kHz 16-bit PCM, received {channels} channels, {sample_rate}Hz at {sample_width * 8} bits")

    signal = np.frombuffer(frames, dtype="<i2").astype(np.float64) / 32768.0
    if signal.size == 0:
        raise ValueError("The speech renderer returned an empty audio stream")
    signal -= np.mean(signal)
    filtered = high_pass(signal, 140.0, sample_rate)
    filtered = low_pass(filtered, 6_200.0, sample_rate)
    presence = low_pass(high_pass(signal, 1_750.0, sample_rate), 4_600.0, sample_rate)
    filtered += presence * 0.32
    envelope = low_pass(np.abs(filtered), 28.0, sample_rate)
    threshold = 0.13
    desired = np.where(envelope > threshold, threshold + (envelope - threshold) / 3.2, envelope)
    filtered *= desired / np.maximum(envelope, 1e-5)
    filtered = np.tanh(filtered * 1.7) / np.tanh(1.7)
    rng = np.random.default_rng(seed)
    filtered += rng.normal(0.0, 0.0022, filtered.size) * np.clip(envelope / 0.055, 0.0, 1.0)
    fade_samples = min(int(sample_rate * 0.018), filtered.size // 2)
    if fade_samples > 0:
        fade = np.linspace(0.0, 1.0, fade_samples)
        filtered[:fade_samples] *= fade
        filtered[-fade_samples:] *= fade[::-1]
    filtered *= 0.89 / (float(np.max(np.abs(filtered))) or 1.0)
    padding = np.zeros(int(sample_rate * 0.045), dtype=np.float64)
    pcm = np.clip(np.concatenate((padding, filtered, padding)) * 32767.0, -32768, 32767).astype("<i2")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(destination), "wb") as writer:
        writer.setnchannels(1)
        writer.setsampwidth(2)
        writer.setframerate(sample_rate)
        writer.writeframes(pcm.tobytes())


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit("usage: process-radio-voice.py <source.wav> <destination.wav> <seed>")
    process(Path(sys.argv[1]), Path(sys.argv[2]), int(sys.argv[3]))
