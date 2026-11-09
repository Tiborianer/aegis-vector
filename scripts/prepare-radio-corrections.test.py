"""Offline-only tests. Existing v2 MP3 is a local decoder fixture; no generated speech or API calls."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("corrections", ROOT / "scripts/prepare-radio-corrections.py")
corrections = importlib.util.module_from_spec(spec)
spec.loader.exec_module(corrections)


class PreparationTests(unittest.TestCase):
    def fixture(self, root):
        source_bytes = (ROOT / "assets/audio/voice-v2/arc-upgraded.mp3").read_bytes()
        directory = root / "assets/audio/voice-v3"
        directory.mkdir(parents=True)
        (directory / "arc-upgraded.mp3").write_bytes(source_bytes)
        (directory / "arc-upgraded.receipt.json").write_text(json.dumps({
            "cue": "arc-upgraded", "status": "source-saved", "voiceId": "observedSarahFixture123",
            "voiceLabel": "Sarah - Mature, Reassuring, Confident", "request": {"text": "Arc cannon upgraded."},
            "sourceSha256": corrections.digest(source_bytes),
        }))
        return directory

    def test_dry_run_never_creates_files(self):
        with tempfile.TemporaryDirectory(prefix="aegis-radio-prepare-test-") as temp:
            root = Path(temp)
            corrections.main([], root)
            self.assertEqual(list(root.iterdir()), [])

    def test_preparation_requires_explicit_cue(self):
        with self.assertRaises(SystemExit) as failure:
            corrections.main(["--prepare"])
        self.assertEqual(failure.exception.code, 2)

    def test_v4_is_an_explicit_ion_only_dry_run(self):
        with tempfile.TemporaryDirectory(prefix="aegis-radio-prepare-test-") as temp:
            root = Path(temp)
            corrections.main(["--cue=ion-upgraded", "--take=ion-v4"], root)
            self.assertEqual(list(root.iterdir()), [])
            for args in (["--take=ion-v4"], ["--take=ion-v4", "--cue=arc-upgraded"]):
                with self.assertRaises(SystemExit):
                    corrections.main(args, root)
            with self.assertRaises(ValueError):
                corrections.prepare_cue(root, "arc-upgraded", True, "ion-v4")

    def test_v4_preserves_rejected_v3_and_requires_matching_take_receipt(self):
        with tempfile.TemporaryDirectory(prefix="aegis-radio-prepare-test-") as temp:
            root = Path(temp)
            old = root / "public/audio/voice-v3/ion-upgraded.wav"
            old.parent.mkdir(parents=True)
            old.write_bytes(b"preserved rejected take")
            source_bytes = (ROOT / "assets/audio/voice-v2/ion-upgraded.mp3").read_bytes()
            directory = root / "assets/audio/voice-v4"
            directory.mkdir(parents=True)
            (directory / "ion-upgraded.mp3").write_bytes(source_bytes)
            receipt = {"cue": "ion-upgraded", "status": "source-saved", "request": {"text": "Eye-on conductor upgraded."},
                       "sourceSha256": corrections.digest(source_bytes)}
            receipt_path = directory / "ion-upgraded.receipt.json"
            receipt_path.write_text(json.dumps(receipt))
            with self.assertRaisesRegex(ValueError, "do not match"):
                corrections.prepare_cue(root, "ion-upgraded", True, "ion-v4")
            self.assertFalse((directory / "ion-upgraded.processing.request.json").exists())
            receipt["take"] = "ion-v4"
            receipt_path.write_text(json.dumps(receipt))
            self.assertEqual(corrections.prepare_cue(root, "ion-upgraded", True, "ion-v4"), "processed")
            output = root / "public/audio/voice-v4/ion-upgraded.wav"
            self.assertEqual(output.read_bytes(), (ROOT / "public/audio/voice-v2/ion-upgraded.wav").read_bytes())
            processed = json.loads((directory / "ion-upgraded.processing.receipt.json").read_text())
            self.assertEqual(processed["take"], "ion-v4")
            self.assertEqual(processed["noiseSeed"], 7205)
            self.assertEqual(processed["phrase"], "Eye-on conductor upgraded.")
            self.assertEqual(corrections.prepare_cue(root, "ion-upgraded", True, "ion-v4"), "skipped")
            self.assertEqual(old.read_bytes(), b"preserved rejected take")

    def test_exact_existing_processing_is_preserved_and_outputs_cannot_be_overwritten(self):
        with tempfile.TemporaryDirectory(prefix="aegis-radio-prepare-test-") as temp:
            root = Path(temp)
            directory = self.fixture(root)
            source_before = (directory / "arc-upgraded.mp3").read_bytes()
            self.assertEqual(corrections.prepare_cue(root, "arc-upgraded", True), "processed")
            output = root / "public/audio/voice-v3/arc-upgraded.wav"
            self.assertEqual(output.read_bytes(), (ROOT / "public/audio/voice-v2/arc-upgraded.wav").read_bytes())
            receipt = json.loads((directory / "arc-upgraded.processing.receipt.json").read_text())
            self.assertEqual(receipt["sampleRate"], 22050)
            self.assertEqual(receipt["channels"], 1)
            self.assertEqual(receipt["encoding"], "PCM_16")
            self.assertEqual(receipt["status"], "processed-awaiting-audition")
            self.assertEqual(corrections.prepare_cue(root, "arc-upgraded", True), "skipped")
            self.assertEqual(source_before, (directory / "arc-upgraded.mp3").read_bytes())

    def test_shield_hit_uses_v5_echo_voice_and_distinct_noise_seed(self):
        # Existing MP3 is strictly a local decoder fixture, never a production replacement.
        with tempfile.TemporaryDirectory(prefix="aegis-shield-hit-prepare-test-") as temp:
            root = Path(temp)
            source_bytes = (ROOT / "assets/audio/voice-v2/shield-down.mp3").read_bytes()
            directory = root / "assets/audio/voice-v5"
            directory.mkdir(parents=True)
            (directory / "shield-hit.mp3").write_bytes(source_bytes)
            receipt = {"cue": "shield-hit", "status": "source-saved", "speaker": "ECHO-7",
                       "voiceId": "wrong-voice", "voiceLabel": "Alice - Clear, Engaging Educator",
                       "request": {"text": "Shield hit.", "voice_settings": {"stability": .8}},
                       "sourceSha256": corrections.digest(source_bytes)}
            receipt_path = directory / "shield-hit.receipt.json"
            receipt_path.write_text(json.dumps(receipt))
            with self.assertRaisesRegex(ValueError, "approved ECHO-7 Alice"):
                corrections.prepare_cue(root, "shield-hit", True)
            self.assertFalse((directory / "shield-hit.processing.request.json").exists())
            receipt["voiceId"] = "Xb7hH8MSUJpSbSDYk0k2"
            receipt_path.write_text(json.dumps(receipt))
            self.assertEqual(corrections.prepare_cue(root, "shield-hit", True), "processed")
            result = json.loads((directory / "shield-hit.processing.receipt.json").read_text())
            self.assertEqual(result["speaker"], "ECHO-7")
            self.assertEqual(result["noiseSeed"], 7105)
            self.assertEqual(result["file"], "public/audio/voice-v5/shield-hit.wav")
            self.assertEqual(result["phrase"], "Shield hit.")
            self.assertEqual(corrections.prepare_cue(root, "shield-hit", True), "skipped")

    def test_output_or_uncertain_processing_receipt_blocks_work_even_without_source(self):
        for path in ("public/audio/voice-v3/arc-upgraded.wav", "assets/audio/voice-v3/raw/arc-upgraded.wav",
                     "assets/audio/voice-v3/arc-upgraded.processing.request.json", "assets/audio/voice-v3/arc-upgraded.processing.receipt.json"):
            with self.subTest(path=path), tempfile.TemporaryDirectory(prefix="aegis-radio-prepare-test-") as temp:
                root = Path(temp)
                target = root / path
                target.parent.mkdir(parents=True)
                target.write_text("original")
                self.assertEqual(corrections.prepare_cue(root, "arc-upgraded", True), "skipped")
                self.assertEqual(target.read_text(), "original")

    def test_rejects_source_that_no_longer_matches_the_generation_receipt(self):
        with tempfile.TemporaryDirectory(prefix="aegis-radio-prepare-test-") as temp:
            root = Path(temp)
            directory = self.fixture(root)
            source = directory / "arc-upgraded.mp3"
            source.write_bytes(source.read_bytes() + b"changed")
            with self.assertRaisesRegex(ValueError, "do not match"):
                corrections.prepare_cue(root, "arc-upgraded", True)
            self.assertFalse((root / "public").exists())
            self.assertFalse((directory / "arc-upgraded.processing.request.json").exists())


if __name__ == "__main__":
    unittest.main()
