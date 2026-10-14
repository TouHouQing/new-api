import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from xml.etree import ElementTree

import opentimelineio as otio

SOURCE = Path(__file__).resolve().parents[3] / 'service/resources/studio_editorial.py'
spec = importlib.util.spec_from_file_location('studio_editorial', SOURCE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class EditorialExportTests(unittest.TestCase):
    def test_xml_and_otio_keep_clip_order_and_independent_audio_offsets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'editorial').mkdir()
            # Timeline adapters need stored references; media decoding has its
            # own real FFmpeg integration in service/studio_workflow_test.go.
            for name in ['one.mp4','two.mp4','music.wav']:
                (root / 'editorial' / name).touch()
            plan = {'title':'镜头与声音', 'project_id':'film', 'revision':2, 'fps':24, 'clips':[
                {'path':'editorial/one.mp4','frames':48,'name':'第一镜','source':{'node_id':'one','take_id':'take-one','speed':1.5}},
                {'path':'editorial/two.mp4','frames':24,'name':'第二镜','source':{'node_id':'two','take_id':'take-two','speed':1}},
            ],'audio':[{'path':'editorial/music.wav','frames':24,'offset_frames':36,'name':'配乐','source':{'media_id':'music','volume':.25}}]}
            path = root / 'plan.json'; path.write_text(json.dumps(plan,ensure_ascii=False),encoding='utf-8')
            module.export_editorial(path,root)
            for filename,adapter in [('timeline.otio','otio_json'),('timeline.xml','fcp_xml'),('timeline.fcpxml','fcpx_xml')]:
                restored=otio.adapters.read_from_file(str(root/filename),adapter_name=adapter)
                self.assertAlmostEqual(restored.duration().to_seconds(),3)
                tracks=list(restored.tracks)
                self.assertEqual(len(tracks),3)
                pictures = [track for track in tracks if track.kind == otio.schema.TrackKind.Video]
                self.assertEqual([clip.name for clip in pictures[0]],['第一镜','第二镜'])
                music = next(track for track in tracks if any(isinstance(clip,otio.schema.Clip) and clip.name == '配乐' for clip in track))
                self.assertAlmostEqual(music.duration().to_seconds(),2.5)
                clip = next(item for item in music if isinstance(item,otio.schema.Clip))
                self.assertAlmostEqual(music.range_of_child(clip).start_time.to_seconds(),1.5)
            for filename in ['timeline.xml','timeline.fcpxml']:
                ElementTree.parse(root/filename)
            restored=otio.adapters.read_from_file(str(root/'timeline.otio'))
            self.assertEqual(restored.tracks[0][0].metadata['studio']['take_id'],'take-one')
            self.assertEqual(restored.tracks[2][1].metadata['studio']['volume'],.25)

    def test_outside_package_references_are_rejected_before_writing_a_timeline(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            path=root/'plan.json'
            path.write_text(json.dumps({'title':'Film','project_id':'film','revision':1,'fps':24,'clips':[{'path':'../source.mp4','frames':24,'name':'one','source':{}}],'audio':[]}))
            with self.assertRaisesRegex(ValueError,'package-relative'):
                module.export_editorial(path,root)
            self.assertFalse((root/'timeline.xml').exists())

if __name__=='__main__': unittest.main()
