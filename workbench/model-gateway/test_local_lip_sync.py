# SPDX-License-Identifier: AGPL-3.0-or-later
"""Unit fixtures replace inference; actual engine/UI evidence is recorded separately."""
import asyncio,base64,hashlib,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from fastapi import HTTPException
from pydantic import ValidationError
from gateway import Receipts
from lip_sync_contract import LipSyncRequest,LipSelection,MODEL_SHA256
from local_lip_sync import LocalLipSync
from musetalk_inference import single_visible_face,validate_lip_selection,validate_face_track,lip_crop_geometry
from test_local_speech import fixture_wav
from render_lip_sync import read_lip_sync_input

def request():
    source=b'unit-image-fixture-never-inferred'*2;audio=fixture_wav()
    return LipSyncRequest(source_kind='image',source='data:image/png;base64,'+base64.b64encode(source).decode(),audio='data:audio/wav;base64,'+base64.b64encode(audio).decode(),source_sha256=hashlib.sha256(source).hexdigest(),audio_sha256=hashlib.sha256(audio).hexdigest(),selection=LipSelection(start_ms=0,end_ms=100,audio_start_ms=0),rights_confirmed=True)

class LipSyncInputTests(unittest.TestCase):
    def test_real_atomic_input_envelope_is_consumed_without_weakening_request_validation(self):
        with tempfile.TemporaryDirectory() as directory:
            receipts=Receipts(Path(directory));target=Path(directory)/'input.json';receipts._write(target,request().model_dump());parsed=read_lip_sync_input(target.read_bytes());self.assertEqual(parsed,request())
            raw=json.loads(target.read_bytes())
            for change in [{'version':2},{'version':True},{'unknown':True},{'rights_confirmed':False},{'source_sha256':'0'*64}]:
                with self.subTest(change=change),self.assertRaises(ValueError):read_lip_sync_input(json.dumps({**raw,**change}).encode())
    def test_no_url_foreign_hash_unconfirmed_or_numerical_authorization_is_admitted(self):
        for values in [{'source':'http://localhost/source.png'},{'audio':'data:audio/wav;base64,@@@@'},{'source_sha256':'0'*64},{'rights_confirmed':False},{'rights_confirmed':1},{'model_name':'download-new-model'},{'unknown':True}]:
            with self.subTest(values=values),self.assertRaises(ValidationError):LipSyncRequest.model_validate({**request().model_dump(),**values})
    def test_time_region_and_photo_start_are_explicit_and_bounded(self):
        for values in [{'start_ms':-1},{'end_ms':99},{'end_ms':30001},{'start_ms':True},{'end_ms':float('nan')},{'region':{'x':0,'y':0,'width':47,'height':48}},{'region':{'x':True,'y':0,'width':48,'height':48}}]:
            with self.subTest(values=values),self.assertRaises(ValidationError):LipSelection.model_validate({**request().selection.model_dump(),**values})
        with self.assertRaises(ValidationError):LipSyncRequest.model_validate({**request().model_dump(),'selection':{'version':1,'start_ms':100,'end_ms':200,'audio_start_ms':0}})
    def test_actual_face_geometry_does_not_select_between_speakers_or_switch_tracks(self):
        self.assertEqual(single_visible_face([(20,30,100,100),(21,31,100,100)],[8,7]),(20,30,100,100))
        with self.assertRaises(ValueError):single_visible_face([(20,30,100,100),(250,30,100,100)],[8,8])
        with self.assertRaises(ValueError):single_visible_face([(20,30,100,100)],[2])
        with self.assertRaises(ValueError):validate_face_track([(20,30,100,100),(250,30,100,100)])
        self.assertEqual(lip_crop_geometry((291,165,55,55),(220,35,215,250),640,384)['crop'],(220,35,435,285))
    def test_actual_sources_must_cover_selected_video_and_dialogue(self):
        edit={'start':2,'end':3,'x':640,'y':0,'width':640,'height':384}
        result=validate_lip_selection(edit,.2,1,{'duration':5,'width':1280,'height':384},1.3)
        self.assertEqual(result['audio_start'],.2)
        for video,audio in [({'duration':2.9,'width':1280,'height':384},2),({'duration':5,'width':1000,'height':384},2),({'duration':5,'width':1280,'height':384},1.1)]:
            with self.assertRaises(ValueError):validate_lip_selection(edit,.2,1,video,audio)

class LipSyncReceipts(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.receipts=Receipts(self.root);self.engine=LocalLipSync(self.receipts,None,None,None);self.engine.available=lambda:True;self.starts=[]
        self.disk=patch('local_lip_sync.shutil.disk_usage',return_value=type('Space',(),{'free':8*1024**3})());self.disk.start()
        async def substitute(digest,receipt,directory):self.starts.append(receipt['prompt_id']);await asyncio.Event().wait()
        self.engine.execute=substitute
    async def asyncTearDown(self):await self.engine.close();self.disk.stop();self.temp.cleanup()
    def output(self,identity):
        directory=self.engine.directory(identity);receipt=self.engine.lookup(identity)[1];body=b'unit-video-fixture-never-claimed-as-real'*2;(directory/'output.mp4').write_bytes(body)
        result={**{k:receipt[k] for k in ['source_sha256','audio_sha256','source_kind','selection','model_sha256']},'version':1,'model':'musetalk-1.5','timing':{'audio_seconds':.1,'video_seconds':.125,'frame_count':3,'output_frames':3,'fps':24},'bytes':len(body),'sha256':hashlib.sha256(body).hexdigest()};(directory/'result.json').write_text(json.dumps(result));return result
    async def test_one_stable_submission_changed_inputs_conflict_and_no_model_replay(self):
        first=await self.engine.submit(request(),'one');self.assertEqual(first,await self.engine.submit(request(),'one'));await asyncio.sleep(0);self.assertEqual(self.starts,[first['prompt_id']])
        other=request();other.selection.end_ms=200
        with self.assertRaises(HTTPException) as error:await self.engine.submit(other,'one')
        self.assertEqual(error.exception.status_code,409);self.engine.available=lambda:False;self.receipts.prompt_path(first['prompt_id']).unlink();self.assertEqual(first,await self.engine.submit(request(),'one'))
    async def test_low_disk_and_other_compute_reservations_do_not_start_inference(self):
        with patch('local_lip_sync.shutil.disk_usage',return_value=type('Space',(),{'free':100})()):
            with self.assertRaises(HTTPException) as error:await self.engine.submit(request(),'full')
        self.assertEqual(error.exception.status_code,507);self.assertEqual(self.starts,[]);self.assertEqual(list(self.root.iterdir()),[])
        task=asyncio.create_task(asyncio.Event().wait());task.media_reserved_bytes=640*1024*1024;self.engine.storage_peers=[type('Peer',(),{'pending':{'other':task}})()]
        try:
            with patch('local_lip_sync.shutil.disk_usage',return_value=type('Space',(),{'free':640*1024*1024+1})()):
                with self.assertRaises(HTTPException):await self.engine.submit(request(),'other-reserved')
        finally:task.cancel();await asyncio.gather(task,return_exceptions=True)
    async def test_restarted_complete_bytes_recover_and_corrupt_bytes_never_pass(self):
        first=await self.engine.submit(request(),'restored');identity=first['prompt_id'];await self.engine.close();self.output(identity)
        restarted=LocalLipSync(self.receipts,None,None,None);result=await restarted.status(identity);self.assertEqual(result['status'],'succeeded');self.assertEqual(result['outputs'][0]['filename'],'output.mp4')
        (restarted.directory(identity)/'output.mp4').write_bytes(b'corrupt')
        with self.assertRaises(HTTPException) as error:await restarted.status(identity)
        self.assertEqual(error.exception.status_code,409)
    async def test_pending_restart_fails_without_second_inference_and_invalid_identity_is_rejected(self):
        first=await self.engine.submit(request(),'pending');await self.engine.close();restarted=LocalLipSync(self.receipts,None,None,None);self.assertEqual((await restarted.status(first['prompt_id']))['reason'],'execution_interrupted')
        with self.assertRaises(HTTPException):await restarted.status('../../output.mp4')
    async def test_cancel_targets_only_one_and_never_repeats_the_other(self):
        first=await self.engine.submit(request(),'cancel');other=await self.engine.submit(request(),'keep');self.assertEqual((await self.engine.cancel(first['prompt_id']))['status'],'cancelled');self.assertIn(other['prompt_id'],self.engine.pending)
    async def test_failed_receipt_write_leaves_no_input_or_executor(self):
        with patch.object(self.receipts,'write',side_effect=HTTPException(507,'full')):
            with self.assertRaises(HTTPException):await self.engine.submit(request(),'write-failed')
        self.assertEqual(self.starts,[]);self.assertEqual(list(self.root.glob('lip-sync/*/input.json')),[])
    async def test_modified_source_selection_or_truncated_dialogue_manifest_cannot_be_adopted(self):
        first=await self.engine.submit(request(),'manifest');identity=first['prompt_id'];await self.engine.close();result=self.output(identity);directory=self.engine.directory(identity);receipt=self.engine.lookup(identity)[1]
        for change in [{'source_sha256':'0'*64},{'model_sha256':'0'*64},{'selection':{**receipt['selection'],'audio_start_ms':1}},{'timing':{**result['timing'],'audio_seconds':.05}}]:
            (directory/'result.json').write_text(json.dumps({**result,**change}));self.assertFalse(self.engine.completed(directory,receipt))

if __name__=='__main__':unittest.main()
