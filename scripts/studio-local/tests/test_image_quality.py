import sys, unittest
from pathlib import Path
import numpy as np
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from studio_media_tools import blend_outpaint_source, storyboard_quality, validate_options, layer_removal_mask

class ImageQualityTests(unittest.TestCase):
    def test_automatic_background_removal_covers_segmentation_holes_and_distant_tail(self):
        mask = Image.new('L', (128, 96)); mask.putpixel((30, 40), 255); mask.putpixel((90, 60), 255)
        automatic = layer_removal_mask(mask, True)
        self.assertEqual(int(automatic[50, 60]), 255)
        self.assertEqual(int(automatic[0, 0]), 0)
        self.assertEqual(int(layer_removal_mask(mask, False)[50, 60]), 0)
    def test_natural_outpaint_preserves_interior_and_blends_only_documented_boundary(self):
        source = Image.new('RGBA', (128, 96), 'red')
        outer = Image.new('RGBA', (192, 160), 'blue')
        result = np.asarray(blend_outpaint_source(outer, source, (32, 32)))
        np.testing.assert_array_equal(result[64:96, 64:128], np.asarray(source)[32:64, 32:96])
        self.assertTrue((result[32, 32] != np.asarray(source)[0, 0]).any())
        np.testing.assert_array_equal(result[:32], np.asarray(outer)[:32])

    def test_duplicate_panels_are_reported_without_claiming_visual_approval(self):
        image = Image.fromarray(np.arange(256, dtype='uint8').reshape(16, 16))
        report = storyboard_quality([image, image.copy()], ['Opening', 'Reaction'])
        self.assertEqual(report['status'], 'review_required')
        self.assertEqual([(p['first'], p['second']) for p in report['similar_pairs']], [(1, 2)])
        self.assertEqual(report['panels'][1]['direction'], 'Reaction')

    def test_invalid_panel_and_repair_inputs_are_rejected_before_inference(self):
        for body in [
            {'operation': 'image_grid', 'options': {'rows': 2, 'columns': 2, 'panel_prompts': ['Only one']}},
            {'operation': 'image_grid', 'options': {'redo_panel': 5, 'rows': 2, 'columns': 2}},
            {'operation': 'image_outpaint', 'options': {'outpaint_mode': 'unknown'}},
            {'operation': 'music', 'seconds': 2, 'options': {'music_mode': 'song', 'lyrics': 'Hello', 'repair_start': 9, 'repair_end': 8}},
        ]:
            with self.subTest(body=body), self.assertRaises(ValueError): validate_options(body)

    def test_valid_repair_can_generate_extra_intro_time_without_losing_numeric_validation(self):
        options = {'music_mode': 'song', 'lyrics': 'Friends forever', 'repair_start': 12, 'repair_end': 20, 'expression': 0}
        self.assertEqual(validate_options({'operation': 'music', 'seconds': 12, 'options': options}), options)

if __name__ == '__main__': unittest.main()
