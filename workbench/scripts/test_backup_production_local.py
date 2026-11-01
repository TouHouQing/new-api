import hashlib
import importlib.util
import io
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest import mock

spec = importlib.util.spec_from_file_location("production_backup", Path(__file__).with_name("backup-production-local.py"))
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


class BackupArchiveTests(unittest.TestCase):
    def test_full_host_disk_rejects_before_any_docker_action(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            env = root / 'private.env'
            env.write_text('')
            with mock.patch('sys.argv', ['backup', '--env-file', str(env), '--output', str(root / 'backup'), '--host-storage-path', str(root)]), mock.patch.object(backup.shutil, 'disk_usage', return_value=type('Usage', (), {'free': 0})()), mock.patch.object(backup.subprocess, 'run') as command:
                with self.assertRaisesRegex(RuntimeError, 'host storage reserve'):
                    backup.main()
                command.assert_not_called()

    def archive(self, directory, entries):
        target = Path(directory) / "backup.tar"
        with tarfile.open(target, "w") as archive:
            for name, content, kind in entries:
                item = tarfile.TarInfo(name)
                item.type = kind
                if kind == tarfile.REGTYPE:
                    item.size = len(content)
                    archive.addfile(item, io.BytesIO(content))
                else:
                    item.linkname = content.decode()
                    archive.addfile(item)
        return target

    def test_regular_files_keep_exact_bytes_and_normalized_names(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.archive(directory, [("./.settings-key", b"test-key", tarfile.REGTYPE), ("resources/test.txt", "植物".encode(), tarfile.REGTYPE)])
            self.assertEqual(backup.checked_archive(path), {".settings-key": hashlib.sha256(b"test-key").hexdigest(), "resources/test.txt": hashlib.sha256("植物".encode()).hexdigest()})

    def test_traversal_absolute_paths_and_special_files_are_rejected(self):
        for name, kind in [("../escape", tarfile.REGTYPE), ("/escape", tarfile.REGTYPE), ("..\\escape", tarfile.REGTYPE), ("link", tarfile.SYMTYPE), ("hard", tarfile.LNKTYPE), ("pipe", tarfile.FIFOTYPE)]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                path = self.archive(directory, [(name, b"outside", kind)])
                with self.assertRaises(RuntimeError):
                    backup.checked_archive(path)

    def test_duplicate_normalized_paths_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.archive(directory, [("./resource", b"first", tarfile.REGTYPE), ("resource", b"second", tarfile.REGTYPE)])
            with self.assertRaises(RuntimeError):
                backup.checked_archive(path)


if __name__ == "__main__":
    unittest.main()
