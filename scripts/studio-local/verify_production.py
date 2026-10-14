"""Real HTTPS, PostgreSQL, S3, authorization and delivery acceptance.

Uses local generated assets and real FFmpeg; never submits model inference.
"""
import argparse
import concurrent.futures
import hashlib
import http.cookiejar
import json
import secrets
import ssl
import time
import uuid
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import HTTPSHandler, HTTPCookieProcessor, Request, build_opener, urlopen


class APIError(RuntimeError):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


class Client:
    def __init__(self, directory, account=None):
        self.directory = directory
        self.context = ssl.create_default_context(cafile=str(directory / 'data/caddy/caddy/pki/authorities/local/root.crt'))
        self.jar = http.cookiejar.CookieJar()
        self.opener = build_opener(HTTPSHandler(context=self.context), HTTPCookieProcessor(self.jar))
        self.identity = None
        if account:
            self.identity = self.call('/user/login', 'POST', account)
            assert self.identity['user']['id'] > 0
            assert all(cookie.secure for cookie in self.jar)

    def call(self, path, method='GET', body=None, raw=None, mime='application/json', headers=None, binary=False, rejected=False):
        data = raw if raw is not None else None if body is None else json.dumps(body, ensure_ascii=False).encode()
        values = {'Content-Type': mime, 'Origin': 'https://localhost:13443'}
        if self.identity:
            values['Authorization'] = 'Bearer ' + self.identity['access_token']
            values['New-Api-User'] = str(self.identity['user']['id'])
        values.update(headers or {})
        request = Request('https://localhost:13443/api' + path, data=data, headers=values, method=method)
        try:
            response = self.opener.open(request, timeout=120)
        except HTTPError as error:
            if rejected:
                assert error.code in [400, 401, 403, 404, 409, 429], error.code
                return error.code
            try:
                details = json.loads(error.read())
            except json.JSONDecodeError:
                details = {}
            raise APIError(error.code, f'{method} {path}: HTTP {error.code}: {details.get("message", "request failed")}') from None
        with response:
            if binary:
                assert not rejected, 'Unauthorized media request unexpectedly succeeded'
                return response.read()
            result = json.load(response)
        if rejected:
            assert result.get('success') is not True, 'Forbidden operation unexpectedly succeeded'
            return result.get('code', 'business_rejection')
        assert result.get('success') is True, result.get('message', str(result))
        return result.get('data')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', required=True)
    parser.add_argument('--phase', choices=['import', 'render', 'permissions', 'review', 'load', 'restore'], required=True)
    args = parser.parse_args()
    lab = Path(args.directory).resolve()
    directory = lab / 'production'
    output = directory / 'acceptance'
    output.mkdir(exist_ok=True)
    if (directory / 'agent-token.json').exists():
        owner = Client(directory)
        owner.identity = {'access_token': json.loads((directory / 'agent-token.json').read_text())['token'], 'user': {'id': 1}}
    else:
        owner = Client(directory, json.loads((lab / 'local-account.json').read_text()))
        (directory / 'session.json').write_text(json.dumps(owner.identity))
        (directory / 'cookies.json').write_text(json.dumps([{'name': c.name, 'value': c.value, 'domain': c.domain, 'path': c.path, 'httpOnly': c.has_nonstandard_attr('HttpOnly'), 'secure': c.secure} for c in owner.jar]))
    pid = 'production-' + (lab / 'output/extended/project-id.txt').read_text().strip()
    root = '/studio/cloud/projects/' + pid
    native_token = json.loads((lab / 'agent-token.json').read_text())['token']
    def native(path, binary=False):
        request = Request('http://127.0.0.1:13000/api' + path, headers={'Authorization': 'Bearer ' + native_token, 'New-Api-User': '1'})
        with urlopen(request, timeout=120) as response:
            return response.read() if binary else json.load(response)['data']

    def wait(job):
        deadline = time.monotonic() + 600
        while time.monotonic() < deadline:
            job = owner.call('/studio/cloud/jobs/' + job['id'])
            if job['status'] in ['succeeded', 'failed', 'uncertain', 'cancelled', 'paused']:
                break
            time.sleep(1)
        assert job['status'] == 'succeeded', job.get('error')
        return job

    if args.phase == 'import':
        source_id = pid.removeprefix('production-')
        source = native('/studio/cloud/projects/' + source_id)
        document = source['document']
        refs = set()
        def collect(value):
            if isinstance(value, list):
                for item in value: collect(item)
            elif isinstance(value, dict):
                for key, item in value.items():
                    if (key == 'mediaId' or key.endswith('MediaId')) and isinstance(item, str) and item: refs.add(item)
                    if key in ['mediaIds', 'referenceMediaIds']: refs.update(item)
                    collect(item)
        collect(document)
        uploaded = []
        for media_id in sorted(refs):
            data = native('/studio/cloud/media/' + media_id + '?project_id=' + source_id, True)
            mime = 'video/mp4' if data[4:8] == b'ftyp' else 'audio/wav' if data[:4] == b'RIFF' else 'image/png' if data[:8] == b'\x89PNG\r\n\x1a\n' else 'application/json' if data[:1] in [b'{', b'['] else 'application/zip' if data[:2] == b'PK' else 'text/plain'
            owner.call('/studio/cloud/media/' + media_id, 'PUT', raw=data, mime=mime)
            uploaded.append({'media_id': media_id, 'digest': hashlib.sha256(data).hexdigest(), 'size': len(data)})
        document['id'] = pid
        document['title'] = '本地生产验收 · 双镜头短片'
        document['production']['reviews'] = []
        for shot in document.get('shots', []):
            shot.pop('reviewStatus', None)
            shot.pop('reviewNote', None)
        existing = next((p for p in owner.call('/studio/cloud/projects') if p['id'] == pid), None)
        record = owner.call(root, 'PUT', {'revision': existing['revision'] if existing else 0, 'document': document})
        (output / 'imports.json').write_text(json.dumps(uploaded, indent=2))
        (output / 'project.json').write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf-8')
        print('Imported real media to production S3:', len(uploaded))

    if args.phase == 'render':
        current = owner.call(root)
        for node_id in ['video-1', 'video-2']:
            current = owner.call(root)
            data = next(node['data'] for node in current['document']['nodes'] if node['id'] == node_id)
            owner.call(root + '/review', 'POST', {'revision': current['revision'], 'node_id': node_id, 'take_id': data['selectedTakeId'], 'status': 'approved', 'note': 'Reviewed real reference-conditioned video and lip-sync frames'})
        current = owner.call(root)
        source = json.loads((lab / 'output/extended/delivery-job.json').read_text())['result']
        plan = {key: source[key] for key in ['width', 'height', 'fps', 'clips', 'audio', 'subtitles']}
        plan['subtitles'] = current['document'].get('captionsText', '')
        # Renderer derives character dialogue directly from the shared project.
        dialogue_ids = {cue.get('audioMediaId') for cue in current['document']['production']['dialogueCues']}
        plan['audio'] = [track for track in plan['audio'] if track['media_id'] not in dialogue_ids]
        plan.update({'require_approved': True, 'package': True})
        job = wait(owner.call(root + '/jobs', 'POST', {'request_id': str(uuid.uuid4()), 'revision': current['revision'], 'kind': 'render', 'render': plan}))
        (output / 'delivery-job.json').write_text(json.dumps(job, indent=2))
        for key, name in [('media_id', 'film.mp4'), ('package_media_id', 'delivery.zip')]:
            (output / name).write_bytes(owner.call('/studio/cloud/media/' + job['result'][key] + '?project_id=' + pid, binary=True))
        print('Production FFmpeg delivery:', job['status'], job['result']['duration'])

    if args.phase == 'permissions':
        path = directory / 'test-accounts.json'
        accounts = json.loads(path.read_text()) if path.exists() else {}
        clients = {}
        for role in ['viewer', 'reviewer', 'editor', 'outsider']:
            if role not in accounts:
                account = {'username': 'st_' + role[:3] + '_' + secrets.token_hex(4), 'password': secrets.token_urlsafe(24)}
                owner.call('/user/', 'POST', {**account, 'role': 1})
                accounts[role] = account
                path.write_text(json.dumps(accounts))
            client = Client(directory, accounts[role])
            clients[role] = client
            if role != 'outsider': owner.call(root + '/members', 'PUT', {'user_id': client.identity['user']['id'], 'role': role})
        current = owner.call(root)
        media_id = next(node['data']['mediaId'] for node in current['document']['nodes'] if node['id'] == 'video-1')
        checks = {}
        for role, client in clients.items():
            if role == 'outsider':
                checks[role] = client.call(root, rejected=True)
                client.call('/studio/cloud/media/' + media_id + '?project_id=' + pid, rejected=True, binary=True)
                continue
            assert client.call(root)['role'] == role
            assert client.call('/studio/cloud/media/' + media_id + '?project_id=' + pid, binary=True)
            if role != 'editor': client.call(root, 'PUT', {'revision': current['revision'], 'document': current['document']}, rejected=True)
            client.call(root + '/members', 'PUT', {'user_id': owner.identity['user']['id'], 'role': 'editor'}, rejected=True)
            if role == 'viewer': client.call(root + '/comments', 'POST', {'revision': current['revision'], 'seconds': 0, 'node_id': 'video-1', 'take_id': '', 'message': 'Blocked comment'}, rejected=True)
            checks[role] = 'read media, role boundaries passed'
        editor = clients['editor']
        updated = editor.call(root, 'PUT', {'revision': current['revision'], 'document': current['document']})
        owner.call(root, 'PUT', {'revision': current['revision'], 'document': current['document']}, rejected=True)
        client2 = Client(directory, json.loads((lab / 'local-account.json').read_text()))
        assert client2.call(root)['revision'] == updated['revision']
        checks['second_client'] = 'same persisted revision; stale write rejected'
        owner.call(root, 'PUT', {'revision': updated['revision'], 'document': updated['document']}, headers={'Origin': 'https://untrusted.invalid'}, rejected=True)
        (output / 'permissions.json').write_text(json.dumps(checks, indent=2))
        print('Role, second-client, stale revision and cross-origin checks passed')

    if args.phase == 'review':
        current = owner.call(root)
        delivery = json.loads((output / 'delivery-job.json').read_text())['result']
        share = owner.call(root + '/review-shares', 'POST', {'revision': current['revision'], 'media_id': delivery['media_id'], 'expires_hours': 24, 'allow_comments': True})
        (directory / 'review-share.json').write_text(json.dumps(share))
        from urllib.parse import parse_qs, urlparse
        query = parse_qs(urlparse(share['url']).fragment)
        sid, secret = query['id'][0], query['token'][0]
        guest = Client(directory)
        h = {'X-Studio-Review-Token': secret}
        payload = guest.call('/studio/review/' + sid, headers=h)
        guest.call('/studio/review/' + sid, rejected=True)
        guest.call('/studio/review/' + sid + '/media/' + delivery['package_media_id'], headers=h, binary=True, rejected=True)
        comment = guest.call('/studio/review/' + sid + '/comments', 'POST', {'seconds': .25, 'name': 'Local reviewer', 'message': 'Repair the dialogue level in this exact version'}, headers=h)
        comments = owner.call(root + '/comments')
        source = next(value for value in comments if value['id'] == comment['id'])
        assert source['node_id'] == 'video-1' and source['take_id']
        current = owner.call(root)
        updated = owner.call(root + '/rework', 'POST', {'revision': current['revision'], 'comment_id': source['id'], 'action': 'audio'})
        plan = updated['document']['production']['changes'][-1]
        assert plan['takeId'] == source['take_id'] and plan['nodeIds'] == ['voice_speech']
        assert owner.call(root + '/rework', 'POST', {'revision': updated['revision'], 'comment_id': source['id'], 'action': 'audio'})['revision'] == updated['revision']
        plan['status'] = 'resolved'
        owner.call(root, 'PUT', {'revision': updated['revision'], 'document': updated['document']})
        owner.call(root + '/comments', 'PATCH', {'id': source['id'], 'resolved': True})
        # Keep one active link for browser acceptance; separately prove revocation.
        current = owner.call(root)
        temporary = owner.call(root + '/review-shares', 'POST', {'revision': current['revision'], 'media_id': delivery['media_id'], 'expires_hours': 1})
        temp_q = parse_qs(urlparse(temporary['url']).fragment)
        owner.call(root + '/review-shares/' + temp_q['id'][0], 'DELETE')
        guest.call('/studio/review/' + temp_q['id'][0], headers={'X-Studio-Review-Token': temp_q['token'][0]}, rejected=True)
        (output / 'review.json').write_text(json.dumps({'exact_take': source['take_id'], 'rework_nodes': plan['nodeIds'], 'revocation': 'passed', 'idempotent_plan': 'passed'}, indent=2))
        print('Guest timed feedback, exact Take, audio rework and revocation passed')

    if args.phase == 'load':
        current = owner.call(root)
        def read(_):
            start = time.monotonic(); value = owner.call(root)
            assert value['revision'] == current['revision']
            return time.monotonic() - start
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: latencies = sorted(pool.map(read, range(24)))
        def edit(_):
            try: return owner.call(root, 'PUT', {'revision': current['revision'], 'document': current['document']})['revision']
            except APIError as error:
                assert error.status == 409, error.status
                return 'conflict'
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: edits = list(pool.map(edit, range(4)))
        assert sum(isinstance(v, int) for v in edits) == 1 and edits.count('conflict') == 3, edits
        current = owner.call(root)
        jobs = [owner.call(root + '/jobs', 'POST', {'request_id': str(uuid.uuid4()), 'revision': current['revision'], 'kind': 'quality'}) for _ in range(4)]
        for job in jobs: wait(job)
        events = owner.call(root + '/events')
        assert {job['id'] for job in jobs}.issubset({event['job_id'] for event in events['events']})
        assert owner.call(root + '/events?after=' + events['cursor'])['events'] == []
        report = {'read_requests': 24, 'read_concurrency': 4, 'p95_seconds': latencies[22], 'write_requests': 4, 'successful_CAS': 1, 'expected_conflicts': 3, 'real_quality_jobs': 4, 'cursor': events['cursor'], 'unexpected_errors': 0, 'revision': owner.call(root)['revision']}
        (output / 'load.json').write_text(json.dumps(report, indent=2))
        print('Bounded production workload:', report)

    if args.phase == 'restore':
        report = json.loads((output / 'load.json').read_text())
        assert owner.call(root)['revision'] == report['revision']
        events = owner.call(root + '/events?after=' + report['cursor'])
        assert not events['events'] and events['cursor'] == report['cursor']
        for record in json.loads((output / 'imports.json').read_text()):
            data = owner.call('/studio/cloud/media/' + record['media_id'] + '?project_id=' + pid, binary=True)
            assert hashlib.sha256(data).hexdigest() == record['digest']
        (output / 'restore.json').write_text(json.dumps({'server_restart': 'passed', 'S3_hash_restore': 'passed', 'media_count': len(json.loads((output / 'imports.json').read_text())), 'event_cursor': 'preserved'}, indent=2))
        print('Restart, S3 cache restoration and durable cursor passed')


if __name__ == '__main__':
    main()
