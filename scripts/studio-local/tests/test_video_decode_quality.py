"""Protect the decoder boundary verified by a real shared-latent comparison."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from local_model_adapter import LocalModels


class VideoDecodeQualityTests(unittest.TestCase):
    def graph(self, directory, family='video', tiled_source=False, tile_policy=True, **overrides):
        source = {
            'sample': {'class_type': 'KSampler', 'inputs': {
                'seed': '__SEED__', 'steps': 20, 'cfg': 5.0,
                'sampler_name': 'uni_pc', 'scheduler': 'simple',
            }},
            'decode': {'class_type': 'VAEDecode', 'inputs': {
                'samples': ['sample', 0], 'vae': ['vae', 0],
            }},
            'video': {'class_type': 'CreateVideo', 'inputs': {'images': ['decode', 0], 'fps': 24}},
            'latent': {'class_type': 'Wan22ImageToVideoLatent', 'inputs': {
                'width': '__WIDTH__', 'height': '__HEIGHT__', 'length': '__FRAMES__',
            }},
        }
        if tiled_source:
            source['decode']['class_type'] = 'VAEDecodeTiled'
            source['decode']['inputs'].update(tile_size=256, overlap=64, temporal_size=16, temporal_overlap=4)
        filename = 'flux2_klein_api.json' if family == 'image' else 'wan22_ti2v_api.json'
        path = Path(directory) / filename
        before = json.dumps(source).encode()
        path.write_bytes(before)
        models = LocalModels.__new__(LocalModels)
        models.args = SimpleNamespace(workflow_directory=directory, tile_video_decode=tile_policy)
        models.configure_text_encoders = lambda graph: graph
        values = dict(prompt='Controlled draft', width=640, height=384, frames=17, fps=16, seed=191001)
        values.update(overrides)
        result = models.workflow(family, values)
        self.assertEqual(path.read_bytes(), before, 'The user workflow must stay unchanged')
        return result

    def test_verified_short_shape_uses_full_decode_and_preserves_the_actual_sampler_and_video(self):
        with tempfile.TemporaryDirectory() as directory:
            graph = self.graph(directory)
            self.assertEqual(graph['decode'], {'class_type': 'VAEDecode', 'inputs': {
                'samples': ['sample', 0], 'vae': ['vae', 0],
            }})
            self.assertEqual(graph['sample']['inputs'], {
                'seed': 191001, 'steps': 20, 'cfg': 5.0,
                'sampler_name': 'uni_pc', 'scheduler': 'simple',
            })
            self.assertEqual(graph['latent']['inputs'], {'width': 640, 'height': 384, 'length': 17})
            self.assertEqual(graph['video']['inputs']['fps'], 16)

    def test_exact_short_shape_removes_stale_tiling_parameters_from_a_tiled_source_graph(self):
        with tempfile.TemporaryDirectory() as directory:
            graph = self.graph(directory, tiled_source=True)
            self.assertEqual(graph['decode']['class_type'], 'VAEDecode')
            self.assertEqual(set(graph['decode']['inputs']), {'samples', 'vae'})

    def test_other_shapes_keep_the_established_tiled_memory_policy(self):
        for shape in [dict(frames=25), dict(frames=81), dict(width=1280, height=704), dict(width=384, height=640)]:
            with self.subTest(shape=shape), tempfile.TemporaryDirectory() as directory:
                graph = self.graph(directory, **shape)
                self.assertEqual(graph['decode']['class_type'], 'VAEDecodeTiled')
                self.assertEqual(graph['decode']['inputs']['temporal_size'], 16)
                self.assertEqual(graph['decode']['inputs']['tile_size'], 256)

    def test_a_disabled_tiled_policy_and_image_generation_are_not_forced_to_tile(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual(self.graph(directory, tile_policy=False, frames=81)['decode']['class_type'], 'VAEDecode')
            self.assertEqual(self.graph(directory, family='image')['decode']['class_type'], 'VAEDecode')


if __name__ == '__main__':
    unittest.main()
