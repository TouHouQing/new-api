from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from studio_text_limits import text_context, MAX_TEXT_CONTEXT


class TextContextTests(unittest.TestCase):
    def test_plain_text_keeps_small_context_and_agent_uses_bounded_window(self):
        self.assertEqual(text_context({}), 8192)
        self.assertEqual(text_context({'tools': [{'type': 'function'}]}), MAX_TEXT_CONTEXT)
        self.assertEqual(text_context({'context_length': 32768, 'tools': [{}]}), 32768)

    def test_invalid_or_unbounded_context_is_refused_before_inference(self):
        for value in (True, '65536', 0, 2047, MAX_TEXT_CONTEXT + 1, 1 << 40):
            with self.subTest(value=value), self.assertRaises(ValueError):
                text_context({'context_length': value})


if __name__ == '__main__':
    unittest.main()
