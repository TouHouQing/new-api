# SPDX-License-Identifier: AGPL-3.0-or-later
"""Offline MuseTalk rendering of a selected interval or an explicitly held photo."""
import argparse,hashlib,json,math,os,subprocess
from pathlib import Path
from lip_sync_contract import LipSyncRequest,decode_media,WEIGHTS,MODEL_SHA256
from musetalk_inference import synchronize

def read_lip_sync_input(raw):
    if len(raw)>46*1024*1024:raise ValueError('Lip-sync input exceeds its bounded limit')
    value=json.loads(raw)
    if not isinstance(value,dict):raise ValueError('Lip-sync input must be an object')
    if 'version' in value:
        version=value.pop('version')
        if type(version) is not int or version!=1:raise ValueError('Unsupported persisted lip-sync input envelope')
    return LipSyncRequest.model_validate(value)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--input',required=True,type=Path);parser.add_argument('--model',required=True,type=Path);parser.add_argument('--ffmpeg',required=True,type=Path);args=parser.parse_args()
    source_body=args.input.read_bytes()
    request=read_lip_sync_input(source_body);directory=args.input.parent;selection=request.selection;seconds=(selection.end_ms-selection.start_ms)/1000
    for name,digest in WEIGHTS.items():
        with (args.model/'models'/name).open('rb') as stream:
            if hashlib.file_digest(stream,'sha256').hexdigest()!=digest:raise ValueError('Installed lip-sync weights changed; no new weights downloaded')
    source=directory/'source.bin';audio=directory/'dialogue.bin';source.write_bytes(decode_media(request.source,request.source_kind));audio.write_bytes(decode_media(request.audio,'audio'))
    probe=args.ffmpeg.with_name('ffprobe'+args.ffmpeg.suffix)
    def metadata(path):return json.loads(subprocess.check_output([str(probe),'-v','error','-show_streams','-show_format','-of','json',str(path)],timeout=30))
    meta=metadata(source);stream=next((item for item in meta['streams'] if item['codec_type']=='video'),None)
    if not stream or not 48<=int(stream['width'])<=1280 or not 48<=int(stream['height'])<=1280 or int(stream['width'])%2 or int(stream['height'])%2:raise ValueError('Use an even-sized, 48–1280 pixel source; resize a copy first')
    fps=24 if request.source_kind=='image' else float(__import__('fractions').Fraction(stream['avg_frame_rate']))
    if not math.isfinite(fps) or not 1<=fps<=60 or abs(fps-round(fps))>.001:raise ValueError('Use a source with a constant whole-number frame rate from 1–60 fps')
    if request.source_kind=='video':
        nominal=float(__import__('fractions').Fraction(stream.get('r_frame_rate','0/1')))
        rotation=float((stream.get('tags') or {}).get('rotate',0))
        for side in stream.get('side_data_list',[]):
            if 'rotation' in side:rotation=float(side['rotation'])
        if abs(nominal-fps)>.001 or abs(rotation)%360>.001:raise ValueError('Normalize a copy of rotated or variable-frame-rate video before selecting its face region')
    if math.ceil(seconds*fps)*int(stream['width'])*int(stream['height'])>128000000:raise ValueError('Selected interval is too large for local processing; shorten it or resize a copy')
    if request.source_kind=='image':
        video=directory/'photo-source.mp4'
        subprocess.run([str(args.ffmpeg),'-nostdin','-y','-v','error','-loop','1','-framerate','24','-i',str(source),'-t',str(seconds),'-an','-c:v','libx264','-pix_fmt','yuv420p',str(video)],check=True,timeout=120)
    else:video=source
    region=selection.region;edit={'start':selection.start_ms/1000,'end':selection.end_ms/1000,**(region.model_dump() if region else {})}
    output=directory/'output.mp4';synchronize(args.model,video,audio,output,str(args.ffmpeg),seconds=seconds,edit=edit,audio_start=selection.audio_start_ms/1000)
    timing=json.loads((directory/'lip-timing.json').read_text());result={'version':1,'model':'musetalk-1.5','model_sha256':MODEL_SHA256,'source_kind':request.source_kind,'source_sha256':request.source_sha256,'audio_sha256':request.audio_sha256,'selection':selection.model_dump(),'timing':timing,'bytes':output.stat().st_size,'sha256':hashlib.file_digest(output.open('rb'),'sha256').hexdigest(),'outputPolicy':'selected-interval-new-candidate','creativeQualityAccepted':False}
    partial=directory/'result.part.json';partial.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');os.replace(partial,directory/'result.json')

if __name__=='__main__':main()
