"""Offline review-index regressions. Existing v1 is a decoder fixture, not a new score."""
import hashlib
import importlib.util
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
module_spec = importlib.util.spec_from_file_location("revision_analysis", ROOT / "scripts/analyze-mission-music-revisions.py")
analysis = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(analysis)


class ReviewAnalysisTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="aegis-revision-audio-test-")
        self.root = Path(self.temporary.name)
        (self.root / "docs/audio").mkdir(parents=True)
        shutil.copyfile(ROOT / "docs/audio/mission-score-revisions-2026-11-08.json",
                        self.root / "docs/audio/mission-score-revisions-2026-11-08.json")

    def tearDown(self):
        self.temporary.cleanup()

    def candidate_fixture(self, receipt=True):
        target = self.root / "public/audio/missions/mission-stormbreak-v2.mp3"
        target.parent.mkdir(parents=True)
        shutil.copyfile(ROOT / "public/audio/missions/mission-stormbreak-v1.mp3", target)
        if receipt:
            record = self.root / "assets/audio/mission-score-revisions-2026-11-08/mission-stormbreak-v2.receipt.json"
            record.parent.mkdir(parents=True)
            record.write_text(json.dumps({"bytes": target.stat().st_size, "sha256": hashlib.sha256(target.read_bytes()).hexdigest()}))
        return target

    def test_missing_candidates_are_not_reported_generated(self):
        report = analysis.analyze(self.root)
        self.assertEqual(report["generatedCount"], 0)
        self.assertEqual(len(report["tracks"]), 6)
        self.assertTrue(all(item["file"] is None for item in report["tracks"]))

    def test_real_local_audio_decodes_without_marking_it_approved(self):
        self.candidate_fixture()
        report = analysis.analyze(self.root)
        self.assertEqual(report["generatedCount"], 1)
        item = report["tracks"][0]
        self.assertEqual(item["status"], "decoded-awaiting-owner-review")
        self.assertAlmostEqual(item["durationSeconds"], 180.036, places=2)
        self.assertEqual(item["channels"], 2)
        self.assertEqual(len(item["sectionEnergy"]), 6)
        self.assertGreater(item["loopBoundaryMinimum100msRmsDbfs"], -80)
        self.assertEqual(item["loopAuditionGain"], .5)
        self.assertIsInstance(item["loopBoundaryPeakDbfs"], float)
        self.assertLess(item["loopAuditionPeakDbfs"], 0)
        self.assertFalse(item["loopAuditionPeakExceedsFullScale"])

    def test_seam_headroom_is_measured_without_rejecting_decode_overshoot(self):
        import numpy as np
        self.candidate_fixture()
        # Equal-power overlap of identical signals can add about 3 dB. The
        # audition applies 50% gain after that sum, not to its metrics only.
        for amplitude, clips in [(1.1, False), (3.0, True)]:
            signal = np.full((180 * 44100, 2), amplitude, dtype=np.float32)
            with patch("soundfile.read", return_value=(signal, 44100)):
                item = analysis.analyze(self.root)["tracks"][0]
            self.assertEqual(item["status"], "decoded-awaiting-owner-review")
            self.assertGreater(item["peakDbfs"], 0)
            self.assertAlmostEqual(item["loopBoundaryPeakDbfs"] - item["peakDbfs"], 3.01, places=2)
            self.assertAlmostEqual(item["loopAuditionPeakDbfs"] - item["loopBoundaryPeakDbfs"], -6.021, places=2)
            self.assertEqual(item["loopAuditionPeakExceedsFullScale"], clips)

    def test_candidate_loop_marker_keeps_original_duration_and_hash(self):
        target = self.candidate_fixture()
        plan_path = self.root / "docs/audio/mission-score-revisions-2026-11-08.json"
        plan = json.loads(plan_path.read_text())
        plan["tracks"]["mission-stormbreak"]["loopEndSeconds"] = 172
        plan_path.write_text(json.dumps(plan))
        item = analysis.analyze(self.root)["tracks"][0]
        self.assertEqual(item["loopEndSeconds"], 172)
        self.assertEqual(item["loopStartSeconds"], 132)
        self.assertEqual(item["loopCrossfadeSeconds"], 2)
        self.assertAlmostEqual(item["durationSeconds"], 180.036, places=2)
        self.assertEqual(item["sha256"], hashlib.sha256(target.read_bytes()).hexdigest())

    def test_invalid_candidate_loop_marker_is_rejected(self):
        self.candidate_fixture()
        plan_path = self.root / "docs/audio/mission-score-revisions-2026-11-08.json"
        plan = json.loads(plan_path.read_text())
        for endpoint in [True, 39, 181, float("nan"), "172"]:
            plan["tracks"]["mission-stormbreak"]["loopEndSeconds"] = endpoint
            plan_path.write_text(json.dumps(plan))
            with self.assertRaisesRegex(ValueError, "Invalid candidate loop endpoint"):
                analysis.analyze(self.root)

    def test_missing_receipt_is_not_silently_accepted(self):
        self.candidate_fixture(receipt=False)
        with self.assertRaisesRegex(ValueError, "Receipt missing"):
            analysis.analyze(self.root)

    def test_changed_candidate_bytes_fail_the_receipt_check(self):
        target = self.candidate_fixture()
        with target.open("ab") as handle:
            handle.write(b"tamper")
        with self.assertRaisesRegex(ValueError, "does not match"):
            analysis.analyze(self.root)

    def reviewed_manifest(self, target, **overrides):
        path = self.root / "src/audio/mission-scores.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        score = {"file": "audio/missions/mission-stormbreak-v2.mp3", "status": "reviewed",
                 "bytes": target.stat().st_size, "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
                 "loopEndSeconds": 172, "review": "Owner approved on 2026-11-08: Approve all six scores."}
        score.update(overrides)
        path.write_text(json.dumps({"mission-stormbreak": score}))

    def test_reanalysis_preserves_exact_active_approval(self):
        target = self.candidate_fixture()
        self.reviewed_manifest(target)
        for _ in range(2):
            report = analysis.analyze(self.root)
            self.assertEqual(report["approvedActiveCount"], 1)
            self.assertEqual(report["tracks"][0]["status"], "owner-approved-active")
            self.assertIn("Approve all six scores", report["tracks"][0]["ownerApproval"])

    def test_approval_does_not_transfer_to_another_file_hash_or_loop(self):
        target = self.candidate_fixture()
        for overrides in [{"file": "audio/missions/mission-stormbreak-v1.mp3"},
                          {"sha256": "0" * 64}, {"bytes": 1},
                          {"loopEndSeconds": 171}, {"status": "generated"}]:
            self.reviewed_manifest(target, **overrides)
            report = analysis.analyze(self.root)
            self.assertEqual(report["approvedActiveCount"], 0)
            self.assertEqual(report["tracks"][0]["status"], "decoded-awaiting-owner-review")


if __name__ == "__main__":
    unittest.main()
