"""Keep one real speaker while merging duplicate cascade windows.

Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
"""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from studio_musetalk import single_visible_face


class SingleSpeakerFaceTest(unittest.TestCase):
    def test_actual_single_presenter_uses_confident_face_not_larger_neck_window(self):
        boxes = [(230, 71, 170, 170), (215, 122, 198, 198)]
        self.assertEqual(single_visible_face(boxes, [9.550389979674947, 2.05849711940391]), boxes[0])
        self.assertEqual(single_visible_face(boxes[::-1], [2.05849711940391, 9.550389979674947]), boxes[0])

    def test_almost_identical_windows_are_one_detection(self):
        self.assertEqual(single_visible_face([(10, 10, 100, 100), (11, 11, 100, 100)], [8, 7]), (10, 10, 100, 100))

    def test_separate_speakers_are_rejected_even_if_one_detection_is_weaker(self):
        with self.assertRaisesRegex(ValueError, 'exactly one'):
            single_visible_face([(10, 10, 100, 100), (240, 10, 100, 100)], [9, 2])

    def test_overlapping_confident_speakers_require_manual_region_selection(self):
        with self.assertRaisesRegex(ValueError, 'ambiguous overlapping'):
            single_visible_face([(10, 10, 100, 100), (40, 10, 100, 100)], [8, 7])

    def test_empty_low_confidence_and_invalid_detections_are_rejected(self):
        for boxes, scores in [([], []), ([(10, 10, 100, 100)], [.2]), ([(0, 0, 0, 100)], [9]), ([(10, 10, 100, 100)], [float('nan')]), ([(10, 10, 100, 100)], []), ([(-1, 0, 100, 100)], [9])]:
            with self.subTest(boxes=boxes, scores=scores), self.assertRaises(ValueError):
                single_visible_face(boxes, scores)


if __name__ == '__main__':
    unittest.main()
