"""Lip sync never silently changes speakers, freezes video or truncates words."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from studio_musetalk import validate_lip_request, validate_lip_selection, validate_face_track, prepare_lip_feature_audio, mux_lip_output, lip_crop_geometry
from studio_media_tools import validate_options


class LipSelectionTest(unittest.TestCase):
    def test_reviewed_full_face_region_cannot_be_replaced_by_actual_nose_false_positive(self):
        geometry = lip_crop_geometry((291,165,55,55),(220,35,215,250),640,384)
        self.assertEqual(geometry['crop'],(220,35,435,285))
        self.assertEqual(geometry['source'],'reviewed-full-face-region')
        self.assertEqual(geometry['center'],(107,175))
        # Mouth at (320,210), both eyes at y140: include lips, leave eyes outside.
        cx,cy=geometry['center'];ax,ay=geometry['axes']
        self.assertLess(((320-220-cx)/ax)**2+((210-35-cy)/ay)**2,1)
        self.assertGreater(((320-220-cx)/ax)**2+((140-35-cy)/ay)**2,1)
        with self.assertRaisesRegex(ValueError,'exceeds'):
            lip_crop_geometry((10,10,55,55),(220,35,215,250),640,384)
        self.assertEqual(lip_crop_geometry((230,71,170,170),None,640,384)['source'],'single-frontal-face-cascade')

    def test_real_encoder_keeps_all_inferred_frames_and_complete_fractional_dialogue(self):
        import os
        import tempfile
        import subprocess
        import numpy as np
        import soundfile as sf
        ffmpeg = os.environ.get('STUDIO_FFMPEG', 'ffmpeg')
        with tempfile.TemporaryDirectory(prefix='studio-lip-mux-') as directory:
            root = Path(directory)
            for count in [41858, 16000]:
                with self.subTest(samples=count):
                    wav, feature, silent, output = [root/name for name in ['dialogue.wav','feature.wav','silent.mp4','output.mp4']]
                    sf.write(wav, .2*np.sin(np.arange(count)*2*np.pi*440/16000),16000,subtype='PCM_16')
                    original = wav.read_bytes()
                    timing = prepare_lip_feature_audio(wav,feature,32)
                    subprocess.run([ffmpeg,'-nostdin','-v','error','-y','-f','lavfi','-i','testsrc2=size=160x96:rate=32','-frames:v',str(timing['frame_count']),'-an','-c:v','mpeg4',str(silent)],check=True,timeout=30)
                    result = mux_lip_output(silent,wav,output,ffmpeg,timing)
                    self.assertEqual(result['output_frames'],timing['frame_count'])
                    self.assertAlmostEqual(result['audio_seconds'],count/16000,places=5)
                    self.assertLessEqual(result['video_seconds']-result['audio_seconds'],1/32)
                    self.assertEqual(wav.read_bytes(),original)
                    subprocess.run([ffmpeg,'-nostdin','-v','error','-i',str(output),'-f','null','-'],check=True,timeout=30)

    def test_partial_last_frame_gets_real_silent_feature_context_without_truncating_or_padding_final_dialogue(self):
        import hashlib
        import math
        import tempfile
        import numpy as np
        import soundfile as sf
        with tempfile.TemporaryDirectory(prefix='studio-lip-feature-clock-') as directory:
            original, feature = Path(directory)/'dialogue.wav', Path(directory)/'feature.wav'
            for fps, count in [(32,41858),(16,16000),(16,21000),(24,41858),(25,41858),(60,1601)]:
                with self.subTest(fps=fps,samples=count):
                    # Last samples remain non-silent: dropping a tail is observable.
                    sf.write(original,np.linspace(-.3,.3,count,dtype=np.float32),16000,subtype='PCM_16')
                    original_bytes=original.read_bytes()
                    timing=prepare_lip_feature_audio(original,feature,fps)
                    source, rate=sf.read(original,dtype='float32')
                    padded, padded_rate=sf.read(feature,dtype='float32')
                    self.assertEqual(rate,padded_rate)
                    self.assertTrue(np.array_equal(source,padded[:len(source)]))
                    self.assertTrue(np.all(padded[len(source):]==0))
                    self.assertEqual(original.read_bytes(),original_bytes)
                    self.assertLessEqual(len(padded)-len(source),math.ceil(rate/fps))
                    self.assertGreaterEqual(math.floor(len(padded)/rate*fps),timing['frame_count'])
                    self.assertEqual(timing['frame_count'],math.ceil(count*fps/rate-.001))
                    if fps==32:
                        self.assertEqual(timing['frame_count'],84)
                        self.assertEqual(timing['feature_padding_samples'],142)
                        self.assertEqual(hashlib.sha256(original_bytes).digest(),hashlib.sha256(original.read_bytes()).digest())

    def valid(self):
        return {'start': 2, 'end': 3, 'x': 640, 'y': 0, 'width': 640, 'height': 384}

    def test_independent_source_offsets_and_right_speaker_region(self):
        selection = validate_lip_selection(self.valid(), .2, 1, {'duration': 5, 'width': 1280, 'height': 384}, 1.3)
        self.assertEqual(selection, {'start': 2, 'end': 3, 'audio_start': .2, 'duration': 1, 'roi': (640, 0, 640, 384)})
        automatic = dict(self.valid(), x=0, width=0, height=0)
        self.assertIsNone(validate_lip_selection(automatic, 0, 1)['roi'])

    def test_sources_must_cover_the_entire_selected_interval(self):
        for video, audio in [({'duration': 2.9, 'width': 1280, 'height': 384}, 2), ({'duration': 5, 'width': 1280, 'height': 384}, 1.1), ({'duration': 5, 'width': 1000, 'height': 384}, 2)]:
            with self.subTest(video=video, audio=audio), self.assertRaises(ValueError):
                validate_lip_selection(self.valid(), .2, 1, video, audio)

    def test_invalid_or_ambiguous_selection_is_rejected_before_model_load(self):
        for change in [{'start': float('nan')}, {'start': -1}, {'end': 1}, {'width': 0}, {'width': 10}, {'x': True}, {'x': 1.5}, {'rotation': 90}]:
            with self.subTest(change=change), self.assertRaises(ValueError):
                validate_lip_selection(dict(self.valid(), **change), 0, 1)
        for value in [None, -1, float('inf'), True]:
            with self.subTest(audio_start=value), self.assertRaises(ValueError):
                validate_lip_selection(self.valid(), value, 1)
        with self.assertRaises(ValueError): validate_lip_selection(None, 0, 1)

    def test_exactly_one_audio_and_video_reference(self):
        body = {'operation': 'lip_sync', 'seconds': 1, 'edit': self.valid(), 'references': [{'type': 'video'}, {'type': 'audio'}], 'options': {'lip_audio_start': .2}}
        self.assertEqual(validate_lip_request(body)['audio_start'], .2)
        for refs in [[], [{'type': 'video'}, {'type': 'video'}], [*body['references'], {'type': 'audio'}]]:
            with self.subTest(refs=refs), self.assertRaises(ValueError): validate_lip_request(dict(body, references=refs))

    def test_audio_start_is_lip_sync_only(self):
        self.assertEqual(validate_options({'operation': 'lip_sync', 'options': {'lip_audio_start': .2}})['lip_audio_start'], .2)
        for action in ['music', 'voice_speech', 'image_grid']:
            with self.subTest(action=action), self.assertRaises(ValueError): validate_options({'operation': action, 'options': {'lip_audio_start': .2}})

    def test_lost_or_jumping_speaker_cannot_switch_to_another_person(self):
        validate_face_track([(10, 10, 100, 100), (12, 11, 101, 100)])
        for boxes in [[(10, 10, 100, 100), (250, 10, 100, 100)], [(10, 10, 100, 100), (10, 10, 200, 200)]]:
            with self.subTest(boxes=boxes), self.assertRaisesRegex(ValueError, 'lost or changed'): validate_face_track(boxes)


if __name__ == '__main__': unittest.main()
