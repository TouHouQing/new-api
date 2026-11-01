"""Read-only runtime and workflow checks. Never queues inference or frees models."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from studio_text_limits import MAX_TEXT_CONTEXT, MAX_TEXT_OUTPUT


def reviewed_evidence(directory, model_id, action, configuration_digest):
    """Operator-owned reviews must match both the workflow and immutable bytes."""
    root = Path(directory).resolve() / 'capability-evidence'
    try:
        raw = (root / 'reviews.json').read_bytes()
        if len(raw) > 1024 * 1024:
            return []
        reviews = json.loads(raw)
        if not isinstance(reviews, list) or len(reviews) > 500:
            return []
    except (OSError, ValueError):
        return []
    result = []
    for review in reviews:
        if not isinstance(review, dict) or review.get('modelId') != model_id or review.get('action') != action or review.get('configurationDigest') != configuration_digest:
            continue
        try:
            path = (root / review['filename']).resolve(strict=True)
            if not path.is_relative_to(root) or not path.is_file() or path.stat().st_size > 256 * 1024 * 1024:
                continue
            with path.open('rb') as source:
                digest = hashlib.file_digest(source, 'sha256').hexdigest()
            if digest != review['sha256'] or review.get('outcome') not in ('passed', 'failed', 'blocked'):
                continue
            if not review.get('artifactUrl', '').startswith(('/studio-presets/', '/studio-examples/')) or not review.get('scope') or not review.get('id'):
                continue
            datetime.fromisoformat(review['testedAt'].replace('Z', '+00:00'))
            result.append({key: review[key] for key in ('id', 'modelId', 'action', 'configurationDigest', 'outcome', 'testedAt', 'artifactUrl', 'scope')})
        except (OSError, ValueError, KeyError, TypeError):
            continue
    return result


def capability_profiles(models):
    now = datetime.now(timezone.utc).isoformat()
    try:
        info = models.http_json(models.args.comfy + '/object_info', timeout=10)
        system = models.http_json(models.args.comfy + '/system_stats', timeout=5)
        comfy = bool(system.get('devices'))
    except Exception:
        info, comfy = {}, False
    try:
        import urllib.request
        with urllib.request.urlopen('http://127.0.0.1:11434/api/tags', timeout=5) as response:
            installed_text = {item['name'] for item in json.load(response).get('models', [])}
    except Exception:
        installed_text = set()
    profiles = []
    for family, names in models.models.items():
        for model_id in names:
            actions = ['text', 'vision_analysis'] if family == 'text' else [family]
            graph, missing = {}, []
            limits = {'minReferences': 0, 'notes': ['Readiness checks configured nodes and weight names; image/video quality requires separate output review.']}
            if family == 'text':
                ready = model_id in installed_text
                try:
                    details = models.http_json('http://127.0.0.1:11434/api/show', {'model':model_id}, timeout=5) if ready else {}
                    capabilities = details.get('capabilities', [])
                    windows = [value for key, value in details.get('model_info', {}).items() if key.endswith('.context_length') and isinstance(value, int) and not isinstance(value, bool) and value >= 4096]
                    if windows:
                        limits['contextWindowTokens'] = min(MAX_TEXT_CONTEXT, min(windows))
                        limits['maxOutputTokens'] = min(MAX_TEXT_OUTPUT, limits['contextWindowTokens'] // 4)
                    vision_support = 'supported' if 'vision' in capabilities else 'unsupported' if ready else 'unknown'
                except Exception:
                    vision_support = 'unknown'
                limits['maxReferences'] = 8 if vision_support == 'supported' else 0
            else:
                try:
                    if model_id == 'wan2.1-vace-1.3b':
                        import studio_vace
                        graph = models.configure_text_encoders(studio_vace.workflow({'prompt': '', 'negative': '', 'width':384, 'height':224, 'frames':17, 'seed':1, 'fps':16}, {}))
                        limits.update({'maxReferences': 3, 'minSeconds': 1, 'maxSeconds': 30, 'resolutions': [{'width': w, 'height': h} for w, h in [(640,384),(384,640),(640,480),(480,640),(512,512),(384,224),(224,384)]], 'notes': ['Use explicit VACE image/video/mask roles. Long shots require 384×224 or 224×384. Native audio is not supported.']})
                    else:
                        graph = models.workflow(family, {'prompt':'', 'width':640 if family == 'video' else 512, 'height':384 if family == 'video' else 512, 'frames':41, 'seed':1})
                        limits['maxReferences'] = 1 if family == 'video' else 12
                        if family == 'video':
                            limits.update({'minSeconds':1, 'maxSeconds':10, 'resolutions':[{'width':w,'height':h} for w,h in [(640,384),(384,640),(512,512)]], 'notes':['Only one first-frame reference is supported. Video/audio references, tail frames and native generated audio are not supported. Frames must be 4n+1, up to 241. Low-resolution trials are disabled after observed corrupted output; use a shorter clip at the verified frame size.']})
                            limits['notes'].append('Decode policy v2: full VAE for 640x384 at 17 frames; other configurations retain the configured tiled/full strategy. Quality reviews must match this policy fingerprint.')
                    for node in graph.values():
                        kind = node['class_type']
                        if kind not in info:
                            missing.append('node:' + kind)
                            continue
                        required = info[kind].get('input', {}).get('required', {})
                        for key, value in node.get('inputs', {}).items():
                            descriptor = required.get(key)
                            if key.endswith(('_name','_name1','_name2')) and isinstance(value, str) and isinstance(descriptor, list) and descriptor and isinstance(descriptor[0], list) and value not in descriptor[0]:
                                missing.append('weight:' + value)
                    if family == 'image' and 'ReferenceLatent' not in info:
                        limits['maxReferences'] = 0
                        limits['notes'].append('ReferenceLatent is missing; reference-conditioned images are unavailable.')
                except Exception:
                    missing.append('workflow_unavailable')
                ready = comfy and bool(graph) and not missing
            fingerprint = hashlib.sha256(json.dumps({'model':model_id,'graph':graph,'constraints':limits},sort_keys=True).encode()).hexdigest()
            for action in actions:
                support = vision_support if action == 'vision_analysis' else 'supported'
                profiles.append({'modelId':model_id,'action':action,'support':support,'readiness':'ready' if ready and support == 'supported' else 'unavailable','checkedAt':now,'configurationDigest':fingerprint,'constraints':limits,'diagnostics':missing,'evidence':reviewed_evidence(models.args.directory, model_id, action, fingerprint)})
            if family == 'video':
                profiles.append({'modelId':model_id,'action':'native_audio_video','support':'unsupported','readiness':'unavailable','checkedAt':now,'configurationDigest':fingerprint,'constraints':{'notes':['This workflow generates silent video. Separate speech or lip-sync does not constitute native audiovisual generation.']},'evidence':[]})
    return {'profiles':profiles,'checkedAt':now,'inferenceStarted':False}
