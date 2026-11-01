import unittest
from types import SimpleNamespace as Item
from transcribe_local import recognition_payload


class ActualWordPayloadTests(unittest.TestCase):
    def test_real_word_times_and_zero_confidence_are_retained(self):
        segment = Item(start=0, end=2, text=" Hello world! ", words=[Item(start=0.1, end=0.8, word=" Hello", probability=0), Item(start=1, end=2, word=" world!", probability=0.9)])
        payload = recognition_payload([segment], "en")
        self.assertEqual(payload["words"][0], {"start": 0.1, "end": 0.8, "text": "Hello", "confidence": 0})
        self.assertNotIn("speaker", payload["words"][0])

    def test_zero_duration_words_are_not_given_fake_intervals(self):
        segment = Item(start=0, end=2, text="字。", words=[Item(start=0, end=1, word="字", probability=0.8), Item(start=1, end=1, word="。", probability=0.9)])
        payload = recognition_payload([segment], "zh")
        self.assertEqual(len(payload["words"]), 1)
        self.assertNotIn("word_timing_incomplete", payload)
        segment.words.append(Item(start=1.5, end=1.5, word="漏字", probability=0.1))
        self.assertTrue(recognition_payload([segment], "zh")["word_timing_incomplete"])

    def test_unusable_model_timing_and_confidence_are_rejected(self):
        for start, end, confidence in [(-1, 1, 0.5), (1, 0, 0.5), (0, 1, 1.5), (0, float("inf"), 0.5)]:
            segment = Item(start=0, end=2, text="word", words=[Item(start=start, end=end, word="word", probability=confidence)])
            with self.assertRaises(ValueError):
                recognition_payload([segment], "en")


if __name__ == "__main__":
    unittest.main()
