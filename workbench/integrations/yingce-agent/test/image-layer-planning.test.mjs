import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/client';
import {InMemoryTransport} from '@modelcontextprotocol/server';
import {createServer} from '../server.mjs';

test('visual layer planning requires confirmed budget and one model, and reuses the same native task intent after a lost reply',async t=>{
    const calls=[],server=createServer({workspace:true,request:async(...args)=>{calls.push(args);throw new Error('reply lost');}}),client=new Client({name:'native-layer-plan',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a),client.connect(b)]);t.after(async()=>{await client.close();await server.close();});
    const args={canvasId:'canvas',sourceNodeId:'original-node',resourceId:'original',expectedSourceSha256:'a'.repeat(64),instructions:'提取左右两幅完整照片，保留内部像素',purpose:'materials',input:'preview',maxCredits:0,idempotencyKey:'original-layer-plan-intent-0001',channelId:'local-channel',channelModelKey:'local-vision'};
    for(const extra of [{},{confirmPlanning:true,maxCredits:-1},{confirmPlanning:true,logicalModelId:'also-logical'},{confirmPlanning:true,apiKey:'forbidden'}]) { const r=await client.callTool({name:'yingce_plan_image_layers',arguments:{...args,...extra}});assert.equal(r.isError,true);assert.equal(calls.length,0); }
    for(let i=0;i<2;i++) { assert.equal((await client.callTool({name:'yingce_plan_image_layers',arguments:{...args,confirmPlanning:true}})).isError,true);assert.equal(calls.length,i+1); }
    assert.deepEqual(calls[0].slice(0,3),calls[1].slice(0,3));const [method,route,body]=calls[0];assert.equal(method,'POST');assert.equal(route,'/api/tasks');assert.equal(body.type,'canvas_text');assert.equal(body.input.mode,'text');assert.equal(body.operation,'text');assert.equal(body.input.config.model,args.channelModelKey);assert.equal(body.input.config.channelModelKey,undefined);assert.equal(body.input.metadata.nodeId,args.sourceNodeId);assert.equal(body.input.metadata.nativeLayerPlanning.expectedSourceSha256,args.expectedSourceSha256);assert.equal(body.input.metadata.nativeLayerPlanning.maxCredits,0);assert.match(body.input.metadata.clientOperationId,/^layer-plan:[a-f0-9]{64}$/);assert.equal(body.input.config.channelId,args.channelId);assert.equal(body.input.config.apiKey,undefined);
});

test('saved visual plan pages remain read only and carry a bounded original-source cursor',async t=>{
    const calls=[],reply={source:{sha256:'a'.repeat(64)},entries:[{taskId:'saved-task',status:'succeeded',planning:{status:'needs_correction'}}],nextCursor:'old-page'},server=createServer({workspace:true,request:async(...args)=>{calls.push(args);return reply;}}),client=new Client({name:'native-layer-plan-history',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a),client.connect(b)]);t.after(async()=>{await client.close();await server.close();});const tools=await client.listTools();assert.equal(tools.tools.find(v=>v.name==='yingce_image_layer_plans').annotations.readOnlyHint,true);
    const r=await client.callTool({name:'yingce_image_layer_plans',arguments:{canvasId:'canvas',sourceNodeId:'node:source',resourceId:'original',cursor:'older-page',limit:7}});assert.equal(r.isError,undefined);assert.deepEqual(r.structuredContent,reply);assert.equal(calls[0][0],'GET');const u=new URL(calls[0][1],'https://localhost');assert.equal(u.pathname,'/api/canvas-projects/canvas/image-layer-plans');assert.equal(u.searchParams.get('sourceNodeId'),'node:source');assert.equal(u.searchParams.get('cursor'),'older-page');assert.equal(u.searchParams.get('limit'),'7');assert.equal(calls[0][2],undefined);
});
