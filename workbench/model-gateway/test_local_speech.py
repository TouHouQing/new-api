# SPDX-License-Identifier: AGPL-3.0-or-later
"""Receipt and cancellation contracts with an explicitly substituted executor.

These tests never claim that their tiny WAV fixtures are model outputs.
"""
import asyncio
import base64
import hashlib
import io
import json
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError
from gateway import Receipts
from local_speech import LocalSpeech, SpeechRequest, decode_voice_reference


def fixture_wav():
    output = io.BytesIO()
    with wave.open(output, "wb") as stream:
        stream.setnchannels(1);stream.setsampwidth(2);stream.setframerate(24000);stream.writeframes(b"\0\0" * 2400)
    return output.getvalue()


class SpeechRequestTests(unittest.TestCase):
    def test_reference_requires_explicit_rights_and_matching_voice_mode(self):
        reference = "data:audio/wav;base64," + base64.b64encode(fixture_wav()).decode()
        for values in [{"voice":"sample","reference_audio":reference},{"voice":"default","reference_audio":reference,"confirm_voice_rights":True},{"voice":"sample"}]:
            with self.assertRaises(ValidationError):SpeechRequest(prompt="test",**values)
        value=SpeechRequest(prompt="test",voice="sample",reference_audio=reference,confirm_voice_rights=True)
        self.assertEqual(decode_voice_reference(value.reference_audio),fixture_wav())

    def test_reference_urls_invalid_inputs_and_unsupported_parameters_are_rejected(self):
        for values in [{"reference_audio":"https://example.invalid/voice.wav","voice":"sample","confirm_voice_rights":True},{"speed":float('nan')},{"speed":.1},{"language":"unknown"},{"prompt":" "},{"format":"pcm"},{"unknown":True}]:
            with self.assertRaises(ValidationError):SpeechRequest.model_validate({"prompt":"test",**values})


class SpeechReceiptTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temporary=tempfile.TemporaryDirectory();self.root=Path(self.temporary.name)
        self.receipts=Receipts(self.root);self.engine=LocalSpeech(self.receipts,None,None,None)
        self.engine.available=lambda:True;self.starts=[];self.release=asyncio.Event()
        async def substitute_executor(digest,receipt,directory):
            self.starts.append(receipt['prompt_id']);await self.release.wait()
        self.engine.execute=substitute_executor

    async def asyncTearDown(self):
        await self.engine.close();self.temporary.cleanup()

    async def test_lost_reply_same_key_keeps_one_execution_and_changed_input_conflicts(self):
        first=await self.engine.submit(SpeechRequest(prompt="first"),"owned-operation")
        second=await self.engine.submit(SpeechRequest(prompt="first"),"owned-operation")
        await asyncio.sleep(0)
        self.assertEqual(first,second);self.assertEqual(self.starts,[first['prompt_id']])
        with self.assertRaises(HTTPException) as failure:await self.engine.submit(SpeechRequest(prompt="changed"),"owned-operation")
        self.assertEqual(failure.exception.status_code,409)

    async def test_restart_does_not_infer_pending_speech_again(self):
        first=await self.engine.submit(SpeechRequest(prompt="first"),"interrupted")
        await self.engine.close()
        restarted=LocalSpeech(self.receipts,None,None,None)
        state=await restarted.status(first['prompt_id'])
        self.assertEqual(state['status'],'failed');self.assertEqual(state['reason'],'execution_interrupted')
        self.assertFalse(restarted.pending)

    async def test_complete_file_checkpoint_survives_a_lost_terminal_receipt(self):
        first=await self.engine.submit(SpeechRequest(prompt="first"),"file-complete")
        await self.engine.close()
        directory=self.engine.directory(first['prompt_id']);body=fixture_wav();(directory/'output.wav').write_bytes(body)
        (directory/'result.json').write_text(json.dumps({'format':'wav','duration':.1,'bytes':len(body),'sha256':hashlib.sha256(body).hexdigest()}))
        restarted=LocalSpeech(self.receipts,None,None,None);state=await restarted.status(first['prompt_id'])
        self.assertEqual(state['status'],'succeeded');self.assertEqual(len(state['outputs']),1);self.assertFalse(restarted.pending)
        (directory/'output.wav').write_bytes(b'changed')
        with self.assertRaises(HTTPException) as failure:await restarted.status(first['prompt_id'])
        self.assertEqual(failure.exception.status_code,409)

    async def test_cancel_is_scoped_and_never_cancels_other_waiting_jobs(self):
        first=await self.engine.submit(SpeechRequest(prompt="one"),"cancel-one")
        other=await self.engine.submit(SpeechRequest(prompt="two"),"keep-two")
        state=await self.engine.cancel(first['prompt_id'])
        self.assertEqual(state['status'],'cancelled');self.assertFalse(self.engine.pending.get(first['prompt_id']))
        self.assertEqual((await self.engine.status(other['prompt_id']))['status'],'pending')
        self.assertIn(other['prompt_id'],self.engine.pending)
        self.assertFalse((self.engine.directory(first['prompt_id'])/'input.json').exists())
        self.assertTrue((self.engine.directory(other['prompt_id'])/'input.json').exists())

    async def test_shutdown_reclaims_references_even_before_execution_starts(self):
        first=await self.engine.submit(SpeechRequest(prompt="not yet started"),"close-before-first-turn")
        await self.engine.close()
        self.assertFalse((self.engine.directory(first['prompt_id'])/'input.json').exists())
        self.assertFalse(self.engine.pending)

    async def test_failed_receipt_write_starts_no_model_and_reclaims_reference_body(self):
        with patch.object(self.receipts,'write',side_effect=HTTPException(507,'disk full')):
            with self.assertRaises(HTTPException):await self.engine.submit(SpeechRequest(prompt="first"),"disk-full")
        self.assertFalse(self.engine.pending);self.assertFalse(self.starts);self.assertFalse(list(self.root.glob('speech/*/input.json')))

    async def test_foreign_or_malformed_receipt_cannot_choose_a_file_path(self):
        for identity in ['../output.wav','not-a-uuid']:
            with self.assertRaises(HTTPException):await self.engine.status(identity)
        first=await self.engine.submit(SpeechRequest(prompt="one"),"malformed")
        digest,receipt=self.engine.lookup(first['prompt_id']);receipt['format']='../../outside';self.receipts.write(digest,receipt)
        with self.assertRaises(HTTPException) as failure:await self.engine.status(first['prompt_id'])
        self.assertEqual(failure.exception.status_code,503)


if __name__=='__main__':unittest.main()
