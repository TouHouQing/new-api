import hashlib
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest import mock
import uuid

import production_transport_backup as backup


class TransportBackupTests(unittest.TestCase):
    def test_lip_sync_restore_retains_video_clock_and_fingerprint_but_excludes_inputs_and_weights(self):
        with tempfile.TemporaryDirectory() as directory:
            root,_,_,_=self.restored_fixture(directory);media=root/'media-receipts';identity=str(uuid.uuid4());job=media/'lip-sync'/identity;job.mkdir(parents=True)
            for name in backup.LIP_SYNC_FILES:(job/name).write_bytes(('distinct-'+name).encode())
            for name in backup.LIP_SYNC_TRANSIENTS:(job/name).write_bytes(b'private source or incomplete output')
            (root/'.local-media-models.json').write_text(json.dumps({'version':1,'receiptDirectory':str(media),'gatewayPort':8005,'windowsRelayPort':16005,'dockerRelayPort':18005,'mediaOnly':True,'lipSyncModelDirectory':str(root/'external-model-checkout')}))
            archive=root/'lip-sync.tar';proof=backup.snapshot_transports(backup.configured_transports(root),archive)
            prefix='transports/media/receipts/lip-sync/'+identity+'/'
            self.assertTrue(all(prefix+name in proof['files'] for name in backup.LIP_SYNC_FILES));self.assertTrue(all(prefix+name not in proof['files'] for name in backup.LIP_SYNC_TRANSIENTS));self.assertFalse(proof['weightsIncluded'])
            with tarfile.open(archive) as stream:
                for name in backup.LIP_SYNC_FILES:self.assertEqual(stream.extractfile(prefix+name).read(),(job/name).read_bytes())
            (job/'weights.pth').write_bytes(b'not-an-output')
            with self.assertRaises(ValueError):backup.transport_inventory(backup.configured_transports(root))

    def test_media_stems_restore_all_bytes_without_weights_or_private_inputs(self):
        with tempfile.TemporaryDirectory() as directory:
            root, receipts, _, _ = self.restored_fixture(directory)
            media = root / 'media-receipts'
            identity = str(uuid.uuid4())
            job = media / 'media' / identity
            job.mkdir(parents=True)
            for role in backup.MEDIA_ROLES:
                (job / (role + '.wav')).write_bytes(('distinct-fixture-' + role).encode())
            (job / 'result.json').write_text('{}')
            (job / 'inference-private.log').write_text('diagnostic')
            (job / 'source.bin').write_bytes(b'private uploaded source')
            (job / 'input.json').write_text('private request')
            (job / 'vocals.part.wav').write_bytes(b'uncommitted')
            (root / '.local-media-models.json').write_text(json.dumps({'version':1,'receiptDirectory':str(media),'gatewayPort':8005,'windowsRelayPort':16005,'dockerRelayPort':18005,'mediaOnly':True,'mediaModel':str(root/'outside-model.th')}))
            archive = root / 'four-slots.tar'
            proof = backup.snapshot_transports(backup.configured_transports(root), archive)
            names = set(proof['files'])
            for role in backup.MEDIA_ROLES:
                self.assertIn('transports/media/receipts/media/'+identity+'/'+role+'.wav', names)
            self.assertFalse(any(name.endswith(('.bin','.th','input.json','.part.wav')) for name in names))
            with tarfile.open(archive) as source:
                source.extractall(root/'media-restored', **({'filter':'data'} if hasattr(tarfile,'data_filter') else {}))
            for role in backup.MEDIA_ROLES:
                restored=root/'media-restored/transports/media/receipts/media'/identity/(role+'.wav')
                self.assertEqual(restored.read_bytes(),(job/(role+'.wav')).read_bytes())

    def test_media_backup_rejects_unknown_outputs_instead_of_archiving_model_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            root, receipts, _ = self.fixture(directory)
            job = receipts/'media'/str(uuid.uuid4())
            job.mkdir(parents=True)
            (job/'unrelated-model.th').write_bytes(b'not an output')
            with self.assertRaises(ValueError):
                backup.snapshot_transports(backup.configured_transports(root),root/'rejected.tar')

    def fixture(self, directory):
        root = Path(directory)
        receipts = root / 'receipts'
        receipts.mkdir()
        identity = str(uuid.uuid4())
        digest = 'a' * 64
        receipt = receipts / (digest + '.json')
        receipt.write_text(json.dumps({'version': 1, 'model': 'audio', 'prompt_id': identity, 'status': 'succeeded', 'format': 'wav'}))
        (receipts / ('prompt-' + identity + '.json')).write_text(json.dumps({'version': 1, 'receipt_digest': digest}))
        job = receipts / 'speech' / identity
        job.mkdir(parents=True)
        (job / 'output.wav').write_bytes(b'owned-test-audio-bytes')
        (job / 'result.json').write_text('{"sha256":"test"}')
        (job / 'inference-private.log').write_text('local diagnostic')
        (job / 'input.json').write_text('temporary private script')
        (job / 'reference.bin').write_bytes(b'temporary reference')
        (receipts / 'receipt-writing.tmp').write_text('uncommitted atomic replacement')
        config = root / '.local-speech-models.json'
        config.write_text(json.dumps({'version': 1, 'receiptDirectory': str(receipts), 'gatewayPort': 8002, 'windowsRelayPort': 16002, 'dockerRelayPort': 18002}))
        return root, receipts, receipt

    def restored_fixture(self, directory):
        root, receipts, receipt = self.fixture(directory)
        archive = root / 'model-transports.tar'
        proof = backup.snapshot_transports(backup.configured_transports(root), archive)
        extracted = root / 'restored-model-transports'
        extracted.mkdir()
        with tarfile.open(archive) as source:
            source.extractall(extracted, **({'filter': 'data'} if hasattr(tarfile, 'data_filter') else {}))
        manifest = {'modelTransportsIncluded': True, 'modelTransports': proof, 'archives': {'model-transports.tar': backup.digest(archive)}}
        (root / 'manifest.json').write_text(json.dumps(manifest))
        return root, receipts, receipt, manifest

    def test_exact_receipts_outputs_and_private_logs_survive_without_transient_inputs(self):
        with tempfile.TemporaryDirectory() as directory:
            root, _, _ = self.fixture(directory)
            output = root / 'transports.tar'
            proof = backup.snapshot_transports(backup.configured_transports(root), output)
            with tarfile.open(output) as archive:
                members = archive.getmembers()
                actual = {m.name: hashlib.sha256(archive.extractfile(m).read()).hexdigest() for m in members}
            self.assertEqual(actual, proof['files'])
            self.assertEqual(len(actual), 6)
            self.assertTrue(all(m.isfile() and m.mode == 0o600 for m in members))
            self.assertFalse(proof['weightsIncluded'])
            self.assertFalse(proof['transientInputsIncluded'])
            self.assertFalse(proof['upstreamComfyHistoryIncluded'])

    def test_changed_receipts_do_not_become_an_accepted_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            root, _, receipt = self.fixture(directory)
            original = tarfile.TarFile.addfile

            def changed(archive, info, fileobj=None):
                original(archive, info, fileobj)
                if info.name.endswith(receipt.name):
                    value = json.loads(receipt.read_text())
                    value['status'] = 'failed'
                    receipt.write_text(json.dumps(value))

            with mock.patch.object(tarfile.TarFile, 'addfile', changed):
                with self.assertRaisesRegex(RuntimeError, 'changed during backup'):
                    backup.snapshot_transports(backup.configured_transports(root), root / 'transports.tar')

    def test_receipt_links_and_unrelated_weights_are_rejected(self):
        for kind in ('symlink', 'weights'):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as directory:
                root, receipts, _ = self.fixture(directory)
                if kind == 'symlink':
                    secret = root / 'unrelated-secret'
                    secret.write_text('must not be archived')
                    os.symlink(secret, receipts / ('b' * 64 + '.json'))
                else:
                    (receipts / 'model.safetensors').write_bytes(b'not a receipt')
                with self.assertRaises(ValueError):
                    backup.snapshot_transports(backup.configured_transports(root), root / 'transports.tar')

    def test_unknown_configuration_fields_and_shared_roots_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root, receipts, _ = self.fixture(directory)
            primary = root / '.local-models.json'
            primary.write_text(json.dumps({'version': 1, 'receiptDirectory': str(receipts), 'apiKey': 'do-not-copy'}))
            with self.assertRaises(ValueError):
                backup.configured_transports(root)
            primary.write_text(json.dumps({'version': 1, 'receiptDirectory': str(receipts)}))
            with self.assertRaises(ValueError):
                backup.configured_transports(root)

    def test_relative_and_network_source_paths_are_rejected(self):
        for path in ('../weights', r'\\server\share', '//server/share', ''):
            with self.subTest(path=path), self.assertRaises(ValueError):
                backup.host_path(path)

    def test_existing_archive_is_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            root, _, _ = self.fixture(directory)
            output = root / 'transports.tar'
            output.write_bytes(b'earlier backup')
            with self.assertRaises(FileExistsError):
                backup.snapshot_transports(backup.configured_transports(root), output)
            self.assertEqual(output.read_bytes(), b'earlier backup')

    def test_restore_stages_exact_receipts_with_isolated_ports_and_preserves_live_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            root, receipts, receipt, _ = self.restored_fixture(directory)
            original = receipt.read_bytes()
            output = root / 'staged'
            proof = backup.stage_transport_restore(root, output, (8010, 16010, 18010))
            self.assertTrue(proof['accepted'])
            self.assertFalse(proof['liveServicesChanged'])
            self.assertEqual(proof['modelInferenceCalls'], 0)
            config = json.loads((output / 'speech/config.json').read_text())
            self.assertEqual((config['gatewayPort'], config['windowsRelayPort'], config['dockerRelayPort']), (8010, 16010, 18010))
            self.assertEqual(Path(config['receiptDirectory']), (output / 'speech/receipts').resolve())
            self.assertEqual((output / 'speech/receipts' / receipt.name).read_bytes(), original)
            self.assertEqual(receipt.read_bytes(), original)
            with self.assertRaises(FileExistsError):
                backup.stage_transport_restore(root, output, (8020, 16020, 18020))

    def test_restore_rejects_changed_files_and_path_traversal_before_creating_output(self):
        for kind in ('changed', 'traversal'):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as directory:
                root, _, receipt, manifest = self.restored_fixture(directory)
                if kind == 'changed':
                    (root / 'restored-model-transports/transports/speech/receipts' / receipt.name).write_text('changed')
                else:
                    manifest['modelTransports']['files']['transports/speech/../../escape'] = '0' * 64
                    (root / 'manifest.json').write_text(json.dumps(manifest))
                with self.assertRaises(ValueError):
                    backup.stage_transport_restore(root, root / 'staged', (8010, 16010, 18010))
                self.assertFalse((root / 'staged').exists())

    def test_restore_rejects_receipt_links_before_creating_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root, _, receipt, _ = self.restored_fixture(directory)
            extracted = root / 'restored-model-transports/transports/speech/receipts' / receipt.name
            extracted.unlink()
            os.symlink(receipt, extracted)
            with self.assertRaises(ValueError):
                backup.stage_transport_restore(root, root / 'staged', (8010, 16010, 18010))
            self.assertFalse((root / 'staged').exists())

    def test_restore_does_not_reuse_original_service_ports(self):
        with tempfile.TemporaryDirectory() as directory:
            root, _, _, _ = self.restored_fixture(directory)
            with self.assertRaisesRegex(ValueError, 'overlap'):
                backup.stage_transport_restore(root, root / 'staged', (8002, 16010, 18010))
            self.assertFalse((root / 'staged').exists())


if __name__ == '__main__':
    unittest.main()
