import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from comfy_private_memory import install_cpu_model_cleanup


class PrivateMemoryTest(unittest.TestCase):
    def test_idle_unload_releases_cpu_text_encoder_and_gpu_models(self):
        loaded = ['cuda:0', 'cpu']
        models = SimpleNamespace(torch=SimpleNamespace(device=lambda device: device))
        models.free_memory = lambda amount, device: loaded.__setitem__(slice(None), [item for item in loaded if item != device])
        models.unload_all_models = lambda: models.free_memory(1e30, 'cuda:0')
        install_cpu_model_cleanup(models)
        models.unload_all_models()
        self.assertEqual(loaded, [])


if __name__ == '__main__':
    unittest.main()
