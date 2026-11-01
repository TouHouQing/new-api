# SPDX-License-Identifier: AGPL-3.0-or-later
"""Compute receipts only; native Yingce owns tasks, permissions, budgets and assets."""
import asyncio,hashlib,json,os,shutil,subprocess,uuid
from pathlib import Path
from fastapi import HTTPException
from local_speech import LocalSpeech
from lip_sync_contract import LipSyncRequest,WEIGHTS,MODEL_SHA256

class LocalLipSync(LocalSpeech):
    execution_name='lip_sync'
    execution_timeout=3600
    async def verify_runtime(self):
        self.runtime_ready=False
        if not self.python or not self.model or not self.ffmpeg or not self.python.is_file() or not self.ffmpeg.is_file() or not (self.model/'musetalk/models/unet.py').is_file():return False
        try:
            paths={name:self.model/'models'/name for name in WEIGHTS}
            if any(not p.is_file() or hashlib.file_digest(p.open('rb'),'sha256').hexdigest()!=WEIGHTS[n] for n,p in paths.items()):return False
            self.weight_stats={n:(p.stat().st_size,p.stat().st_mtime_ns) for n,p in paths.items()}
            environment=os.environ.copy();environment.pop('PYTHONPATH',None);environment.update(HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1')
            code="import importlib.util,json;print(json.dumps(all(importlib.util.find_spec(n) is not None for n in ['torch','diffusers','transformers','cv2','soundfile','numpy','pydantic'])))"
            options={'creationflags':subprocess.CREATE_NEW_PROCESS_GROUP} if os.name=='nt' else {'start_new_session':True}
            process=await asyncio.create_subprocess_exec(str(self.python),'-X','utf8','-B','-c',code,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.DEVNULL,env=environment,**options)
            try:
                raw,_=await asyncio.wait_for(process.communicate(),timeout=20);self.runtime_ready=process.returncode==0 and json.loads(raw) is True
            finally:
                if process.returncode is None:await self.stop_process(process)
        except (OSError,ValueError,TimeoutError):self.runtime_ready=False
        return self.runtime_ready

    def available(self):
        try:return bool(self.runtime_ready and self.python.is_file() and self.ffmpeg.is_file() and self.ffmpeg.with_name('ffprobe.exe' if os.name=='nt' else 'ffprobe').is_file() and all((p:=self.model/'models'/n).is_file() and (p.stat().st_size,p.stat().st_mtime_ns)==v for n,v in self.weight_stats.items()))
        except (OSError,AttributeError):return False

    def directory(self,identity):
        try:identity=str(uuid.UUID(identity))
        except (ValueError,AttributeError) as error:raise HTTPException(400,'Invalid lip-sync receipt identity') from error
        return self.receipts.directory/'lip-sync'/identity

    def lookup(self,identity):
        self.directory(identity);stored=self.receipts.for_prompt(identity)
        if not stored or stored[1].get('model')!='lip_sync':raise HTTPException(404,'Lip-sync receipt not found')
        value=stored[1]
        if value.get('model_sha256')!=MODEL_SHA256 or value.get('status') not in {'pending','processing','succeeded','failed','cancelled'}:raise HTTPException(409,'Original lip-sync receipt cannot be verified; inference was not repeated')
        return stored

    async def submit(self,request:LipSyncRequest,key:str):
        digest=self.receipts.digest(key);payload=request.model_dump();fingerprint=hashlib.sha256(json.dumps(payload,sort_keys=True,separators=(',',':')).encode()).hexdigest()
        async with self.lock:
            previous=self.receipts.read(digest)
            if previous:
                if previous.get('model')!='lip_sync' or previous.get('fingerprint')!=fingerprint:raise HTTPException(409,'Original lip-sync submission has different inputs')
                self.receipts.write(digest,previous);return {'prompt_id':previous['prompt_id'],'status':previous['status']}
            if not self.available():raise HTTPException(503,'Configure installed offline MuseTalk, pinned weights and FFmpeg before lip sync')
            reserve=640*1024*1024
            pending=sum(getattr(t,'lip_reserved_bytes',0)+getattr(t,'media_reserved_bytes',0) for engine in [self,*getattr(self,'storage_peers',[])] for t in engine.pending.values() if not t.done())
            if shutil.disk_usage(self.receipts.directory).free<reserve+pending:raise HTTPException(507,'Not enough free storage for the selected source, dialogue and lip-sync result')
            identity=str(uuid.uuid5(uuid.NAMESPACE_URL,'yingce-local-lip-sync:'+digest));directory=self.directory(identity)
            try:directory.mkdir(parents=True,exist_ok=False)
            except FileExistsError as error:raise HTTPException(409,'Unconfirmed preparation exists; inspect original saved receipts') from error
            receipt={'model':'lip_sync','prompt_id':identity,'fingerprint':fingerprint,'status':'pending','source_sha256':request.source_sha256,'audio_sha256':request.audio_sha256,'source_kind':request.source_kind,'selection':request.selection.model_dump(),'model_sha256':MODEL_SHA256}
            try:self.receipts._write(directory/'input.json',payload);self.receipts.write(digest,receipt)
            except Exception:
                (directory/'input.json').unlink(missing_ok=True)
                if not any(directory.iterdir()):directory.rmdir()
                raise
            task=asyncio.create_task(self.execute(digest,receipt,directory));task.lip_reserved_bytes=reserve;self.pending[identity]=task;task.add_done_callback(lambda _:self.release_execution(identity,directory))
            return {'prompt_id':identity,'status':'pending'}

    def inference_command(self,directory):return [str(self.python),'-X','utf8','-B',str(Path(__file__).with_name('render_lip_sync.py')),'--input',str(directory/'input.json'),'--model',str(self.model),'--ffmpeg',str(self.ffmpeg)]

    @staticmethod
    def cleanup_transients(directory):
        for name in ['input.json','source.bin','dialogue.bin','photo-source.mp4','selected-source.mp4','silent.mp4','output.wav','speech-feature-input.wav','output.part.mp4','result.part.json']:(directory/name).unlink(missing_ok=True)

    def verified_result(self,directory,receipt):
        result=json.loads((directory/'result.json').read_text(encoding='utf-8'))
        if result.get('version')!=1 or result.get('model')!='musetalk-1.5' or any(result.get(k)!=receipt[k] for k in ['source_sha256','audio_sha256','source_kind','selection','model_sha256']):raise ValueError('Lip-sync manifest no longer matches the original native inputs')
        output=directory/'output.mp4'
        if output.is_symlink() or not output.is_file() or not 32<=result['bytes']<=128*1024*1024 or output.stat().st_size!=result['bytes'] or hashlib.file_digest(output.open('rb'),'sha256').hexdigest()!=result['sha256']:raise ValueError('Saved lip-sync video bytes cannot be verified')
        selection=receipt['selection'];seconds=(selection['end_ms']-selection['start_ms'])/1000
        timing=result['timing']
        if abs(timing['audio_seconds']-seconds)>.002 or timing['output_frames']!=timing['frame_count'] or not 0<=timing['video_seconds']-timing['audio_seconds']<=1/timing['fps']+.002:raise ValueError('Saved video lost selected dialogue or an inferred frame')
        return result

    def completed(self,directory,receipt):
        try:self.verified_result(directory,receipt);return True
        except (OSError,ValueError,KeyError,TypeError,AttributeError):return False

    async def status(self,identity):
        digest,current=self.lookup(identity);directory=self.directory(identity)
        if current['status'] not in {'succeeded','cancelled','failed'} and identity not in self.pending:
            if self.completed(directory,current):current['status']='succeeded'
            else:current.update(status='failed',reason='execution_interrupted',message='口型处理已中断，请核对原任务与输出后再明确重试；没有自动重新生成')
            self.receipts.write(digest,current)
        if current['status']=='succeeded':
            try:result=self.verified_result(directory,current)
            except (OSError,ValueError,KeyError,TypeError,AttributeError) as error:raise HTTPException(409,'Original lip-sync output cannot be verified; inference was not repeated') from error
            return {'prompt_id':identity,'status':'succeeded','outputs':[{'url':'/api/jobs/'+identity+'/outputs/0','filename':'output.mp4','mime_type':'video/mp4'}],'source_sha256':result['source_sha256'],'audio_sha256':result['audio_sha256'],'selection':result['selection']}
        result={k:current[k] for k in ['prompt_id','status','reason','message'] if k in current}
        if current['status']=='failed' and current.get('reason')!='execution_interrupted':
            result['message']='口型处理未完成，请检查清晰正面人物、完整的人物选区与对白范围，再明确重试。原文件和任务记录已保留。'
        return result
