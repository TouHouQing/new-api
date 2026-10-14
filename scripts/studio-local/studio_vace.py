"""Native ComfyUI VACE workflow for endpoints and motion reference drafts.

The graph follows Comfy-Org's Wan VACE templates: 20-step UniPC sampling,
WanVaceToVideo conditioning, reference-latent trimming and 16 fps video output.
Motion uses the source clip's edge sequence, retaining motion and composition.
"""
import json
MODEL = 'wan2.1-vace-1.3b'
FPS = 16
RESOLUTIONS = {'640x384', '384x640', '640x480', '480x640', '512x512', '384x224', '224x384'}


def references(body):
    metadata = body.get('metadata') or {}
    if isinstance(metadata, str):
        metadata = json.loads(metadata)
    if not isinstance(metadata, dict):
        raise ValueError('VACE metadata must be an object')
    control = metadata.get('reference_control', 'edges')
    if control not in ['edges', 'depth']:
        raise ValueError('VACE reference control must be edges or depth')
    content = metadata.get('content') or []
    if not isinstance(content, list):
        raise ValueError('VACE reference content must be an array')
    result = {}
    for item in content:
        if not isinstance(item, dict):
            raise ValueError('Each VACE reference must be an object')
        kind = item.get('type')
        role = item.get('role') or ('reference_image' if kind == 'image_url' else 'reference_video')
        if role == 'key_frame':
            import math
            seconds = float(body.get('seconds', 5))
            timestamp = item.get('time')
            if isinstance(timestamp, bool) or not isinstance(timestamp, (int, float)) or not math.isfinite(timestamp) or timestamp < 0 or timestamp > seconds:
                raise ValueError('Keyframes need a valid time within the shot')
            role = 'key_frame:' + str(round(timestamp * FPS))
            if len([key for key in result if key.startswith('key_frame:')]) >= 8: raise ValueError('Use at most eight timed keyframes')
        expected = 'video_url' if role in {'reference_video', 'source_video', 'mask_video'} else 'image_url'
        if role not in ['first_frame', 'last_frame', 'reference_image', 'reference_video', 'source_video', 'mask_video'] and not role.startswith('key_frame:') or kind != expected:
            raise ValueError('Unsupported VACE reference type or role')
        url = item.get(expected, {}).get('url')
        if not isinstance(url, str) or not url:
            raise ValueError('A VACE reference URL is required')
        if role in result and result[role] != url:
            raise ValueError('Each VACE reference slot accepts one source')
        result[role] = url
    # Top-level images represent first-frame mode only. Dedicated content
    # references retain their role and must never be silently reclassified.
    if not result:
        image = body.get('input_reference') or body.get('image')
        if image:
            result['first_frame'] = image
        images = body.get('images') or []
        if len(images) > 1:
            raise ValueError('VACE first-frame mode accepts one image')
        if images and 'first_frame' not in result:
            result['first_frame'] = images[0]
    if body.get('mode') == 'extend':
        raise ValueError('VACE continuation uses an extracted last frame; native extend is not supported')
    if ('source_video' in result) != ('mask_video' in result): raise ValueError('Video editing requires both source video and an edit mask')
    if control == 'depth' and 'reference_video' not in result:
        raise ValueError('Depth control requires a depth reference video')
    if 'source_video' in result and any(key in {'first_frame', 'last_frame', 'reference_video'} or key.startswith('key_frame:') for key in result): raise ValueError('Masked video editing accepts a replacement image; frame and motion controls use a separate generation task')
    return result


def workflow(values, uploaded):
    width, height, frames = values['width'], values['height'], values['frames']
    graph = {
        'model': {'class_type': 'UNETLoader', 'inputs': {'unet_name': 'wan2.1_vace_1.3B_fp16.safetensors', 'weight_dtype': 'default'}},
        'sampling': {'class_type': 'ModelSamplingSD3', 'inputs': {'model': ['model', 0], 'shift': 8}},
        'clip': {'class_type': 'CLIPLoader', 'inputs': {'clip_name': 'umt5_xxl_fp8_e4m3fn_scaled.safetensors', 'type': 'wan', 'device': 'default'}},
        'vae': {'class_type': 'VAELoader', 'inputs': {'vae_name': 'wan_2.1_vae.safetensors'}},
        'positive': {'class_type': 'CLIPTextEncode', 'inputs': {'clip': ['clip', 0], 'text': values['prompt']}},
        'negative': {'class_type': 'CLIPTextEncode', 'inputs': {'clip': ['clip', 0], 'text': values.get('negative') or 'blurry, low quality, distorted anatomy, flicker, watermark, subtitles'}},
        'condition': {'class_type': 'WanVaceToVideo', 'inputs': {'positive': ['positive', 0], 'negative': ['negative', 0], 'vae': ['vae', 0], 'width': width, 'height': height, 'length': frames, 'batch_size': 1, 'strength': 1.0}},
        'sample': {'class_type': 'KSampler', 'inputs': {'model': ['sampling', 0], 'positive': ['condition', 0], 'negative': ['condition', 1], 'latent_image': ['condition', 2], 'seed': values['seed'], 'steps': 20, 'cfg': 6, 'sampler_name': 'uni_pc', 'scheduler': 'simple', 'denoise': 1}},
        'trim': {'class_type': 'TrimVideoLatent', 'inputs': {'samples': ['sample', 0], 'trim_amount': ['condition', 3]}},
        'decode': {'class_type': 'VAEDecode', 'inputs': {'samples': ['trim', 0], 'vae': ['vae', 0]}},
        'video': {'class_type': 'CreateVideo', 'inputs': {'images': ['decode', 0], 'fps': FPS}},
        'save': {'class_type': 'SaveVideo', 'inputs': {'video': ['video', 0], 'filename_prefix': 'video/studio_vace', 'format': 'mp4', 'codec': 'h264'}},
    }
    def add(name, kind, **inputs):
        graph[name] = {'class_type': kind, 'inputs': inputs}
        return [name, 0]

    if values.get('reference_control') == 'depth':
        # The publisher's depth V2V defaults use 50 UniPC steps, shift 16 and
        # guidance 5. Low draft settings left real depth transfers unfinished.
        graph['sampling']['inputs']['shift'] = 16
        graph['sample']['inputs'].update({'steps': 50, 'cfg': 5})

    if frames > 81:
        graph['decode'] = {'class_type': 'VAEDecodeTiled', 'inputs': {'samples': ['trim', 0], 'vae': ['vae', 0], 'tile_size': 256, 'overlap': 64, 'temporal_size': 16, 'temporal_overlap': 4}}

    if 'reference_image' in uploaded:
        graph['condition']['inputs']['reference_image'] = add('reference', 'LoadImage', image=uploaded['reference_image'])
    motion_edges = None
    source_frames, source_masks = None, None
    if 'source_video' in uploaded:
        source_video = add('source_video', 'LoadVideo', file=uploaded['source_video'])
        source_frames = add('source_frames', 'GetVideoComponents', video=source_video)
        mask_video = add('mask_video', 'LoadVideo', file=uploaded['mask_video'])
        mask_frames = add('mask_frames', 'GetVideoComponents', video=mask_video)
        source_masks = add('source_masks', 'ImageToMask', image=mask_frames, channel='red')
        graph['condition']['inputs'].update({'control_video': source_frames, 'control_masks': source_masks})
    if 'reference_video' in uploaded:
        video = add('motion_video', 'LoadVideo', file=uploaded['reference_video'])
        images = add('motion_images', 'GetVideoComponents', video=video)
        batch = add('motion_batch', 'ImageFromBatch', image=images, batch_index=0, length=frames)
        motion_edges = batch if values.get('reference_control', 'edges') == 'depth' else add('motion_edges', 'Canny', image=batch, low_threshold=.2, high_threshold=.5)
        graph['condition']['inputs']['control_video'] = motion_edges
    if 'first_frame' in uploaded or 'last_frame' in uploaded:
        middle = add('middle_frames', 'ImageFromBatch', image=motion_edges, batch_index=1, length=frames - 2) if motion_edges else add('middle_frames', 'EmptyImage', width=width, height=height, batch_size=frames - 2, color=0x808080)
        ends = {}
        masks = {}
        for role in ['first_frame', 'last_frame']:
            if role in uploaded:
                loader = add(role + '_load', 'LoadImage', image=uploaded[role])
                ends[role] = add(role + '_fit', 'ImageScale', image=loader, upscale_method='lanczos', width=width, height=height, crop='center')
            else:
                ends[role] = add(role + '_motion', 'ImageFromBatch', image=motion_edges, batch_index=0 if role == 'first_frame' else frames - 1, length=1) if motion_edges else add(role + '_empty', 'EmptyImage', width=width, height=height, batch_size=1, color=0x808080)
            mask = add(role + '_mask', 'SolidMask', value=0 if role in uploaded else 1, width=width, height=height)
            masks[role] = add(role + '_mask_image', 'MaskToImage', mask=mask)
        batch = add('start_middle', 'ImageBatch', image1=ends['first_frame'], image2=middle)
        graph['condition']['inputs']['control_video'] = add('control_frames', 'ImageBatch', image1=batch, image2=ends['last_frame'])
        white = add('white_mask', 'SolidMask', value=1, width=width, height=height)
        white_image = add('white_mask_image', 'MaskToImage', mask=white)
        middle_masks = add('middle_masks', 'RepeatImageBatch', image=white_image, amount=frames - 2)
        masks_batch = add('start_middle_masks', 'ImageBatch', image1=masks['first_frame'], image2=middle_masks)
        final_masks = add('all_mask_images', 'ImageBatch', image1=masks_batch, image2=masks['last_frame'])
        graph['condition']['inputs']['control_masks'] = add('control_masks', 'ImageToMask', image=final_masks, channel='red')

    timed = {int(key.split(':')[1]): value for key, value in uploaded.items() if key.startswith('key_frame:')}
    if timed:
        if 'first_frame' in uploaded:
            if 0 in timed: raise ValueError('First-frame and timed keyframe overlap')
            timed[0] = uploaded['first_frame']
        if 'last_frame' in uploaded:
            if frames - 1 in timed: raise ValueError('Last-frame and timed keyframe overlap')
            timed[frames - 1] = uploaded['last_frame']
        segments, masks, cursor = [], [], 0
        base = source_frames or motion_edges
        for index, name in sorted(timed.items()):
            if not 0 <= index < frames: raise ValueError('Keyframe time exceeds the generated frame range')
            count = index - cursor
            if count:
                segments.append(add(f'key_gap_{index}', 'ImageFromBatch', image=base, batch_index=cursor, length=count) if base else add(f'key_gap_{index}', 'EmptyImage', width=width, height=height, batch_size=count, color=0x808080))
                white = add(f'key_gap_mask_{index}', 'SolidMask', value=1, width=width, height=height)
                masks.append(add(f'key_gap_masks_{index}', 'RepeatImageBatch', image=add(f'key_gap_mask_image_{index}', 'MaskToImage', mask=white), amount=count))
            image = add(f'key_load_{index}', 'LoadImage', image=name)
            segments.append(add(f'key_fit_{index}', 'ImageScale', image=image, upscale_method='lanczos', width=width, height=height, crop='center'))
            black = add(f'key_mask_{index}', 'SolidMask', value=0, width=width, height=height)
            masks.append(add(f'key_mask_image_{index}', 'MaskToImage', mask=black))
            cursor = index + 1
        if cursor < frames:
            count = frames - cursor
            segments.append(add('key_tail', 'ImageFromBatch', image=base, batch_index=cursor, length=count) if base else add('key_tail', 'EmptyImage', width=width, height=height, batch_size=count, color=0x808080))
            white = add('key_tail_mask', 'SolidMask', value=1, width=width, height=height)
            masks.append(add('key_tail_masks', 'RepeatImageBatch', image=add('key_tail_mask_image', 'MaskToImage', mask=white), amount=count))
        image_batch, mask_batch = segments[0], masks[0]
        for index in range(1, len(segments)):
            image_batch = add(f'key_images_{index}', 'ImageBatch', image1=image_batch, image2=segments[index])
            mask_batch = add(f'key_masks_{index}', 'ImageBatch', image1=mask_batch, image2=masks[index])
        graph['condition']['inputs'].update({'control_video': image_batch, 'control_masks': add('key_control_masks', 'ImageToMask', image=mask_batch, channel='red')})
    return graph
