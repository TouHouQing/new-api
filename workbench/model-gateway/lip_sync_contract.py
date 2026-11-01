# SPDX-License-Identifier: AGPL-3.0-or-later
"""Bounded offline lip-sync inputs shared by admission and the compute process."""
import base64
import hashlib
import re
from typing import Literal
from pydantic import BaseModel,ConfigDict,Field,model_validator

WEIGHTS={
    'musetalkV15/unet.pth':'7ebf6c98c181e20838e4c0054e96e944ac60d5d692cc01db42839fe11b787007',
    'musetalkV15/musetalk.json':'5b6923aee04d71692e0e9846c471e0a4ea07a4f686d39545e472bd4ba17e1b47',
    'sd-vae/diffusion_pytorch_model.bin':'1b4889b6b1d4ce7ae320a02dedaeff1780ad77d415ea0d744b476155c6377ddc',
    'sd-vae/config.json':'92d3dfb746fca211a2c9e019e285f8597412211728dce3c5bcf4eda0f2d62e7e',
    'whisper/model.safetensors':'7ebd0e69e78190ffe1438491fa05cc1f5c1aa3a4c4db3bc1723adbb551ea2395',
    'whisper/config.json':'ffdccec4f3211f4c63310f2b7098f309fe70f3952cedc5e4d11e43f5b2379b98',
    'whisper/preprocessor_config.json':'9b5cd03a36fbb8a627c64d98a5b5b126ead95a77720723944487311f0110b666',
}
MODEL_SHA256=hashlib.sha256(''.join(k+':'+v+'\n' for k,v in sorted(WEIGHTS.items())).encode()).hexdigest()

class FaceRegion(BaseModel):
    model_config=ConfigDict(extra='forbid',strict=True)
    x:int=Field(ge=0,le=1280)
    y:int=Field(ge=0,le=1280)
    width:int=Field(ge=48,le=1280)
    height:int=Field(ge=48,le=1280)

class LipSelection(BaseModel):
    model_config=ConfigDict(extra='forbid',strict=True)
    version:Literal[1]=1
    start_ms:int=Field(ge=0,le=3600000)
    end_ms:int=Field(ge=100,le=3600000)
    audio_start_ms:int=Field(ge=0,le=3600000)
    region:FaceRegion|None=None
    @model_validator(mode='after')
    def duration(self):
        if not 100<=self.end_ms-self.start_ms<=30000:raise ValueError('Select 0.1–30 seconds; source and dialogue must cover the entire interval')
        return self

def decode_media(value,kind):
    header,separator,encoded=value.partition(',')
    suffixes={'image':'png|jpeg|jpg|webp','video':'mp4|webm|quicktime','audio':'wav|x-wav|mpeg|mp3|flac|ogg|opus|webm|aac|mp4|x-m4a'}
    if separator!=',' or not re.fullmatch('data:'+kind+'/(?:'+suffixes[kind]+');base64',header):raise ValueError('Only uploaded '+kind+' bytes are accepted')
    raw=base64.b64decode(encoded,validate=True)
    maximum=(24 if kind=='video' else 8)*1024*1024
    if not 32<=len(raw)<=maximum:raise ValueError('Lip-sync source exceeds its supported byte limit')
    return raw

class LipSyncRequest(BaseModel):
    model_config=ConfigDict(extra='forbid',strict=True)
    model_name:Literal['musetalk-1.5']='musetalk-1.5'
    source_kind:Literal['image','video']
    source:str=Field(min_length=1,max_length=34*1024*1024)
    audio:str=Field(min_length=1,max_length=12*1024*1024)
    source_sha256:str=Field(pattern=r'^[0-9a-f]{64}$')
    audio_sha256:str=Field(pattern=r'^[0-9a-f]{64}$')
    selection:LipSelection
    rights_confirmed:bool
    @model_validator(mode='after')
    def bytes_match(self):
        if self.rights_confirmed is not True:raise ValueError('Confirm rights for these exact source and dialogue resources')
        if hashlib.sha256(decode_media(self.source,self.source_kind)).hexdigest()!=self.source_sha256 or hashlib.sha256(decode_media(self.audio,'audio')).hexdigest()!=self.audio_sha256:raise ValueError('The supplied media bytes no longer match the sealed native inputs')
        if self.source_kind=='image' and self.selection.start_ms!=0:raise ValueError('A talking photo starts at zero; choose an audio offset instead')
        return self
