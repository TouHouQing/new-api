"""Resumable real-model acceptance for Studio's extended production workflow."""
import argparse
import hashlib
import json
import time
import uuid
from pathlib import Path
from urllib.request import Request, urlopen


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', required=True)
    parser.add_argument('--phase', choices=['prepare', 'generate', 'media', 'delivery'], required=True)
    args = parser.parse_args()
    lab = Path(args.directory).resolve()
    output = lab / 'output' / 'extended'
    output.mkdir(parents=True, exist_ok=True)
    token = json.loads((lab / 'agent-token.json').read_text())['token']

    def api(path, method='GET', body=None, raw=None, content_type='application/json', binary=False):
        data = raw if raw is not None else None if body is None else json.dumps(body, ensure_ascii=False).encode()
        request = Request('http://127.0.0.1:13000/api' + path, data=data, method=method, headers={'Authorization': 'Bearer ' + token, 'New-Api-User': '1', 'Content-Type': content_type})
        with urlopen(request, timeout=60) as response:
            if binary:
                return response.read()
            value = json.load(response)
        assert value.get('success') is True, value.get('message')
        return value.get('data')

    def wait(job):
        previous = None
        deadline = time.monotonic() + 1800
        while time.monotonic() < deadline:
            job = api('/studio/cloud/jobs/' + job['id'])
            state = (job['status'], job['progress'])
            if state != previous:
                print(job['kind'], state, job.get('error', ''), flush=True)
                previous = state
            if job['status'] in ['succeeded', 'failed', 'uncertain', 'cancelled', 'paused']:
                break
            time.sleep(2)
        assert job['status'] == 'succeeded', job.get('error')
        return job

    project_file = output / 'project-id.txt'
    if args.phase == 'prepare':
        if project_file.exists():
            print('Prepared project already exists:', project_file.read_text())
            return
        project_id = 'extended-film-' + uuid.uuid4().hex[:12]
        now = '2026-10-04T06:00:00Z'
        portrait = (lab / 'output' / 'character-portrait.png').read_bytes()
        speech = (lab / 'output' / 'real-speech.wav').read_bytes()
        portrait_id = 'portrait-' + hashlib.sha256(portrait).hexdigest()[:20]
        speech_id = 'speech-' + hashlib.sha256(speech).hexdigest()[:20]
        for media_id, content, mime in [(portrait_id, portrait, 'image/png'), (speech_id, speech, 'audio/wav')]:
            api('/studio/cloud/media/' + media_id, 'PUT', raw=content, content_type=mime)

        def node(node_id, kind, model, prompt='', **data):
            return {'id': node_id, 'type': 'studio', 'position': {'x': len(nodes) * 200, 'y': 0}, 'data': {'kind': kind, 'title': node_id, 'model': model, 'prompt': prompt, 'status': 'idle', **data}}

        nodes = []
        take = {'id': 'portrait-version', 'prompt': 'Character reference', 'createdAt': now, 'status': 'completed', 'mediaId': portrait_id}
        nodes.append(node('hero-reference', 'image', 'flux.2-klein-4b', 'A woman in a blue jacket and red scarf', purpose='character', linkedAssetId='hero', mediaId=portrait_id, status='completed', takes=[take], selectedTakeId=take['id']))
        nodes.append(node('speech-reference', 'audio', 'chatterbox-local', mediaId=speech_id, status='completed'))
        shots, edges = [], []
        for index, action in [(1, 'The same woman faces the camera and smiles gently'), (2, 'The same woman holds a small red box, still facing the camera')]:
            text_id, image_id, video_id = f'text-{index}', f'image-{index}', f'video-{index}'
            nodes.append(node(text_id, 'text', 'qwen3.5:9b', action, textMode='plain', status='completed', outputText=action, outputImagePrompt=action + ', cinematic frontal medium close-up, clear mouth, daylight, plain background, preserve her face, short dark bob haircut, blue jacket and red scarf', outputVideoPrompt=action + ', minimal natural motion, locked camera, keep the face visible and identical'))
            nodes.append(node(image_id, 'image', 'flux.2-klein-4b', assetIds=['hero'], imageSize='512x512', metadataJson=json.dumps({'seed': index})))
            nodes.append(node(video_id, 'video', 'wan2.2-ti2v-5b', seconds=2, assetIds=['hero'], metadataJson=json.dumps({'width': 512, 'height': 512, 'frames': 41, 'seed': index}), payloadPatchJson=json.dumps({'size': '512x512'})))
            edges.extend([{'id': f'text-image-{index}', 'source': text_id, 'target': image_id}, {'id': f'text-video-{index}', 'source': text_id, 'target': video_id}, {'id': f'image-video-{index}', 'source': image_id, 'target': video_id, 'targetHandle': 'first_frame'}])
            shots.append({'id': f'shot-{index}', 'title': f'Shot {index}', 'textNodeId': text_id, 'imageNodeId': image_id, 'videoNodeId': video_id, 'dialogue': 'Hello.' if index == 1 else 'Welcome.', 'camera': 'Frontal medium close-up, locked camera'})
        for action in ['music', 'sound_effects', 'voice_clone', 'voice_speech']:
            nodes.append(node(action, 'audio', {'music': 'studio-music', 'sound_effects': 'studio-sound-effects', 'voice_clone': 'studio-voice-clone', 'voice_speech': 'chatterbox-local'}[action]))
        project = {'id': project_id, 'title': 'Studio · 完整闭环验收', 'nodes': nodes, 'edges': edges, 'shots': shots, 'assets': [{'id': 'hero', 'kind': 'character', 'title': 'Mira', 'prompt': 'Adult woman, short dark bob, brown eyes, blue jacket, red scarf', 'profile': {'wardrobe': 'Blue jacket, red scarf'}, 'mediaId': portrait_id, 'versions': [{'id': 'portrait-version', 'createdAt': now, 'prompt': 'Character reference', 'mediaId': portrait_id}]}], 'production': {'width': 512, 'height': 512, 'fps': 24, 'requireApproved': True, 'continuityStates': [{'shotId': f'shot-{index}', 'assetId': 'hero', 'versionId': 'portrait-version', 'wardrobe': 'Blue jacket and red scarf', 'emotion': 'Calm', 'propState': 'Red box' if index == 2 else '', 'note': 'Maintain identity'} for index in [1, 2]], 'dialogueCues': [{'id': 'dialogue-1', 'shotId': 'shot-1', 'characterId': 'hero', 'text': 'Hello.', 'offset': 0}], 'scenes': [{'id': 'scene', 'title': 'Studio', 'description': 'Soft daylight, neutral background', 'shotIds': ['shot-1', 'shot-2'], 'assetIds': ['hero']}]}, 'createdAt': now, 'updatedAt': now}
        api('/studio/cloud/projects/' + project_id, 'PUT', {'revision': 0, 'document': project})
        project_file.write_text(project_id)
        print('Prepared real acceptance project:', project_id, flush=True)
        return

    project_id = project_file.read_text().strip()
    root = '/studio/cloud/projects/' + project_id
    if args.phase == 'generate':
        job_file = output / 'generation-job.json'
        if job_file.exists():
            job = json.loads(job_file.read_text())
        else:
            current = api(root)
            job = api(root + '/jobs', 'POST', {'request_id': str(uuid.uuid4()), 'revision': current['revision'], 'kind': 'generate', 'node_ids': ['video-1', 'video-2'], 'budget': 100000, 'confirm_generation': True})
            job_file.write_text(json.dumps(job))
        job = wait(job)
        job_file.write_text(json.dumps(job, indent=2))

    if args.phase == 'media':
        voice_id = ''
        for action, prompt in [('music', 'gentle piano, warm cinematic instrumental'), ('sound_effects', 'soft environmental rain ambience, no voice, no music'), ('voice_clone', 'Hello.'), ('voice_speech', 'Hello.'), ('lip_sync', '')]:
            current = api(root)
            source = current['document']
            nodes = {node['id']: node['data'] for node in source['nodes']}
            source_audio = nodes['speech-reference']['mediaId']
            source_video = nodes['video-1']['mediaId']
            references = [source_audio] if action == 'voice_clone' else []
            if action == 'lip_sync':
                references = [nodes['voice_speech']['mediaId'], source_video]
            target = 'video-1' if action == 'lip_sync' else action
            model = {'music': 'studio-music', 'sound_effects': 'studio-sound-effects', 'voice_clone': 'studio-voice-clone', 'voice_speech': 'studio-voice-speech', 'lip_sync': 'studio-lip-sync'}[action]
            job_file = output / (action + '-job.json')
            if job_file.exists():
                job = json.loads(job_file.read_text())
            else:
                operation = {'action': action, 'node_id': target, 'model': model, 'prompt': prompt, 'seconds': 3, 'reference_media_ids': references, 'voice_id': voice_id, 'confirm_voice_rights': action == 'voice_clone'}
                if action == 'voice_speech':
                    operation['dialogue_cue_id'] = 'dialogue-1'
                job = api(root + '/jobs', 'POST', {'request_id': str(uuid.uuid4()), 'revision': current['revision'], 'kind': 'media', 'budget': 100000, 'confirm_generation': True, 'operation': operation})
                job_file.write_text(json.dumps(job))
            job = wait(job)
            job_file.write_text(json.dumps(job, indent=2))
            current = api(root)
            node = next(node for node in current['document']['nodes'] if node['id'] == target)
            if action == 'voice_clone':
                voice_id = node['data']['takes'][-1].get('voice', '')
                assert voice_id, 'Cloned voice ID must be retained'
            mime = '.mp4' if action == 'lip_sync' else '.wav'
            (output / (action + mime)).write_bytes(api('/studio/cloud/media/' + node['data']['mediaId'] + '?project_id=' + project_id, binary=True))
        current = api(root)
        current = api(root + '/dialogue/align', 'POST', {'revision': current['revision']})
        (output / 'aligned-project.json').write_text(json.dumps(current, ensure_ascii=False, indent=2), encoding='utf-8')
        speech = next(node['data']['mediaId'] for node in current['document']['nodes'] if node['id'] == 'voice_speech')
        job_file = output / 'asr-job.json'
        if job_file.exists():
            job = json.loads(job_file.read_text())
        else:
            job = api(root + '/jobs', 'POST', {'request_id': str(uuid.uuid4()), 'revision': current['revision'], 'kind': 'transcribe', 'budget': 100000, 'confirm_generation': True, 'operation': {'media_id': speech, 'model': 'whisper-local', 'language': 'en'}})
            job_file.write_text(json.dumps(job))
        job = wait(job)
        job_file.write_text(json.dumps(job, indent=2))

    if args.phase == 'delivery':
        current = api(root)
        document = current['document']
        production = document['production']
        music = next(node['data']['mediaId'] for node in document['nodes'] if node['id'] == 'music')
        effects = next(node['data']['mediaId'] for node in document['nodes'] if node['id'] == 'sound_effects')
        cloned = next(node['data']['takes'][-1]['voice'] for node in document['nodes'] if node['id'] == 'voice_clone')
        production['audioTracks'] = [{'id': 'music-track', 'mediaId': music, 'start': 0, 'offset': 0, 'volume': .15}, {'id': 'effects-track', 'mediaId': effects, 'start': 0, 'offset': 1, 'volume': .08}]
        production['voiceBindings'] = {'hero': {'voiceId': cloned, 'model': 'studio-voice-speech'}}
        current = api(root, 'PUT', {'revision': current['revision'], 'document': document})
        for node_id in ['video-1', 'video-2']:
            current = api(root)
            video = next(node['data'] for node in current['document']['nodes'] if node['id'] == node_id)
            api(root + '/review', 'POST', {'revision': current['revision'], 'node_id': node_id, 'take_id': video['selectedTakeId'], 'status': 'approved', 'note': 'Local technical and visual review of the exact generated Take'})
        current = api(root)
        clips = []
        for clip in current['document']['production']['timeline']:
            data = next(node['data'] for node in current['document']['nodes'] if node['id'] == clip['nodeId'])
            clips.append({'node_id': clip['nodeId'], 'take_id': data['selectedTakeId'], 'media_id': data['mediaId'], 'start': clip.get('trimStart', 0), 'end': clip.get('trimEnd'), 'speed': clip.get('speed', 1), 'volume': 1, 'muted': False, 'caption': '', 'caption_offset': 0, 'caption_duration': 0, 'fade_in': 0, 'fade_out': 0})
        tracks = [{'media_id': track['mediaId'], 'start': track['start'], 'offset': track['offset'], 'volume': track['volume']} for track in current['document']['production']['audioTracks']]
        plan = {'width': 512, 'height': 512, 'fps': 24, 'clips': clips, 'audio': tracks, 'require_approved': True, 'package': True, 'subtitles': current['document'].get('captionsText', '')}
        job_file = output / 'delivery-job.json'
        if job_file.exists():
            job = json.loads(job_file.read_text())
        else:
            job = api(root + '/jobs', 'POST', {'request_id': str(uuid.uuid4()), 'revision': current['revision'], 'kind': 'render', 'render': plan})
            job_file.write_text(json.dumps(job))
        job = wait(job)
        job_file.write_text(json.dumps(job, indent=2))
        for key, filename in [('media_id', 'film.mp4'), ('package_media_id', 'delivery.zip')]:
            (output / filename).write_bytes(api('/studio/cloud/media/' + job['result'][key] + '?project_id=' + project_id, binary=True))
    current = api(root)
    (output / 'project.json').write_text(json.dumps(current, ensure_ascii=False, indent=2), encoding='utf-8')
    for node in current['document']['nodes']:
        data = node['data']
        if data.get('mediaId') and data['kind'] in ['image', 'video']:
            suffix = '.png' if data['kind'] == 'image' else '.mp4'
            (output / (node['id'] + suffix)).write_bytes(api('/studio/cloud/media/' + data['mediaId'] + '?project_id=' + project_id, binary=True))
    print('Phase passed:', args.phase, flush=True)


if __name__ == '__main__':
    main()
