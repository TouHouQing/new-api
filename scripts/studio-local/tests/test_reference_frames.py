import io
import json
import sys
import unittest
import tempfile
import subprocess
import hashlib
import shutil
from pathlib import Path
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from studio_reference_frames import preserve_video_frames


class ReferenceFramesTest(unittest.TestCase):
    def reference(self, color):
        stream=io.BytesIO();Image.new('RGB',(96,64),color).save(stream,format='PNG')
        return stream.getvalue(),'image/png'

    @unittest.skipUnless(shutil.which('ffmpeg'), 'Real FFmpeg required')
    def test_reference_frames_preserve_timing_duration_and_original_generation(self):
        ff=shutil.which('ffmpeg');probe=str(Path(ff).with_name('ffprobe'+Path(ff).suffix))
        with tempfile.TemporaryDirectory() as folder:
            target=Path(folder)/'clip.mp4'
            subprocess.run([ff,'-nostdin','-y','-v','error','-f','lavfi','-i','color=blue:size=64x64:rate=16','-frames:v','17','-c:v','libx264','-threads','2',str(target)],check=True)
            original=hashlib.sha256(target.read_bytes()).hexdigest();values={'width':64,'height':64,'frames':17,'fps':16};refs={'key_frame:0':self.reference('red'),'key_frame:8':self.reference('white')}
            report=preserve_video_frames(target,refs,values,ff)
            self.assertEqual(report['reference_frames_preserved'],[0,8]);self.assertEqual(hashlib.sha256(Path(report['original_output_path']).read_bytes()).hexdigest(),original)
            info=json.loads(subprocess.check_output([probe,'-v','error','-show_streams','-show_format','-of','json',str(target)]));self.assertEqual(int(info['streams'][0]['nb_frames']),17);self.assertAlmostEqual(float(info['format']['duration']),17/16,places=3)
            frames=subprocess.check_output([ff,'-nostdin','-v','error','-i',str(target),'-f','rawvideo','-pix_fmt','rgb24','pipe:1'])
            for index,color in [(0,(255,0,0)),(4,(0,0,255)),(8,(255,255,255))]:
                pixel=frames[index*64*64*3:index*64*64*3+3]
                self.assertTrue(all(abs(a-b)<12 for a,b in zip(pixel,color)),(index,tuple(pixel),color))
            digest=hashlib.sha256(target.read_bytes()).hexdigest();self.assertEqual(preserve_video_frames(target,refs,values,ff),report);self.assertEqual(hashlib.sha256(target.read_bytes()).hexdigest(),digest)
            target.write_bytes(Path(report['original_output_path']).read_bytes())
            recovered=preserve_video_frames(target,refs,values,ff)
            self.assertEqual(recovered['processed_sha256'],digest,'recovering a downloaded raw output must apply preservation again')

    def test_invalid_frame_indices_leave_the_source_untouched(self):
        with tempfile.TemporaryDirectory() as folder:
            target=Path(folder)/'clip.mp4';target.write_bytes(b'original')
            with self.assertRaisesRegex(ValueError,'indices'):
                preserve_video_frames(target,{'key_frame:99':self.reference('red')},{'width':64,'height':64,'frames':17,'fps':16},'unused')
            self.assertEqual(target.read_bytes(),b'original')
