import hashlib
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

import production_analysis_backup as backup


class AnalysisBootstrapBackupTests(unittest.TestCase):
    def fixture(self, directory):
        root = Path(directory)
        runtime = root / "worker"
        runtime.mkdir()
        (runtime / "large-model.bin").write_bytes(b"never include weights or measurements")
        token = root / "private.key"
        token.write_bytes(b"a" * 64)
        config = {"version": 1, "python": str(root / "python"), "relayPython": str(root / "python"), "ffmpeg": str(root / "ffmpeg"),
                  "directory": str(runtime), "tokenFile": str(token), "workerPort": 13005, "windowsRelayPort": 18004, "dockerRelayPort": 18003}
        path = root / ".local-analysis.json"
        path.write_text(json.dumps(config))
        return root, path, token, config

    def test_snapshot_contains_only_private_bootstrap_and_exact_native_key(self):
        with tempfile.TemporaryDirectory() as directory:
            root, _, token, _ = self.fixture(directory)
            archive = root / "local-analysis.tar"
            proof = backup.snapshot_analysis(backup.configured_analysis(root), archive, backup.digest(token))
            self.assertEqual(set(proof["files"]), backup.NAMES)
            restored = backup.verify_analysis_archive(archive, proof, root / "restored")
            self.assertEqual(restored["analysis/token.key"], token.read_bytes())
            self.assertFalse(proof["weightsIncluded"])
            self.assertFalse(proof["measurementCacheIncluded"])
            self.assertTrue(proof["nativeSigningKeyMatched"])

    def test_mismatched_key_rejects_before_archive_creation(self):
        with tempfile.TemporaryDirectory() as directory:
            root, _, _, _ = self.fixture(directory)
            archive = root / "rejected.tar"
            with self.assertRaises(ValueError):
                backup.snapshot_analysis(backup.configured_analysis(root), archive, "b" * 64)
            self.assertFalse(archive.exists())

    def test_rejects_unknown_fields_remote_paths_boolean_ports_and_bad_tokens(self):
        with tempfile.TemporaryDirectory() as directory:
            root, path, token, config = self.fixture(directory)
            for patch in ({"extra": "secret"}, {"tokenFile": "https://example.invalid/key"}, {"python": "relative/python"}, {"workerPort": True}, {"version": True}, {"dockerRelayPort": 1023}):
                path.write_text(json.dumps({**config, **patch}))
                with self.assertRaises(ValueError, msg=str(patch)):
                    backup.configured_analysis(root)
            path.write_text(json.dumps(config))
            token.write_bytes(b"not a signing key")
            with self.assertRaises(ValueError):
                backup.configured_analysis(root)

    def test_missing_optional_configuration_keeps_previous_backups_usable(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertIsNone(backup.configured_analysis(Path(directory)))
            self.assertEqual(backup.analysis_inventory(None), {})

    def test_restore_rejects_duplicate_special_and_changed_archive_members(self):
        with tempfile.TemporaryDirectory() as directory:
            root, _, token, _ = self.fixture(directory)
            archive = root / "valid.tar"
            proof = backup.snapshot_analysis(backup.configured_analysis(root), archive, backup.digest(token))
            changed = {**proof, "files": {**proof["files"], "analysis/token.key": "0" * 64}}
            with self.assertRaises(ValueError):
                backup.verify_analysis_archive(archive, changed)
            for name, duplicate, symbolic in (("../outside", False, False), ("analysis/config.json", True, False), ("analysis/config.json", False, True)):
                bad = root / ("bad-" + str(duplicate) + str(symbolic) + ".tar")
                with tarfile.open(bad, "w") as stream:
                    info = tarfile.TarInfo(name)
                    info.size = 2
                    if symbolic:
                        info.type, info.linkname = tarfile.SYMTYPE, "/private"
                    stream.addfile(info, io.BytesIO(b"{}"))
                    if duplicate:
                        stream.addfile(info, io.BytesIO(b"{}"))
                with self.assertRaises(ValueError):
                    backup.verify_analysis_archive(bad, proof)

    def test_staging_uses_new_ports_and_ownership_without_changing_live_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root, config_path, token, config = self.fixture(directory)
            repository = root / "repo"
            (repository / "scripts/media-analysis").mkdir(parents=True)
            (repository / "scripts/media-analysis/worker.py").write_text("# installed engine")
            archive = root / "local-analysis.tar"
            proof = backup.snapshot_analysis(backup.configured_analysis(root), archive, backup.digest(token))
            (root / "manifest.json").write_text(json.dumps({"localAnalysisIncluded": True, "localAnalysis": proof, "archives": {"local-analysis.tar": backup.digest(archive)}}))
            original_config, original_token = config_path.read_bytes(), token.read_bytes()
            output = root / "independent"
            receipt = backup.stage_analysis_restore(root, output, repository, (13006, 18006, 18007))
            staged = json.loads((output / "config.json").read_text())
            owner = json.loads((output / "runtime/.yingce-worker-owner.json").read_text())
            self.assertEqual((staged["workerPort"], staged["windowsRelayPort"], staged["dockerRelayPort"]), (13006, 18006, 18007))
            self.assertEqual(owner["pid"], 0)
            self.assertEqual(Path(staged["tokenFile"]).read_bytes(), original_token)
            self.assertEqual(config_path.read_bytes(), original_config)
            self.assertEqual(token.read_bytes(), original_token)
            self.assertFalse(receipt["liveServicesChanged"])
            self.assertEqual(receipt["modelInferenceCalls"], 0)
            with self.assertRaises(ValueError):
                backup.stage_analysis_restore(root, output, repository, (13006, 18006, 18007))

    def test_native_key_must_be_in_the_same_backed_up_data_tree(self):
        files = {"private/analysis.key": "a" * 64}
        self.assertEqual(backup.native_key_digest(files, ["CANVAS_MEDIA_ANALYSIS_SECRET_FILE=/data/private/analysis.key"]), "a" * 64)
        for value in ("/run/secrets/analysis.key", "/data/../private/analysis.key", "/data/missing", "relative"):
            with self.assertRaises(ValueError):
                backup.native_key_digest(files, ["CANVAS_MEDIA_ANALYSIS_SECRET_FILE=" + value])


if __name__ == "__main__":
    unittest.main()
