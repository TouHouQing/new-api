"""Write portable, frame-based editorial timelines with OpenTimelineIO.

Copyright (C) 2023-2026 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
"""
import argparse
import json
from pathlib import Path

import opentimelineio as otio


def export_editorial(plan_path, directory):
    root = Path(directory).resolve()
    plan = json.loads(Path(plan_path).read_text(encoding='utf-8'))
    fps = plan['fps']
    timeline = otio.schema.Timeline(name=plan['title'])
    timeline.metadata['studio'] = {
        'project_id': plan['project_id'], 'revision': plan['revision'],
        'subtitles': 'subtitles.srt', 'source_project': 'project.json',
        'conformed_visual_effects': True,
        'frame_rate': fps, 'render_frame_rate': plan.get('render_fps', fps),
    }
    video = otio.schema.Track(name='Picture', kind=otio.schema.TrackKind.Video)
    original_sound = otio.schema.Track(name='Clip sound', kind=otio.schema.TrackKind.Audio)
    for item in plan['clips']:
        path = Path(item['path'])
        if path.is_absolute() or '..' in path.parts or not (root / path).is_file():
            raise ValueError('Editorial source must be an existing package-relative file')
        source_range = otio.opentime.TimeRange(
            otio.opentime.RationalTime(0, fps),
            otio.opentime.RationalTime(item['frames'], fps),
        )
        reference = otio.schema.ExternalReference(target_url=path.as_posix(), available_range=source_range)
        clip = otio.schema.Clip(name=item['name'], media_reference=reference, source_range=source_range)
        clip.metadata['studio'] = item['source']
        video.append(clip)
        original_sound.append(clip.deepcopy())
    timeline.tracks.append(video)
    timeline.tracks.append(original_sound)
    for item in plan['audio']:
        path = Path(item['path'])
        if path.is_absolute() or '..' in path.parts or not (root / path).is_file():
            raise ValueError('Editorial audio must be an existing package-relative file')
        track = otio.schema.Track(name=item['name'], kind=otio.schema.TrackKind.Audio)
        if item['offset_frames']:
            track.append(otio.schema.Gap(duration=otio.opentime.RationalTime(item['offset_frames'], fps)))
        source_range = otio.opentime.TimeRange(
            otio.opentime.RationalTime(0, fps), otio.opentime.RationalTime(item['frames'], fps),
        )
        reference = otio.schema.ExternalReference(target_url=path.as_posix(), available_range=source_range)
        clip = otio.schema.Clip(name=item['name'], media_reference=reference, source_range=source_range)
        clip.metadata['studio'] = item['source']
        track.append(clip)
        timeline.tracks.append(track)
    for filename, adapter in [('timeline.otio', 'otio_json'), ('timeline.xml', 'fcp_xml'), ('timeline.fcpxml', 'fcpx_xml')]:
        otio.adapters.write_to_file(timeline, str(root / filename), adapter_name=adapter)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('plan')
    parser.add_argument('directory')
    args = parser.parse_args()
    export_editorial(args.plan, args.directory)
