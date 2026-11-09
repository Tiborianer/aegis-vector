"""Decode actual versioned candidates and publish a local review index. No API use.

Run with the bundled Python runtime (numpy) and outputs/tools/audio (soundfile).
Signal metrics establish technical properties, never listening or creative approval.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "outputs/tools/audio"))


def db(value: float) -> float:
    return round(20 * math.log10(max(1e-10, value)), 3)


def analyze(root: Path = ROOT) -> dict:
    import numpy as np
    import soundfile as sf
    plan = json.loads((root / "docs/audio/mission-score-revisions-2026-11-08.json").read_text())
    # The reviewed shipping manifest is the approval source of truth. Re-running
    # technical analysis must not erase an approval or extend it to other bytes.
    manifest_path = root / "src/audio/mission-scores.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    records = []
    for key, spec in plan["tracks"].items():
        record = {"id": key, "title": spec["title"], "file": None, "priorFile": spec["priorFile"],
                  "requestedSeconds": spec["music_length_ms"] / 1000,
                  "status": "awaiting-generation", "direction": spec["direction"]}
        path = root / "public" / spec["file"]
        receipt_path = root / "assets/audio/mission-score-revisions-2026-11-08" / (path.stem + ".receipt.json")
        if not path.exists():
            records.append(record)
            continue
        if not receipt_path.exists():
            raise ValueError(f"Receipt missing for {key}; reconcile the generation before analysis.")
        receipt = json.loads(receipt_path.read_text())
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if receipt["sha256"] != digest or receipt["bytes"] != path.stat().st_size:
            raise ValueError(f"Candidate does not match its original receipt: {key}")
        signal, sample_rate = sf.read(path, dtype="float32", always_2d=True)
        duration = len(signal) / sample_rate
        if not (signal.shape[1] == 2 and sample_rate == 44100
                and abs(duration - record["requestedSeconds"]) < .5 and np.isfinite(signal).all()):
            raise ValueError(f"Candidate failed duration, format or finite-sample check: {key}")
        peak = float(np.max(np.abs(signal)))
        rms = float(np.sqrt(np.mean(signal.astype(np.float64) ** 2)))
        windows = [float(np.sqrt(np.mean(signal[i:i+sample_rate].astype(np.float64) ** 2)))
                   for i in range(0, len(signal) - sample_rate + 1, sample_rate)]
        if rms < .0001:
            raise ValueError(f"Candidate is effectively silent: {key}")
        # Playback markers preserve the complete source file.
        # Some generated takes fade despite the brief; review a boundary before
        # that fade rather than presenting silence as a seamless runtime loop.
        loop_end = spec.get("loopEndSeconds", duration)
        if (not isinstance(loop_end, (int, float)) or isinstance(loop_end, bool)
                or not math.isfinite(loop_end) or not 40 <= loop_end <= duration):
            raise ValueError(f"Invalid candidate loop endpoint: {key}")
        end_sample = round(loop_end * sample_rate)
        fade_samples = sample_rate * 2
        tail_start = end_sample - sample_rate * 40
        ramp = np.linspace(0, math.pi / 2, fade_samples)[:, None]
        seam = signal[end_sample-fade_samples:end_sample] * np.cos(ramp) + signal[tail_start:tail_start+fade_samples] * np.sin(ramp)
        join = np.concatenate([signal[end_sample-sample_rate*8:end_sample-fade_samples], seam,
                               signal[tail_start+fade_samples:tail_start+sample_rate*8]])
        # Decode overshoot is not automatically an audible defect. Report the
        # actual combined seam and the finite audition at its fixed 50% gain;
        # do not change or silently normalize the provider's source recording.
        seam_peak = float(np.max(np.abs(seam)))
        audition_peak = float(np.max(np.abs(join))) * .5
        block = sample_rate // 10
        boundary_rms = [float(np.sqrt(np.mean(join[i:i+block] ** 2)))
                        for i in range(0, len(join)-block+1, block)]
        sections = []
        for start in range(0, int(record["requestedSeconds"]), 30):
            section = signal[start*sample_rate:min(len(signal), (start+30)*sample_rate)]
            sections.append({"startSeconds": start, "rmsDbfs": db(float(np.sqrt(np.mean(section.astype(np.float64) ** 2))))})
        record.update({"file": spec["file"], "status": "decoded-awaiting-owner-review", "durationSeconds": duration,
                       "sampleRate": sample_rate, "channels": signal.shape[1], "sha256": digest,
                       "bytes": path.stat().st_size, "peakDbfs": db(peak), "rmsDbfs": db(rms),
                       "fullScaleSamples": int(np.count_nonzero(np.abs(signal) >= 1)),
                       "silentWholeSecondsBelowMinus60dB": sum(value < .001 for value in windows),
                       "loopEndSeconds": loop_end,
                       "loopStartSeconds": loop_end - 40,
                       "loopCrossfadeSeconds": 2,
                       "loopReview": "Proposed playback markers only; original recording untrimmed. Owner audition required before activation.",
                       "loopBoundaryPeakDbfs": db(seam_peak),
                       "loopAuditionGain": .5,
                       "loopAuditionPeakDbfs": db(audition_peak),
                       "loopAuditionPeakExceedsFullScale": audition_peak > 1,
                       "loopBoundaryMinimum100msRmsDbfs": db(min(boundary_rms)),
                       "loopBoundaryWindowsBelowMinus35dB": sum(db(value) < -35 for value in boundary_rms),
                       "sectionEnergy": sections})
        active = manifest.get(key, {})
        if (active.get("status") == "reviewed" and active.get("file") == spec["file"]
                and active.get("sha256") == digest and active.get("bytes") == path.stat().st_size
                and active.get("loopEndSeconds", duration) == loop_end):
            record.update({"status": "owner-approved-active",
                           "ownerApproval": active.get("review", "Owner-approved in the active mission score manifest."),
                           "loopReview": "Approved active playback markers; original recording untrimmed."})
        records.append(record)
    count = sum(item["file"] is not None for item in records)
    approved = sum(item["status"] == "owner-approved-active" for item in records)
    total = len(records)
    return {"date": "2026-11-08", "status": "owner-approved-active" if approved == total else "awaiting-owner-review" if count == total else "awaiting-generation" if not count else "partial-generation",
            "generatedCount": count, "approvedActiveCount": approved, "totalCount": total,
            "limitation": "Full decoding and signal metrics are technical checks, not an audition or evidence of compositional variety. Approval and activation are reported only for exact file hashes and loop markers matching the reviewed shipping manifest.",
            "tracks": records}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write-report", action="store_true")
    options = parser.parse_args()
    report = analyze()
    if options.write_report:
        for path in [ROOT / "docs/audio/audio-review-2026-11-08.json", ROOT / "public/reviews/audio-2026-11-08.json"]:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(report, indent=2) + "\n")
    print(f'{report["generatedCount"]}/6 actual candidates decoded; review status: {report["status"]}. No network calls or audio activation.')
    for item in report["tracks"]:
        if item["file"]:
            print(f'{item["id"]}: {item["durationSeconds"]:.3f}s; peak {item["peakDbfs"]}dBFS; loop minimum {item["loopBoundaryMinimum100msRmsDbfs"]}dBFS; {item["status"]}.')


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("Audio analysis stopped. Check dependencies, candidate files and receipts locally; no files activated.", file=sys.stderr)
        raise SystemExit(1) from None
