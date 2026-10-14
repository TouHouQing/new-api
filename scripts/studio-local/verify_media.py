"""Exercise durable media workflows against the isolated offline fixture channel."""
import argparse
import json
import time
import uuid
from pathlib import Path
from urllib.request import Request, urlopen


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', required=True)
    args = parser.parse_args()
    lab = Path(args.directory).resolve()
    token = json.loads((lab / 'agent-token.json').read_text())['token']
    assert json.load(urlopen('http://127.0.0.1:13002/__local/status'))['offline'] is True

    def api(route, method='GET', body=None):
        data = None if body is None else json.dumps(body).encode()
        request = Request('http://127.0.0.1:13000/api' + route, data=data, method=method,
                          headers={'Authorization': 'Bearer ' + token, 'New-Api-User': '1', 'Content-Type': 'application/json'})
        response = json.load(urlopen(request, timeout=30))
        assert response.get('success') is True, response.get('message')
        return response.get('data')

    source = api('/studio/cloud/projects/local-closed-loop')['document']
    project_id = 'local-media-' + uuid.uuid4().hex[:12]
    source['id'], source['title'] = project_id, 'Offline media workflows'
    source.get('production', {})['reviews'] = []
    actions = {'music': 'studio-music', 'sound_effects': 'studio-sound-effects', 'voice_clone': 'studio-voice-clone', 'voice_speech': 'studio-voice-speech', 'lip_sync': 'studio-lip-sync'}
    for index, (action, model) in enumerate(actions.items()):
        source['nodes'].append({'id': action, 'type': 'studio', 'position': {'x': index * 360, 'y': 500},
                                'data': {'kind': 'video' if action == 'lip_sync' else 'audio', 'title': action, 'model': model, 'prompt': 'Offline fixture', 'status': 'idle'}})
    api('/studio/cloud/projects/' + project_id, 'PUT', {'revision': 0, 'document': source})
    audio_id = next(n['data']['mediaId'] for n in source['nodes'] if n['data']['kind'] == 'audio' and n['data'].get('mediaId'))
    video_id = next(n['data']['mediaId'] for n in source['nodes'] if n['data']['kind'] == 'video' and n['data'].get('mediaId'))
    results = []
    voice_id = ''
    for action, model in actions.items():
        current = api('/studio/cloud/projects/' + project_id)
        refs = [audio_id] if action == 'voice_clone' else []
        if action == 'lip_sync':
            refs = [audio_id, video_id]
        operation = {'action': action, 'node_id': action, 'model': model, 'prompt': 'Offline fixture', 'seconds': 2,
                     'reference_media_ids': refs, 'confirm_voice_rights': action == 'voice_clone', 'voice_id': voice_id}
        job = api('/studio/cloud/projects/' + project_id + '/jobs', 'POST', {
            'request_id': str(uuid.uuid4()), 'revision': current['revision'], 'kind': 'media', 'budget': 1000,
            'confirm_generation': True, 'operation': operation})
        deadline = time.monotonic() + 100
        while time.monotonic() < deadline:
            job = api('/studio/cloud/jobs/' + job['id'])
            if job['status'] in ['succeeded', 'failed', 'uncertain']:
                break
            time.sleep(1)
        assert job['status'] == 'succeeded', (action, job['status'], job['error'])
        saved = api('/studio/cloud/projects/' + project_id)
        document = saved['document']
        # A generated document must pass the same boundary used by human saves.
        api('/studio/cloud/projects/' + project_id, 'PUT', {'revision': saved['revision'], 'document': document})
        node = next(n for n in document['nodes'] if n['id'] == action)
        assert node['data']['mediaId'] and node['data']['selectedTakeId']
        take = node['data']['takes'][-1]
        if action == 'voice_clone':
            voice_id = take.get('voice', '')
            assert voice_id, 'Cloned voice ID must be retained for subsequent synthesis'
        results.append({'action': action, 'job_id': job['id'], 'media_id': node['data']['mediaId'], 'task_id': take['taskId']})
        print(json.dumps({'action': action, 'status': job['status']}, ensure_ascii=False), flush=True)
    (lab / 'media-verification.json').write_text(json.dumps({'project_id': project_id, 'results': results}, indent=2))
    print('All five offline production media workflows passed.', flush=True)


if __name__ == '__main__':
    main()
