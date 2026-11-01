"""Real local CPU/FFmpeg checks with explicit synthetic ground truth."""
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import unittest
import wave

from measurements import analyze
from worker import Worker


class MeasurementsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import numpy as np
        cls.np=np
        cls.ffmpeg=os.environ.get('YINGCE_TEST_FFMPEG') or shutil.which('ffmpeg')
        if not cls.ffmpeg:
            raise RuntimeError('Actual FFmpeg is required for these tests')

    def setUp(self):
        self.directory=tempfile.TemporaryDirectory(prefix='yingce-analysis-test-')
        self.root=Path(self.directory.name)
        self.addCleanup(self.directory.cleanup)
        os.environ['NUMBA_CACHE_DIR']=str(self.root/'numba-cache')

    def video(self,frames,name):
        target=self.root/name
        height,width=frames[0].shape[:2]
        subprocess.run([self.ffmpeg,'-hide_banner','-loglevel','error','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{width}x{height}','-framerate','8','-i','pipe:0','-an','-c:v','libx264','-preset','ultrafast','-crf','0','-pix_fmt','yuv444p',str(target)],input=b''.join(frame.tobytes() for frame in frames),check=True,timeout=30,capture_output=True)
        return target

    def audio(self,samples,name):
        target=self.root/name
        with wave.open(str(target),'wb') as writer:
            writer.setnchannels(1)
            writer.setsampwidth(2)
            writer.setframerate(22050)
            writer.writeframes((samples*32767).astype('<i2').tobytes())
        return target

    def test_reference_measures_known_cut_times(self):
        np=self.np
        frames=[np.full((160,240,3),color,dtype=np.uint8) for color in [(240,15,15)]*8+[(15,240,15)]*8+[(15,15,240)]*8]
        result=analyze(self.video(frames,'cuts.mp4'),self.ffmpeg,'reference_video',{})
        self.assertEqual(len(result['cuts']),2)
        self.assertLessEqual(abs(result['cuts'][0]['time']-1),0.125)
        self.assertLessEqual(abs(result['cuts'][1]['time']-2),0.125)
        self.assertEqual(len(result['sections']),3)
        self.assertTrue(all(item['review_required'] for item in result['cuts']))

    def test_monochrome_cuts_use_actual_luminance_without_approving_them(self):
        np=self.np
        frames=[np.full((160,240,3),value,dtype=np.uint8) for value in [12]*8+[240]*8+[12]*8]
        result=analyze(self.video(frames,'monochrome.mp4'),self.ffmpeg,'reference_video',{})
        self.assertEqual(len(result['cuts']),2)
        for index,cut in enumerate(result['cuts']):
            self.assertLessEqual(abs(cut['time']-(index+1)),.125)
            self.assertGreater(cut['luminance_distance'],.9)
            self.assertTrue(cut['review_required'])

    def test_small_monochrome_exposure_change_does_not_invent_a_cut(self):
        np=self.np
        frames=[np.full((160,240,3),value,dtype=np.uint8) for value in [80]*8+[95]*8+[80]*8]
        result=analyze(self.video(frames,'exposure.mp4'),self.ffmpeg,'reference_video',{})
        self.assertEqual(result['cuts'],[])

    def test_silence_has_no_invented_beats(self):
        path=self.audio(self.np.zeros(22050*6),'silence.wav')
        result=analyze(path,self.ffmpeg,'audio_structure',{})
        self.assertTrue(result['silent'])
        self.assertEqual(result['beat_times'],[])
        self.assertIsNone(result['tempo_bpm'])
        self.assertTrue(all(section['label']=='silence' for section in result['sections']))

    def test_click_track_measures_actual_120_bpm(self):
        np=self.np
        samples=np.zeros(22050*12,dtype=np.float32)
        pulse=np.sin(2*np.pi*880*np.arange(661)/22050)*np.exp(-np.arange(661)/100)*0.8
        for index in range(24):
            start=round(index*0.5*22050)
            samples[start:start+len(pulse)]+=pulse[:len(samples)-start]
        result=analyze(self.audio(samples,'clicks.wav'),self.ffmpeg,'audio_structure',{})
        self.assertGreaterEqual(len(result['beat_times']),12)
        self.assertLess(abs(result['tempo_bpm']-120),3)
        self.assertLess(abs(float(np.median(np.diff(result['beat_times'])))-0.5),0.04)
        self.assertTrue(result['review_required'])

    def tracking_frames(self,occlude=False):
        np=self.np
        texture=np.random.default_rng(51).integers(25,245,(40,40,3),dtype=np.uint8)
        frames=[]
        for index in range(24):
            frame=np.full((160,240,3),18,dtype=np.uint8)
            if not occlude or index<12:
                x=20+index*2
                frame[40:80,x:x+40]=texture
            frames.append(frame)
        return frames

    def tracking(self,path):
        return analyze(path,self.ffmpeg,'subject_track',{'roi':{'x':20/240,'y':40/160,'width':40/240,'height':40/160},'anchor_time':0,'target_aspect':9/16})

    def test_track_follows_texture_and_stops_trust_after_occlusion(self):
        result=self.tracking(self.video(self.tracking_frames(),'motion.mp4'))
        trusted=[point for point in result['points'][1:] if point['confidence']>=0.65]
        self.assertGreaterEqual(len(trusted),16)
        for point in trusted:
            expected=(20+round(point['time']*8)*2)/240
            self.assertLess(abs(point['roi']['x']-expected),0.015)
        lost=self.tracking(self.video(self.tracking_frames(True),'occlusion.mp4'))
        failed=[i for i,point in enumerate(lost['points'][1:],1) if point['reason']]
        self.assertTrue(failed)
        self.assertTrue(all(point['confidence']==0 and point['review_required'] for point in lost['points'][failed[0]:]))

    def test_worker_authentication_replay_and_real_cache_restart(self):
        path=self.audio(self.np.zeros(22050*6),'source.wav')
        raw=path.read_bytes()
        token=b'local-unit-worker-secret-with-32-bytes'
        worker=Worker(self.root,Path(self.ffmpeg),token)
        request={'engineVersion':1,'engineSHA256':worker.engine_sha256,'action':'audio_structure','media':base64.b64encode(raw).decode(),'options':{}}
        encoded=json.dumps(request).encode()
        stamp,nonce=str(int(time.time())),'a'*32
        message='POST\n/v1/analyze\n'+stamp+'\n'+nonce+'\n'+hashlib.sha256(encoded).hexdigest()
        headers={'X-Yingce-Analysis-Time':stamp,'X-Yingce-Analysis-Nonce':nonce,'X-Yingce-Analysis-Signature':hmac.new(token,message.encode(),hashlib.sha256).hexdigest()}
        self.assertTrue(worker.authorized('/v1/analyze',headers,encoded))
        self.assertFalse(worker.authorized('/v1/analyze',headers,encoded))
        self.assertFalse(worker.authorized('/v1/analyze',headers,encoded+b' '))
        first=worker.execute(request)
        restarted=Worker(self.root,Path(self.ffmpeg),token)
        self.assertEqual(restarted.execute(request),first)
        receipt=worker.cache/(first['cache_key']+'.json')
        receipt.unlink()
        (worker.cache/(first['cache_key']+'.tmp')).write_bytes(b'interrupted write')
        self.assertEqual(restarted.execute(request),first)
        self.assertFalse(any(path.name.startswith('native-analysis-') for path in self.root.iterdir()))
        self.assertFalse(any(path.suffix=='.tmp' for path in worker.cache.iterdir()))
        protected=worker.cache/'not-owned.txt'
        protected.write_text('keep')
        worker.prune()
        self.assertEqual(protected.read_text(),'keep')

    def test_invalid_roi_and_unknown_options_are_rejected(self):
        path=self.video(self.tracking_frames(),'input.mp4')
        for options in [{'roi':{'x':0.9,'y':0,'width':0.5,'height':0.5}},{'roi':{'x':True,'y':0,'width':0.5,'height':0.5}},{'url':'https://example.invalid/never-fetch'}]:
            with self.assertRaises(ValueError):
                analyze(path,self.ffmpeg,'subject_track',options)


if __name__=='__main__':
    unittest.main(verbosity=2)
