import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { createServer } from '../server.mjs';

test('reference-shot adoption carries exact versions and recovers an unknown write through a receipt',async t=>{
    const calls=[];
    const server=createServer({workspace:true,request:async(method,route,body)=>{calls.push({method,route,body});if(route.endsWith('/shots/apply'))throw new Error('reply lost');return {plan:{unitId:'chapter',shots:[{shotId:'shot'}]},unitDeleted:false,missingShotIds:[]};}});
    const [a,b]=InMemoryTransport.createLinkedPair();const client=new Client({name:'reference-shot-regression',version:'1'});
    await Promise.all([server.connect(a),client.connect(b)]);t.after(async()=>{await client.close();await server.close();});
    const input={projectId:'project',analysisId:'analysis',requestId:'reference-shot-stable-1',analysisRevisionId:'revision',expectedProjectRevision:7,sectionIds:['section:0']};
    const invalid=await client.callTool({name:'yingce_preview_reference_shots',arguments:{...input,sectionIds:[]}});assert.equal(invalid.isError,true);assert.equal(calls.length,0);
    await client.callTool({name:'yingce_preview_reference_shots',arguments:input});assert.equal(calls.filter(call=>call.route.endsWith('/shots/apply')).length,0);
    const reply=await client.callTool({name:'yingce_apply_reference_shots',arguments:{...input,previewToken:'a'.repeat(64)}});assert.equal(reply.isError,true);assert.equal(calls.filter(call=>call.route.endsWith('/shots/apply')).length,1);
    assert.equal(calls.at(-1).body.expectedProjectRevision,7);assert.equal(calls.at(-1).body.analysisRevisionId,'revision');
    const receipt=await client.callTool({name:'yingce_reference_adoption',arguments:{projectId:'project',requestId:input.requestId}});assert.equal(receipt.structuredContent.plan.unitId,'chapter');assert.equal(calls.at(-1).method,'GET');
    assert.equal(calls.filter(call=>call.route.endsWith('/tasks')).length,0);
});

test('manual framing requires a saved occurrence and preserves unknown creation intent without a model task',async t=>{
    const calls=[];
    const server=createServer({workspace:true,request:async(method,route,body)=>{calls.push({method,route,body});throw new Error('creation reply lost');}});
    const [a,b]=InMemoryTransport.createLinkedPair();const client=new Client({name:'manual-framing-regression',version:'1'});
    await Promise.all([server.connect(a),client.connect(b)]);t.after(async()=>{await client.close();await server.close();});
    const input={projectId:'project',requestId:'manual-framing-stable-1',resourceId:'original',sourceClipId:'occurrence',expectedTimelineRevision:3,targetAspect:9/16};
    const incomplete=await client.callTool({name:'yingce_create_manual_framing',arguments:{...input,expectedTimelineRevision:0}});
    assert.equal(incomplete.isError,true);assert.equal(calls.length,0);
    for(let i=0;i<2;i++){
        const response=await client.callTool({name:'yingce_create_manual_framing',arguments:input});
        assert.equal(response.isError,true);assert.equal(calls.length,i+1,'unknown write must not automatically retry');
    }
    assert.deepEqual(calls[0],calls[1]);assert.equal(calls[0].route,'/api/projects/project/media-analyses/manual-framing');
    assert.equal(calls.filter(call=>call.route.endsWith('/tasks')||call.route.endsWith('/reframe/apply')).length,0);
});

test('analysis tools share native queue, corrections and exact preview CAS without automatic approval',async t=>{
    const calls=[];
    const server=createServer({workspace:true,canvasURL:id=>'https://yingce.example/canvas/'+id,request:async(method,route,body)=>{calls.push({method,route,body});return route.includes('/markers/preview')?{previewToken:'a'.repeat(64),timelineRevision:7,added:[]}:{analysis:{id:'analysis'},evidence:{method:'CPU',secretEvidence:'large'},document:{version:1,sections:[],beats:[],tracking:[]}};}});
    const [a,b]=InMemoryTransport.createLinkedPair();const client=new Client({name:'analysis-regression',version:'1'});
    await Promise.all([server.connect(a),client.connect(b)]);t.after(async()=>{await client.close();await server.close();});
    const tools=(await client.listTools()).tools;
    assert.equal(tools.filter(tool=>tool.name.includes('analysis')||tool.name==='yingce_analyze_media'||tool.name==='yingce_list_analyses').length,8);
    const input={projectId:'project',requestId:'stable-cpu-analysis-1',resourceId:'source',kind:'reference_video',sourceClipId:'occurrence',startMs:1000,endMs:3000};
    await client.callTool({name:'yingce_analyze_media',arguments:input});
    await client.callTool({name:'yingce_analyze_media',arguments:input});
    assert.deepEqual(calls[0],calls[1]);assert.equal(calls[0].route,'/api/projects/project/media-analyses/tasks');
    assert.equal(calls[0].body.requestId,input.requestId);
    const read=await client.callTool({name:'yingce_read_analysis',arguments:{projectId:'project',analysisId:'analysis'}});
    assert.deepEqual(read.structuredContent.evidence,{method:'CPU',omitted:true});
    const bad=await client.callTool({name:'yingce_save_analysis',arguments:{projectId:'project',analysisId:'analysis',requestId:'stable-correction-1',expectedRevision:2,evidence:{fake:true}}});
    assert.equal(bad.isError,true);
    const preview={projectId:'project',analysisId:'analysis',analysisRevisionId:'revision',sourceClipId:'occurrence',expectedTimelineRevision:7};
    await client.callTool({name:'yingce_preview_analysis_markers',arguments:preview});
    assert.equal(calls.filter(call=>call.route.endsWith('/markers/apply')).length,0);
    await client.callTool({name:'yingce_apply_analysis_markers',arguments:{...preview,previewToken:'a'.repeat(64)}});
    assert.equal(calls.at(-1).body.expectedTimelineRevision,7);
    assert.equal(calls.at(-1).body.analysisRevisionId,'revision');
    await client.callTool({name:'yingce_preview_reframe',arguments:preview});
    assert.ok(calls.at(-1).route.endsWith('/reframe/preview'));
    assert.equal(calls.filter(call=>call.route.endsWith('/reframe/apply')).length,0);
    await client.callTool({name:'yingce_apply_reframe',arguments:{...preview,previewToken:'a'.repeat(64)}});
    assert.ok(calls.at(-1).route.endsWith('/reframe/apply'));
    assert.equal(calls.at(-1).body.expectedTimelineRevision,7);
});
