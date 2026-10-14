"""Configure this isolated local production instance for the user's local models."""
import argparse
import json
import time
from pathlib import Path
from verify_production import Client


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', required=True)
    parser.add_argument('--host', required=True)
    args = parser.parse_args()
    import ipaddress
    assert ipaddress.ip_address(args.host).is_private
    lab = Path(args.directory).resolve()
    directory = lab / 'production'
    probe = Client(directory)
    deadline = time.monotonic() + 60
    while True:
        try:
            probe.call('/status')
            break
        except Exception:
            if time.monotonic() >= deadline:
                raise
            time.sleep(.5)
    token_file = directory / 'agent-token.json'
    if token_file.exists():
        # Reuse this deployment's private management authorization on restart.
        # Repeated password login can hit the account's concurrent-login guard.
        identity = json.loads(token_file.read_text(encoding='utf-8'))
        client = Client(directory)
        client.identity = {'access_token': identity['token'], 'user': {'id': identity.get('user_id', 1)}}
        client.call('/user/self')
    else:
        client = Client(directory, json.loads((lab / 'local-account.json').read_text(encoding='utf-8')))
    from urllib.request import urlopen
    with urlopen('http://127.0.0.1:13003/v1/models', timeout=15) as response:
        installed = {item['id'] for item in json.load(response)['data']}
    local_videos = 'wan2.2-ti2v-5b' + (',wan2.1-vace-1.3b' if 'wan2.1-vace-1.3b' in installed else '')
    definitions = [
        {'name': 'Studio Local Qwen and FLUX', 'type': 1, 'models': 'qwen3.5:9b,flux.2-klein-4b', 'base_url': f'http://{args.host}:13013', 'setting': json.dumps({'pass_through_body_enabled': True})},
        {'name': 'Studio Local Wan', 'type': 61, 'models': local_videos, 'base_url': f'http://{args.host}:13013', 'setting': json.dumps({'task_plugin_key': 'local-video'})},
        {'name': 'Studio Local speech and ASR', 'type': 1, 'models': 'chatterbox-local,whisper-local', 'base_url': f'http://{args.host}:13014'},
        {'name': 'Studio Local real media', 'type': 61, 'models': 'studio-music,studio-sound-effects,studio-voice-clone,studio-voice-speech,studio-lip-sync,studio-audio-separate,studio-audio-translate,studio-image-bg-remove,studio-image-upscale,studio-image-outpaint,studio-image-layers,studio-image-grid,studio-image-to-3d,studio-video-remove,studio-video-replace,studio-video-depth', 'base_url': f'http://{args.host}:13014', 'setting': json.dumps({'task_plugin_key': 'studio-media'})},
    ]
    existing = client.call('/channel/?p=0&page_size=100')['items']
    for definition in definitions:
        old = next((channel for channel in existing if channel['name'] == definition['name']), None)
        definition.update({'group': 'default', 'status': 1, 'priority': 100, 'weight': 1, 'auto_ban': 0})
        if old:
            client.call('/channel/', 'PUT', {**{key: value for key, value in definition.items() if key != 'status'}, 'id': old['id']})
        else:
            client.call('/channel/', 'POST', {'mode': 'single', 'channel': {**definition, 'key': 'local-worker-no-auth'}})
    options = {value['key']: value['value'] for value in client.call('/option/')}
    prices = json.loads(options.get('ModelPrice', '{}'))
    for definition in definitions:
        prices.update({name: 0 for name in definition['models'].split(',')})
    client.call('/option/', 'PUT', {'key': 'ModelPrice', 'value': json.dumps(prices)})
    ports = json.loads(options.get('fetch_setting.allowed_ports', '[]'))
    for port in ['13013', '13014']:
        if port not in ports: ports.append(port)
    client.call('/option/', 'PUT', {'key': 'fetch_setting.allowed_ports', 'value': json.dumps(ports)})
    # This dedicated local deployment fetches model artifacts from one private
    # relay address. Keep SSRF protection and an exact IP allowlist enabled.
    for key, value in {'enable_ssrf_protection': 'true', 'allow_private_ip': 'true', 'ip_filter_mode': 'true', 'apply_ip_filter_for_domain': 'true', 'ip_list': json.dumps([args.host])}.items():
        client.call('/option/', 'PUT', {'key': 'fetch_setting.' + key, 'value': value})
    if not token_file.exists():
        account = json.loads((lab / 'local-account.json').read_text())
        proof = client.call('/verify', 'POST', {'scope': 'access_token.generate', 'method': 'password', 'password': account['password']})
        token = client.call('/user/token', 'POST', {}, headers={'X-Security-Proof': proof['proof_token']})
        token_file.write_text(json.dumps({'token': token, 'user_id': client.identity['user']['id']}))
    print('Four real local channels configured; local model prices are zero.')


if __name__ == '__main__':
    main()
