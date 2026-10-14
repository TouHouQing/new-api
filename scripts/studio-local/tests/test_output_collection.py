import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from local_model_adapter import saved_comfy_outputs
from local_model_adapter import LocalModels
from types import SimpleNamespace


class SavedOutputCollectionTest(unittest.TestCase):
    def test_preservation_opt_out_is_explicit_and_invalid_flags_fail_before_inference(self):
        models=LocalModels.__new__(LocalModels)
        models.frames_per_second=24
        models.media=lambda *args: self.fail('Opting out must not load reference images')
        result={}
        models.preserve_reference_frames({'model':'wan2.1-vace-1.3b','metadata':{'preserve_keyframes':False}},result,Path('unused'))
        self.assertEqual(result,{})
        with self.assertRaisesRegex(ValueError,'true or false'):
            models.parameters({'model':'wan2.1-vace-1.3b','seconds':1,'metadata':{'preserve_keyframes':'false'}},'video')
    def test_cpu_text_encoding_preserves_generation_parameters_and_source_workflow(self):
        import tempfile, json
        graph = {'clip': {'class_type': 'CLIPLoader', 'inputs': {'clip_name': 'owned.safetensors', 'type':'wan'}}, 'sampler': {'class_type':'KSampler', 'inputs':{'seed':'__SEED__','steps':20}}, 'video': {'class_type':'CreateVideo','inputs':{'fps':24}}}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'wan22_ti2v_api.json'
            path.write_text(json.dumps(graph))
            models = LocalModels.__new__(LocalModels)
            models.args = SimpleNamespace(workflow_directory=directory, text_device='cpu')
            result = models.workflow('video', {'prompt':'Story','width':640,'height':384,'seed':0,'fps':12})
            self.assertEqual(result['clip']['inputs']['device'], 'cpu')
            self.assertEqual(result['sampler']['inputs'], {'seed':0,'steps':20})
            self.assertEqual(result['video']['inputs']['fps'],12)
            self.assertEqual(json.loads(path.read_text()),graph)

    def test_native_frame_rate_controls_actual_frame_count_and_rejects_invalid_values(self):
        models = LocalModels.__new__(LocalModels)
        models.frames_per_second=24
        values=models.parameters({'model':'wan2.2-ti2v-5b','seconds':10,'metadata':{'fps':12}},'video')
        self.assertEqual((values['fps'],values['frames']),(12,121))
        for fps in [0, True, '12', 25, float('nan')]:
            with self.subTest(fps=fps),self.assertRaises(ValueError):
                models.parameters({'model':'wan2.2-ti2v-5b','metadata':{'fps':fps}},'video')

    def test_explicit_negative_changes_only_the_samplers_actual_negative_encoder(self):
        import tempfile, json
        graph = {'positive':{'class_type':'CLIPTextEncode','inputs':{'text':'__PROMPT__'}},'negative':{'class_type':'CLIPTextEncode','inputs':{'text':'Template negative'}},'unused':{'class_type':'CLIPTextEncode','inputs':{'text':'Preserve unrelated text'}},'sampler':{'class_type':'KSampler','inputs':{'positive':['positive',0],'negative':['negative',0]}}}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'wan22_ti2v_api.json'
            path.write_text(json.dumps(graph))
            models = LocalModels.__new__(LocalModels)
            models.args = SimpleNamespace(workflow_directory=directory,text_device='cpu')
            result = models.workflow('video',{'prompt':'Story','negative':'No stripes','negative_provided':True,'fps':12,'width':640,'height':384})
            self.assertEqual(result['negative']['inputs']['text'],'No stripes')
            self.assertEqual(result['unused']['inputs']['text'],'Preserve unrelated text')
            self.assertEqual(json.loads(path.read_text()),graph)

    def test_tiled_decode_keeps_source_workflow_and_output_connections(self):
        import tempfile,json
        graph={'decode':{'class_type':'VAEDecode','inputs':{'samples':['sampler',0],'vae':['vae',0]}},'video':{'class_type':'CreateVideo','inputs':{'images':['decode',0],'fps':24}}}
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'wan22_ti2v_api.json';path.write_text(json.dumps(graph))
            models=LocalModels.__new__(LocalModels)
            models.args=SimpleNamespace(workflow_directory=directory,text_device='cpu',tile_video_decode=True)
            result=models.workflow('video',{'prompt':'Story','width':640,'height':384,'fps':12})
            self.assertEqual(result['decode']['class_type'],'VAEDecodeTiled')
            self.assertEqual(result['decode']['inputs']['samples'],['sampler',0])
            self.assertEqual(result['video']['inputs']['images'],['decode',0])
            self.assertEqual(result['decode']['inputs']['temporal_size'],16)
            self.assertEqual(json.loads(path.read_text()),graph)

    def test_input_mask_and_motion_previews_never_become_generated_outputs(self):
        entry = {'prompt': [0, 'receipt', {'mask': {'class_type': 'LoadVideo'}, 'motion': {'class_type': 'LoadVideo'}, 'save': {'class_type': 'SaveVideo'}}], 'outputs': {
            'mask': {'images': [{'filename': 'mask.mp4', 'type': 'input'}]},
            'motion': {'images': [{'filename': 'source.mp4', 'type': 'input'}]},
            'save': {'images': [{'filename': 'film.mp4', 'type': 'output', 'subfolder': 'studio'}]},
        }}
        outputs = saved_comfy_outputs(entry, 'http://127.0.0.1:8288')
        self.assertEqual([item['filename'] for item in outputs], ['film.mp4'])
        self.assertIn('type=output', outputs[0]['url'])

    def test_incomplete_history_and_untrusted_preview_return_no_artifact(self):
        self.assertEqual(saved_comfy_outputs({'outputs': {'save': {'images': [{'filename': 'source.mp4', 'type': 'input'}]}}}, 'http://127.0.0.1:8288'), [])


if __name__ == '__main__': unittest.main()
