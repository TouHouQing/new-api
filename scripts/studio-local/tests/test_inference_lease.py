import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from studio_inference_lease import gpu_lease


class InferenceLeaseTest(unittest.TestCase):
    def test_another_process_waits_and_a_released_lease_can_be_reused(self):
        with tempfile.TemporaryDirectory(prefix='studio-gpu-lease-') as directory:
            code = "import sys;sys.path.insert(0,sys.argv[1]);from studio_inference_lease import gpu_lease\ntry:\n with gpu_lease(sys.argv[2], timeout=.2): print('acquired')\nexcept TimeoutError: print('waiting')"
            args = [sys.executable, '-c', code, str(Path(__file__).resolve().parents[1]), directory]
            with gpu_lease(directory):
                self.assertEqual(subprocess.check_output(args, text=True).strip(), 'waiting')
            self.assertEqual(subprocess.check_output(args, text=True).strip(), 'acquired')
