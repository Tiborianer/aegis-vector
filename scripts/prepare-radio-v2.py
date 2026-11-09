"""Offline preparation of owner-approved ElevenLabs sources; never spends credits."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
# Optional workspace-local decoder, not a runtime game dependency.
sys.path.insert(0, str(ROOT / "outputs/tools/audio"))
import soundfile as sf

spec = importlib.util.spec_from_file_location("radio_processing", ROOT / "scripts/process-radio-voice.py")
processor = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(processor)

CUES = [
    ("shield-down", "Shield down.", "ECHO-7", 7101),
    ("hull-critical", "Hull critical.", "ECHO-7", 7102),
    ("shield-restored", "Shields restored.", "ECHO-7", 7103),
    ("emp-ready", "EMP ready.", "ECHO-7", 7104),
    ("arc-upgraded", "ARC cannon upgraded.", "Vale", 7201),
    ("nova-upgraded", "NOVA missiles upgraded.", "Vale", 7202),
    ("lance-upgraded", "LANCE laser upgraded.", "Vale", 7203),
    ("wing-upgraded", "WING drones upgraded.", "Vale", 7204),
    ("ion-upgraded", "ION conductor upgraded.", "Vale", 7205),
    ("aegis-upgraded", "Aegis capacity upgraded.", "Vale", 7206),
]

def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main() -> None:
    source_dir = ROOT / "assets/audio/voice-v2"
    raw_dir = source_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    output_dir = ROOT / "public/audio/voice-v2"
    output_dir.mkdir(parents=True, exist_ok=True)
    records = []
    for cue, phrase, speaker, seed in CUES:
        source = source_dir / f"{cue}.mp3"
        signal, rate = sf.read(source, dtype="float64", always_2d=True)
        signal = signal.mean(axis=1)
        if rate == 44100:
            # Windowed-sinc anti-alias filter, then exact 2:1 decimation.
            taps = np.arange(129, dtype=np.float64) - 64
            cutoff = 0.225
            kernel = 2 * cutoff * np.sinc(2 * cutoff * taps) * np.hamming(129)
            kernel /= kernel.sum()
            signal = np.convolve(signal, kernel, mode="same")[::2]
        elif rate != 22050:
            raise ValueError(f"Unexpected source sample rate for {cue}: {rate}")
        raw = raw_dir / f"{cue}.wav"
        sf.write(raw, signal, 22050, subtype="PCM_16")
        destination = output_dir / f"{cue}.wav"
        processor.process(raw, destination, seed)
        info = sf.info(destination)
        records.append({"cue": cue, "phrase": phrase, "speaker": speaker, "noiseSeed": seed,
            "voiceLabel": "Alice - Clear, Engaging Educator" if speaker == "ECHO-7" else "Sarah - Mature, Reassuring, Confident",
            "uiStabilityPercent": 80 if speaker == "ECHO-7" else 70,
            "source": str(source.relative_to(ROOT)), "sourceSha256": digest(source),
            "file": str(destination.relative_to(ROOT)), "sha256": digest(destination),
            "durationSeconds": info.duration, "bytes": destination.stat().st_size})
        print(f"{cue}: {info.duration:.3f}s, {destination.stat().st_size} bytes")
    manifest = {"version": 2, "generatedDate": "2026-11-01", "provider": "ElevenLabs",
        "workflow": "Signed-in Text to Speech browser UI; downloaded individual MP3 files. No API key used.",
        "model": "Eleven Multilingual v2", "planObservedAtCreation": "Creator",
        "creditsApprovedMaximum": 2000, "creditsUsed": 185,
        "creditBalanceBefore": 262139, "creditBalanceAfter": 261954,
        "voiceIds": "Not exposed in captured evidence; exact UI labels and original download names retained.",
        "settings": {"speed": 1, "similarity": 0.75, "style": 0, "speakerBoost": True},
        "processing": "Mono 22050Hz PCM16; original 140Hz high-pass, 6200Hz low-pass, presence, compression, saturation, seeded noise and edge-fade script. Runtime -6dB trim unchanged.",
        "rightsEvidence": {"planScreenshot": "outputs/overnight-pass/steam-pass/elevenlabs-creator-plan.png", "terms": "https://elevenlabs.io/terms-of-use", "scope": "Paid-plan generation observed. Owner final distribution-rights sign-off still required; no voice cloning performed."},
        "records": records}
    target = ROOT / "docs/audio/radio-v2-production.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(manifest, indent=2) + "\n")

if __name__ == "__main__":
    main()
