"""Offline, non-overwriting v3/v4 corrections and the ECHO-7 v5 Shield Hit cue. Dry run by default."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CUES = {"arc-upgraded": ("Arc cannon upgraded.", 7201), "ion-upgraded": ("Ion conductor upgraded.", 7205),
        "shield-hit": ("Shield hit.", 7105)}
ION_RETAKE = ("Eye-on conductor upgraded.", 7205)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def write_new_json(path: Path, value: dict) -> None:
    with path.open("x", encoding="utf-8") as handle:
        handle.write(json.dumps(value, indent=2) + "\n")


def prepare_cue(root: Path, cue: str, prepare: bool = False, take: str | None = None) -> str:
    if cue not in CUES:
        raise ValueError("Unknown correction cue")
    if take is not None and (take != "ion-v4" or cue != "ion-upgraded"):
        raise ValueError("The only explicit retake is ion-v4 for ion-upgraded")
    version = 5 if cue == "shield-hit" else 4 if take else 3
    directory = root / f"assets/audio/voice-v{version}"
    source = directory / f"{cue}.mp3"
    raw = directory / "raw" / f"{cue}.wav"
    output = root / f"public/audio/voice-v{version}" / f"{cue}.wav"
    pending = directory / f"{cue}.processing.request.json"
    receipt = directory / f"{cue}.processing.receipt.json"
    if any(path.exists() or path.is_symlink() for path in (raw, output, pending, receipt)):
        print(f"{cue}: existing processing output or receipt; skipping without overwriting.")
        return "skipped"
    if not prepare:
        print(f"{cue}: source {'present' if source.is_file() else 'pending'}; dry run, no writes or decoding.")
        return "dry-run"
    if not source.is_file() or source.is_symlink() or not 1_024 <= source.stat().st_size <= 2_000_000:
        raise ValueError("A regular, bounded source MP3 is required before offline processing")
    generation_receipt = json.loads((directory / f"{cue}.receipt.json").read_text(encoding="utf-8"))
    source_bytes = source.read_bytes()
    phrase, seed = ION_RETAKE if take else CUES[cue]
    if (generation_receipt.get("status") != "source-saved"
            or generation_receipt.get("cue") != cue
            or (take is not None and generation_receipt.get("take") != take)
            or generation_receipt.get("request", {}).get("text") != phrase
            or generation_receipt.get("sourceSha256") != digest(source_bytes)):
        raise ValueError("Source and generation receipt do not match; manual review required")
    if cue == "shield-hit" and (generation_receipt.get("voiceId") != "Xb7hH8MSUJpSbSDYk0k2"
            or generation_receipt.get("speaker") != "ECHO-7"
            or generation_receipt.get("request", {}).get("voice_settings", {}).get("stability") != .8):
        raise ValueError("Shield Hit source must match the approved ECHO-7 Alice voice")

    # Same optional decoder and processing script as prepare-radio-v2.py. Imports
    # happen only for explicit offline preparation, never for dry-run inspection.
    import numpy as np
    sys.path.insert(0, str(ROOT / "outputs/tools/audio"))
    import soundfile as sf
    spec = importlib.util.spec_from_file_location("radio_processing", ROOT / "scripts/process-radio-voice.py")
    processor = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(processor)
    write_new_json(pending, {"cue": cue, "status": "processing-started", "sourceSha256": digest(source_bytes)})
    signal, rate = sf.read(source, dtype="float64", always_2d=True)
    if signal.size == 0 or not np.isfinite(signal).all() or not .1 <= len(signal) / rate <= 5:
        raise ValueError("Source contains invalid or implausibly short/long audio")
    signal = signal.mean(axis=1)
    if rate == 44100:
        taps = np.arange(129, dtype=np.float64) - 64
        cutoff = .225
        kernel = 2 * cutoff * np.sinc(2 * cutoff * taps) * np.hamming(129)
        kernel /= kernel.sum()
        signal = np.convolve(signal, kernel, mode="same")[::2]
    elif rate != 22050:
        raise ValueError("Unexpected source rate; expected 44100Hz or 22050Hz")
    with tempfile.TemporaryDirectory(prefix="aegis-radio-correction-") as temporary:
        temp_raw = Path(temporary) / "raw.wav"
        temp_output = Path(temporary) / "processed.wav"
        sf.write(temp_raw, signal, 22050, subtype="PCM_16")
        processor.process(temp_raw, temp_output, seed)
        decoded, output_rate = sf.read(temp_output, dtype="float64", always_2d=True)
        info = sf.info(temp_output)
        centered = decoded - decoded.mean()
        if (output_rate != 22050 or info.channels != 1 or info.subtype != "PCM_16"
                or not .2 <= info.duration <= 5 or not np.isfinite(decoded).all()
                or np.sqrt(np.mean(centered ** 2)) < 32 / 32768
                or np.max(np.abs(centered)) < 128 / 32768
                or np.count_nonzero(np.abs(centered) >= 64 / 32768) < 441):
            raise ValueError("Processed output failed format, duration, or audibility validation")
        raw.parent.mkdir(parents=True, exist_ok=True)
        output.parent.mkdir(parents=True, exist_ok=True)
        raw_bytes, output_bytes = temp_raw.read_bytes(), temp_output.read_bytes()
        with raw.open("xb") as handle:
            handle.write(raw_bytes)
        with output.open("xb") as handle:
            handle.write(output_bytes)
    write_new_json(receipt, {
        "cue": cue, "phrase": phrase, "speaker": "ECHO-7" if cue == "shield-hit" else "Vale", "voiceId": generation_receipt.get("voiceId"),
        **({"take": take} if take else {}),
        "voiceLabel": generation_receipt.get("voiceLabel"), "noiseSeed": seed,
        "status": "processed-awaiting-audition", "preparedAt": datetime.now(timezone.utc).isoformat(),
        "source": str(source.relative_to(root)), "sourceSha256": digest(source_bytes),
        "file": str(output.relative_to(root)), "sha256": digest(output_bytes), "bytes": len(output_bytes),
        "sampleRate": output_rate, "channels": info.channels, "encoding": info.subtype,
        "durationSeconds": info.duration, "processingScriptSha256": digest((ROOT / "scripts/process-radio-voice.py").read_bytes()),
        "review": "Decode passed. Complete audition, pronunciation, speaker consistency and runtime review remain required. Runtime mapping and -6dB trim unchanged.",
    })
    print(f"{cue}: prepared {info.duration:.3f}s mono 22050Hz PCM16. Audition required; no runtime mapping changed.")
    return "processed"


def main(argv: list[str] | None = None, root: Path = ROOT) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cue", choices=CUES)
    parser.add_argument("--take", choices=["ion-v4"], help="Explicit English EYE-on retake; requires --cue=ion-upgraded")
    parser.add_argument("--prepare", action="store_true", help="Write one explicitly selected correction; never calls an API")
    options = parser.parse_args(argv)
    if options.prepare and not options.cue:
        parser.error("--prepare requires one explicit --cue")
    if options.take and options.cue != "ion-upgraded":
        parser.error("--take=ion-v4 requires --cue=ion-upgraded")
    for cue in ([options.cue] if options.cue else CUES):
        prepare_cue(root, cue, options.prepare, options.take)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Keep arbitrary decoder/file/provider text out of logs.
        print("Radio correction preparation stopped. Preserve sources and receipts; inspect locally before manual recovery.", file=sys.stderr)
        raise SystemExit(1)
