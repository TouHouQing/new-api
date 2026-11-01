import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from studio_capability_probe import reviewed_evidence


class CapabilityEvidenceTests(unittest.TestCase):
    def test_only_exact_configuration_and_immutable_reviewed_bytes_are_evidence(self):
        with tempfile.TemporaryDirectory(prefix='studio-evidence-test-') as directory:
            root = Path(directory) / 'capability-evidence'
            root.mkdir()
            artifact = root / 'sample.mp4'
            artifact.write_bytes(b'explicit fixture; not generated video quality evidence')
            review = {'id': 'review', 'modelId': 'wan', 'action': 'video', 'configurationDigest': 'a' * 64,
                      'outcome': 'passed', 'testedAt': '2026-10-18T08:00:00Z', 'filename': artifact.name,
                      'sha256': hashlib.sha256(artifact.read_bytes()).hexdigest(),
                      'artifactUrl': '/studio-presets/videos/sample.mp4', 'scope': '640x384; one reviewed first-frame path only'}
            (root / 'reviews.json').write_text(json.dumps([review]), encoding='utf-8')
            self.assertEqual(len(reviewed_evidence(directory, 'wan', 'video', 'a' * 64)), 1)
            self.assertEqual(reviewed_evidence(directory, 'wan', 'video', 'b' * 64), [])
            self.assertEqual(reviewed_evidence(directory, 'wan', 'native_audio_video', 'a' * 64), [])
            artifact.write_bytes(b'tampered')
            self.assertEqual(reviewed_evidence(directory, 'wan', 'video', 'a' * 64), [])
            outside = Path(directory) / 'outside.mp4'
            outside.write_bytes(b'outside')
            review.update(filename='../outside.mp4', sha256=hashlib.sha256(outside.read_bytes()).hexdigest())
            (root / 'reviews.json').write_text(json.dumps([review]), encoding='utf-8')
            self.assertEqual(reviewed_evidence(directory, 'wan', 'video', 'a' * 64), [])


if __name__ == '__main__':
    unittest.main()
