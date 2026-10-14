import unittest,tempfile,shutil,json,threading,sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import numpy as np
import soundfile as sf
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from studio_lyrics import repair_song

class SongRepairTests(unittest.TestCase):
 def run_repair(self,recognized,manual=False):
  folder=tempfile.TemporaryDirectory();self.addCleanup(folder.cleanup);root=Path(folder.name);source=root/'source.wav';output=root/'result.wav';rate=8000
  clock=np.arange(rate*10)/rate;signal=np.column_stack([.1*np.sin(clock*30),.1*np.cos(clock*30)]).astype('float32');sf.write(source,signal,rate,subtype='PCM_16')
  original,_=sf.read(source,dtype='float32',always_2d=True)
  def music(_job,_body,path):sf.write(path,np.zeros((rate*8,2)),rate)
  worker=SimpleNamespace(reference=lambda ref,target:source,music=music,transcribe=lambda *args:recognized,ffmpeg=shutil.which('ffmpeg'),lock=threading.Lock())
  body={'seconds':8,'language':'en','options':{'music_mode':'song','lyrics':'Hello world','repair_start':4,'repair_end':6},'references':[{'type':'audio'}]}
  if manual:
   body={'operation':'audio_separate','seconds':20,'options':{'repair_start':4,'repair_end':6,'candidate_start':1,'candidate_end':2},'references':[{'type':'audio'},{'type':'audio'}]}
   worker.music=lambda *args:self.fail('A chosen candidate must not regenerate music')
   worker.transcribe=lambda *args:self.fail('A user-confirmed interval must not fabricate an ASR pass')
  def stems(_worker,_body,work):
   path=work/'vocals.wav';v=np.zeros((rate*10,2),dtype='float32')
   if work.name=='stems-phrase':v[rate:2*rate]=.02
   sf.write(path,v,rate,subtype='FLOAT');return {'path':str(path)}
  with patch('studio_media_tools.audio_tool',stems):repair_song(worker,'job',body,output)
  return root,source,output,original,rate
 def test_unrecognized_phrase_retains_original_bytes_and_exposes_candidate(self):
  root,source,output,_,_=self.run_repair({'text':'Other words','segments':[]})
  self.assertEqual(source.read_bytes(),output.read_bytes());self.assertFalse(json.loads((root/'repair-manifest.json').read_text())['applied']);self.assertTrue((root/'repair-candidate.wav').is_file())
 def test_intro_is_skipped_and_accompaniment_and_unselected_audio_are_preserved(self):
  root,_,output,original,rate=self.run_repair({'text':'Hello world','words':[{'text':'Hello','start':1,'end':1.4},{'text':'world','start':1.4,'end':2}]})
  actual,_=sf.read(output,dtype='float32',always_2d=True)
  np.testing.assert_array_equal(actual[:4*rate],original[:4*rate]);np.testing.assert_array_equal(actual[6*rate:],original[6*rate:]);self.assertGreater(float(np.max(actual[4*rate:6*rate]-original[4*rate:6*rate])),.019)
  self.assertTrue(json.loads((root/'repair-manifest.json').read_text())['applied'])
 def test_manual_candidate_selection_retains_other_intervals_and_reports_both_processed_sources(self):
  root,_,output,original,rate=self.run_repair({},manual=True)
  actual,_=sf.read(output,dtype='float32',always_2d=True);np.testing.assert_array_equal(actual[:4*rate],original[:4*rate]);np.testing.assert_array_equal(actual[6*rate:],original[6*rate:])
  manifest=json.loads((root/'repair-manifest.json').read_text());self.assertTrue(manifest['applied']);self.assertEqual(manifest['selection_method'],'user_selected_intervals');self.assertEqual(manifest['processing_seconds'],20)

if __name__=='__main__':unittest.main()
