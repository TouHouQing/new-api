import test from 'node:test';
import assert from 'node:assert/strict';
import * as z from 'zod/v4';
import { registerLyricsTools } from '../lyrics.mjs';
import { registerTimelineEditTools } from '../edits.mjs';

function fixture(register){const tools=new Map(),calls=[];register((name,description,shape,readOnly,run)=>tools.set(name,{schema:z.object(shape).strict(),readOnly,run}),{workspace:true,request:async(...args)=>{calls.push(args);return {native:true}}});return {tools,calls}}
test('歌词预览与采用共享原生接口且去掉仅用于MCP的确认字段',async()=>{
    const {tools,calls}=fixture(registerLyricsTools);
    const body={projectId:'owned',transcriptId:'recognition',requestId:'lyrics-request-0001',expectedRevision:1,sourceRevisionId:'original',lyrics:'归来',anchors:[{line:0,startMs:700,endMs:1800,reviewed:true}]};
    const preview=tools.get('yingce_preview_lyrics');await preview.run(preview.schema.parse(body));assert.equal(preview.readOnly,true);assert.equal(calls[0][1],'/api/projects/owned/transcripts/recognition/lyrics-preview');
    const apply=tools.get('yingce_apply_lyrics');assert.throws(()=>apply.schema.parse({...body,previewToken:'a'.repeat(64)}));
    await apply.run(apply.schema.parse({...body,previewToken:'a'.repeat(64),confirmReviewed:true}));assert.equal(apply.readOnly,false);assert.equal(calls[1][2].confirmReviewed,undefined);assert.equal(calls[1][2].anchors[0].startMs,700);
    assert.throws(()=>preview.schema.parse({...body,source:{method:'measured'}}));assert.throws(()=>preview.schema.parse({...body,anchors:[{...body.anchors[0],method:'source_words'}]}));
});
test('按真实节拍的复合编辑只传固定分析版本与明确顺序，拒绝伪造的内部测量',async()=>{
    const {tools,calls}=fixture(registerTimelineEditTools);const preview=tools.get('yingce_preview_timeline_edits');
    const body={projectId:'owned',requestId:'beat-request-0000001',expectedRevision:2,commands:[{op:'arrangeToBeats',analysisId:'analysis',analysisRevisionId:'pinned',sourceClipId:'music',clipIds:['shot2','shot1']}]};
    await preview.run(preview.schema.parse(body));assert.deepEqual(calls[0][2].commands,body.commands);
    assert.throws(()=>preview.schema.parse({...body,commands:[{...body.commands[0],beats:{times:[0,1000]}}]}));
});
