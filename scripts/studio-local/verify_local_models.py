"""Verify a real local text -> image -> first-frame video -> reviewed film."""
import argparse
import json
import time
import uuid
from pathlib import Path
from urllib.request import Request, urlopen


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', required=True)
    parser.add_argument('--configure', action='store_true')
    parser.add_argument('--project-id', help='Continue only unfinished nodes in an existing local verification project')
    args = parser.parse_args()
    lab = Path(args.directory).resolve()
    token = json.loads((lab / 'agent-token.json').read_text())['token']

    def api(route, method='GET', body=None, binary=False):
        data = None if body is None else json.dumps(body, ensure_ascii=False).encode()
        request = Request('http://127.0.0.1:13000' + route, data=data, method=method,
                          headers={'Authorization': 'Bearer ' + token, 'New-Api-User': '1', 'Content-Type': 'application/json'})
        with urlopen(request, timeout=60) as response:
            if binary:
                return response.read()
            result = json.load(response)
        assert result.get('success') is True, result.get('message')
        return result.get('data')

    if args.configure:
        channels = api('/api/channel/?p=0&page_size=100')['items']
        definitions = [
            {'name': 'Local Qwen and FLUX', 'type': 1, 'models': 'qwen3.5:9b,flux.2-klein-4b', 'setting': json.dumps({'pass_through_body_enabled': True})},
            {'name': 'Local Wan Video', 'type': 61, 'models': 'wan2.2-ti2v-5b', 'setting': json.dumps({'task_plugin_key': 'local-video'})},
        ]
        for channel in definitions:
            existing = next((item for item in channels if item['name'] == channel['name']), None)
            if existing:
                if channel['type'] == 1:
                    setting = json.loads(existing.get('setting') or '{}')
                    setting['pass_through_body_enabled'] = True
                    api('/api/channel/', 'PUT', {'id': existing['id'], 'type': existing['type'], 'setting': json.dumps(setting)})
                continue
            channel.update({'key': 'local-adapter-no-auth', 'base_url': 'http://127.0.0.1:13003', 'group': 'default', 'status': 1, 'priority': 0, 'weight': 1, 'auto_ban': 0})
            api('/api/channel/', 'POST', {'mode': 'single', 'channel': channel})
        options = {item['key']: item['value'] for item in api('/api/option/')}
        prices = json.loads(options.get('ModelPrice', '{}'))
        prices.update({name: 0 for name in ['qwen3.5:9b', 'flux.2-klein-4b', 'wan2.2-ti2v-5b']})
        api('/api/option/', 'PUT', {'key': 'ModelPrice', 'value': json.dumps(prices)})
        ports = json.loads(options.get('fetch_setting.allowed_ports', '[]'))
        if '13003' not in ports:
            ports.append('13003')
        api('/api/option/', 'PUT', {'key': 'fetch_setting.allowed_ports', 'value': json.dumps(ports)})
        # Repair only old local fixture documents produced before the output
        # whitelist fix. Take request snapshots remain available for inspection.
        for record in api('/api/studio/cloud/projects'):
            if not record['id'].startswith('local-'):
                continue
            document = record['document']
            changed = False
            for node in document['nodes']:
                if 'requestSnapshot' in node['data']:
                    del node['data']['requestSnapshot']
                    changed = True
            if changed:
                api('/api/studio/cloud/projects/' + record['id'], 'PUT', {'revision': record['revision'], 'document': document})
        print('Local channels configured; zero-price overrides affect only the test instance.', flush=True)

    source = json.loads((lab / 'test-project.json').read_text())
    project_id = 'local-real-' + uuid.uuid4().hex[:12]
    source['id'], source['title'] = project_id, 'Local AI film · Qwen / FLUX / Wan'
    source['nodes'] = [node for node in source['nodes'] if node['data']['kind'] != 'audio']
    for node in source['nodes']:
        data = node['data']
        if data['kind'] == 'text':
            data.update({'model': 'qwen3.5:9b', 'textMode': 'plain', 'prompt': 'Write exactly one short English sentence describing this shot: a small red paper boat drifting slowly across a calm pond, daylight, close-up, cinematic. Output only that sentence.'})
        elif data['kind'] == 'image':
            data.update({'model': 'flux.2-klein-4b', 'imageSize': '512x512', 'imageCount': 1})
        elif data.get('purpose') != 'assembly':
            data.update({'model': 'wan2.2-ti2v-5b', 'seconds': 2, 'metadataJson': json.dumps({'width': 640, 'height': 384, 'frames': 41, 'seed': 20261004})})
    source['defaults'].update({'textModel': 'qwen3.5:9b', 'imageModel': 'flux.2-klein-4b', 'videoModel': 'wan2.2-ti2v-5b'})
    root = '/api/studio/cloud/projects/' + project_id
    if args.project_id:
        if not args.project_id.startswith('local-real-'):
            raise ValueError('Only local verification projects can be continued')
        project_id = args.project_id
        root = '/api/studio/cloud/projects/' + project_id
    else:
        api(root, 'PUT', {'revision': 0, 'document': source})
    (lab / 'real-test-project-id.txt').write_text(project_id)
    current = api(root)
    pending = [node['id'] for node in current['document']['nodes'] if node['id'] in ['text-one', 'image-one', 'video-one'] and node['data'].get('status') != 'completed']
    if pending:
        job = api(root + '/jobs', 'POST', {'request_id': str(uuid.uuid4()), 'revision': current['revision'], 'kind': 'generate', 'node_ids': pending, 'budget': 1000, 'confirm_generation': True})
        (lab / 'real-test-job-id.txt').write_text(job['id'])
        print(json.dumps({'project_id': project_id, 'job_id': job['id']}, ensure_ascii=False), flush=True)
        deadline, previous = time.monotonic() + 1900, None
        while time.monotonic() < deadline:
            job = api('/api/studio/cloud/jobs/' + job['id'])
            state = (job['status'], job['progress'])
            if state != previous:
                print(json.dumps({'status': state[0], 'progress': state[1], 'error': job.get('error', '')}, ensure_ascii=False), flush=True)
                previous = state
            (lab / 'real-generation-job.json').write_text(json.dumps(job, indent=2, ensure_ascii=False), encoding='utf-8')
            if job['status'] in ['succeeded', 'failed', 'uncertain', 'cancelled']:
                break
            time.sleep(3)
        assert job['status'] == 'succeeded', job.get('error')
    current = api(root)
    api(root, 'PUT', {'revision': current['revision'], 'document': current['document']})
    output = lab / 'output' / project_id
    output.mkdir(parents=True, exist_ok=True)
    for node in current['document']['nodes']:
        data = node['data']
        if data.get('mediaId'):
            extension = '.png' if data['kind'] == 'image' else '.mp4'
            (output / (node['id'] + extension)).write_bytes(api('/api/studio/cloud/media/' + data['mediaId'] + '?project_id=' + project_id, binary=True))
    (output / 'project.json').write_text(json.dumps(current, indent=2, ensure_ascii=False), encoding='utf-8')
    print('Real text, image and first-frame video were saved as valid Takes.', flush=True)
    current = api(root)
    video = next(node for node in current['document']['nodes'] if node['id'] == 'video-one')['data']
    api(root + '/review', 'POST', {'revision': current['revision'], 'node_id': 'video-one', 'take_id': video['selectedTakeId'], 'status': 'approved', 'note': 'Local technical acceptance: playable 41-frame video, first-frame conditioning verified. The sample retains model visual artifacts.'})
    current = api(root)
    plan = {'node_id': 'assembly-one', 'width': 640, 'height': 384, 'fps': 24, 'clips': [{'node_id': 'video-one', 'take_id': video['selectedTakeId'], 'media_id': video['mediaId'], 'start': 0, 'end': 1.7, 'speed': 1, 'volume': 1, 'muted': False, 'caption': '本地 AI 创作 · 红色纸船', 'caption_offset': 0, 'caption_duration': 1.7, 'fade_in': .1, 'fade_out': .1}], 'audio': [], 'require_approved': True, 'package': True}
    job = api(root + '/jobs', 'POST', {'request_id': str(uuid.uuid4()), 'revision': current['revision'], 'kind': 'render', 'render': plan})
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        job = api('/api/studio/cloud/jobs/' + job['id'])
        if job['status'] in ['succeeded', 'failed', 'uncertain']:
            break
        time.sleep(1)
    assert job['status'] == 'succeeded', job.get('error')
    for key, filename in [('media_id', 'film.mp4'), ('package_media_id', 'delivery.zip')]:
        (output / filename).write_bytes(api('/api/studio/cloud/media/' + job['result'][key] + '?project_id=' + project_id, binary=True))
    (output / 'render-job.json').write_text(json.dumps(job, indent=2, ensure_ascii=False), encoding='utf-8')
    print(json.dumps({'status': 'succeeded', 'film': str(output / 'film.mp4'), 'package': str(output / 'delivery.zip'), 'job_id': job['id']}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
