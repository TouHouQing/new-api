import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import studio_vace


class VaceReferencesTest(unittest.TestCase):
    def reference(self, role, url='data:image/png;base64,YWJj'):
        kind = 'video_url' if role == 'reference_video' else 'image_url'
        return {'type': kind, 'role': role, kind: {'url': url}}

    def test_rejects_duplicate_slots_and_unknown_reference_types(self):
        for entries in [
            [self.reference('reference_image'), self.reference('reference_image', 'different')],
            [self.reference('unknown')],
        ]:
            with self.subTest(entries=entries), self.assertRaises(ValueError):
                studio_vace.references({'metadata': {'content': entries}})

    def test_all_reference_combinations_retain_each_slot(self):
        roles = ['first_frame', 'last_frame', 'reference_image', 'reference_video']
        for mask in range(16):
            selected = [role for index, role in enumerate(roles) if mask & (1 << index)]
            entries = [self.reference(role, 'data:video/mp4;base64,YWJj' if role == 'reference_video' else 'data:image/png;base64,YWJj') for role in selected]
            with self.subTest(roles=selected):
                self.assertEqual(list(studio_vace.references({'metadata': {'content': entries}})), selected)

    def test_combined_endpoints_use_motion_for_middle_and_keep_character_reference(self):
        graph = studio_vace.workflow({'width': 640, 'height': 384, 'frames': 17, 'prompt': 'Move gently', 'seed': 1}, {
            'first_frame': 'first.png', 'last_frame': 'last.png', 'reference_image': 'cat.png', 'reference_video': 'motion.mp4',
        })
        self.assertEqual(graph['middle_frames']['inputs']['image'], ['motion_edges', 0])
        self.assertEqual(graph['condition']['inputs']['reference_image'], ['reference', 0])
        self.assertEqual(graph['first_frame_mask']['inputs']['value'], 0)
        self.assertEqual(graph['last_frame_mask']['inputs']['value'], 0)

    def test_endpoint_masks_preserve_only_supplied_endpoints_and_trim_reference_latent(self):
        values = {'width': 640, 'height': 480, 'frames': 17, 'prompt': 'Move gently', 'seed': 1}
        first_only = studio_vace.workflow(values, {'first_frame': 'first.png'})
        self.assertEqual(first_only['first_frame_mask']['inputs']['value'], 0)
        self.assertEqual(first_only['last_frame_mask']['inputs']['value'], 1)
        both = studio_vace.workflow(values, {'first_frame': 'first.png', 'last_frame': 'last.png'})
        self.assertEqual(both['last_frame_mask']['inputs']['value'], 0)
        motion = studio_vace.workflow(values, {'reference_image': 'character.png', 'reference_video': 'movement.mp4'})
        self.assertEqual(motion['trim']['inputs']['trim_amount'], ['condition', 3])
        self.assertEqual(motion['motion_edges']['inputs']['image'], ['motion_batch', 0])
        self.assertEqual(motion['video']['inputs']['fps'], 16)

    def test_depth_control_retains_values_with_character_and_timed_frames(self):
        values = {'width': 384, 'height': 224, 'frames': 17, 'prompt': 'A moving fox', 'seed': 1, 'reference_control': 'depth'}
        graph = studio_vace.workflow(values, {'reference_video': 'depth.mp4', 'reference_image': 'fox.png', 'key_frame:8': 'middle.png'})
        self.assertNotIn('motion_edges', graph)
        self.assertEqual(graph['key_gap_8']['inputs']['image'], ['motion_batch', 0])
        self.assertEqual(graph['condition']['inputs']['reference_image'], ['reference', 0])

    def test_invalid_control_does_not_silently_use_edges(self):
        for control in ['normal', None, {'type': 'depth'}]:
            with self.subTest(control=control), self.assertRaises(ValueError):
                studio_vace.references({'metadata': {'reference_control': control, 'content': [self.reference('reference_video')]}})
        with self.assertRaises(ValueError):
            studio_vace.references({'metadata': {'reference_control': 'depth'}})


if __name__ == '__main__':
    unittest.main()
