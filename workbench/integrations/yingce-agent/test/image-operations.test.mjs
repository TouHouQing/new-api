import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/client';
import {InMemoryTransport} from '@modelcontextprotocol/server';
import {createServer} from '../server.mjs';

test('native layer workflows require explicit budget confirmation and preserve unknown-reply identity',async t=>{
    const calls=[],server=createServer({workspace:true,request:async(...args)=>{calls.push(args);throw new Error('reply lost');}}),client=new Client({name:'layer-workflow-contract',version:'1'});
    const [left,right]=InMemoryTransport.createLinkedPair();await Promise.all([server.connect(left),client.connect(right)]);t.after(async()=>{await client.close();await server.close();});
    const request={canvasId:'canvas',requestId:'native-layer-workflow-0001',sourceNodeId:'original-node',resourceId:'original',expectedSourceSha256:'a'.repeat(64),maxCredits:0,layers:[{name:'底图',method:'source'},{name:'对象',method:'source-region',region:{width:31,height:23,bbox:[0,0,800,800],shape:'rect'}}]};
    for(const extra of [{},{confirmWorkflow:true,maxCredits:-1},{confirmWorkflow:true,layers:[request.layers[0]]},{confirmWorkflow:true,layers:[request.layers[0],{...request.layers[1],apiKey:'forbidden'}]}]){assert.equal((await client.callTool({name:'yingce_start_image_layer_workflow',arguments:{...request,...extra}})).isError,true);assert.equal(calls.length,0);}
    for(let i=0;i<2;i++)assert.equal((await client.callTool({name:'yingce_start_image_layer_workflow',arguments:{...request,confirmWorkflow:true}})).isError,true);
    const {canvasId,...body}=request;assert.deepEqual(calls[0].slice(0,3),['POST','/api/canvas-projects/canvas/image-layer-workflows',body]);assert.deepEqual(calls[0].slice(0,3),calls[1].slice(0,3));assert.equal(calls.length,2);
});

test('native workflow continuation preserves original task, plan and separately confirmed new cap',async t=>{
    const calls=[],server=createServer({workspace:true,request:async(...args)=>{calls.push(args);return{taskId:'new-workflow'};}}),client=new Client({name:'layer-resume-contract',version:'1'});
    const [left,right]=InMemoryTransport.createLinkedPair();await Promise.all([server.connect(left),client.connect(right)]);t.after(async()=>{await client.close();await server.close();});
    const request={canvasId:'canvas',requestId:'native-resume-workflow-0001',resumeTaskId:'a'.repeat(32),sourceNodeId:'original-node',resourceId:'original',expectedSourceSha256:'b'.repeat(64),maxCredits:3,layers:[{name:'底图',method:'source'},{name:'对象',method:'source-region',region:{width:31,height:23,bbox:[0,0,800,800],shape:'rect'}}]};
    assert.equal((await client.callTool({name:'yingce_start_image_layer_workflow',arguments:request})).isError,true);assert.equal(calls.length,0);
    assert.notEqual((await client.callTool({name:'yingce_start_image_layer_workflow',arguments:{...request,confirmWorkflow:true}})).isError,true);
    const {canvasId,...body}=request;assert.deepEqual(calls[0].slice(0,3),['POST','/api/canvas-projects/canvas/image-layer-workflows',body]);
});

test('native material save requires confirmation and never resubmits an unknown reply', async t => {
    const calls=[],server=createServer({workspace:true,request:async(...args)=>{calls.push(args);if(args[0]==='POST')throw new Error('reply lost');return {empty:false,trimNeeded:true};}}),client=new Client({name:'material-contract',version:'1'});
    const [left,right]=InMemoryTransport.createLinkedPair();await Promise.all([server.connect(left),client.connect(right)]);t.after(async()=>{await client.close();await server.close();});
    assert.equal((await client.callTool({name:'yingce_image_alpha_bounds',arguments:{resourceId:'original'}})).isError,undefined);
    assert.deepEqual(calls[0].slice(0,3),['GET','/api/images/original/alpha-bounds',undefined]);
    const request={canvasId:'canvas',nodeId:'foregrounds',requestId:'native-material-save-0001',sourceGroupSha256:'a'.repeat(64)};
    assert.equal((await client.callTool({name:'yingce_save_image_layer_materials',arguments:request})).isError,true);assert.equal(calls.length,1);
    assert.equal((await client.callTool({name:'yingce_save_image_layer_materials',arguments:{...request,confirmSave:true}})).isError,true);assert.equal(calls.length,2);
    const {canvasId,nodeId,...body}=request;assert.deepEqual(calls[1].slice(0,3),['POST',`/api/canvas-projects/${canvasId}/image-layer-groups/${nodeId}/materials`,body]);
    for(const invalid of [{sourceGroupSha256:'wrong'},{confirmSave:false},{resourceId:'foreign'}]){assert.equal((await client.callTool({name:'yingce_save_image_layer_materials',arguments:{...request,confirmSave:true,...invalid}})).isError,true);assert.equal(calls.length,2);}
});

test('native masks retain pixel coordinates, exact source and stable intent; adoption is explicit', async t => {
    const calls=[],server=createServer({workspace:true,request:async(...args)=>{calls.push(args);return {id:'native-image-mask'};}}),client=new Client({name:'mask-contract',version:'1'});
    const [left,right]=InMemoryTransport.createLinkedPair();await Promise.all([server.connect(left),client.connect(right)]);t.after(async()=>{await client.close();await server.close();});
    const args={requestId:'native-mask-request-0001',resourceId:'original',projectId:'canvas',sourceNodeId:'image-node',mask:{width:31,height:23,mode:'keep',strokes:[{diameter:8,erase:false,points:[[15.5,10.5]]}]}};
    assert.equal((await client.callTool({name:'yingce_apply_image_mask',arguments:args})).isError,true);assert.equal(calls.length,0);
    assert.equal((await client.callTool({name:'yingce_apply_image_mask',arguments:{...args,confirmMask:true}})).isError,undefined);
    const {mask,...identity}=args;assert.deepEqual(calls[0].slice(0,3),['POST','/api/images/operations',{...identity,recipe:{operation:'mask',mask}}]);
    assert.equal((await client.callTool({name:'yingce_apply_image_mask',arguments:{...args,mask:{...mask,width:16777216},confirmMask:true}})).isError,true);assert.equal(calls.length,1);
    assert.equal((await client.callTool({name:'yingce_adopt_image_operation',arguments:{taskId:'native-image-mask',requestId:'native-mask-adopt-0001'}})).isError,true);assert.equal(calls.length,1);
    assert.equal((await client.callTool({name:'yingce_adopt_image_operation',arguments:{taskId:'native-image-mask',requestId:'native-mask-adopt-0001',confirmAdopt:true}})).isError,undefined);
    assert.deepEqual(calls[1].slice(0,3),['POST','/api/images/operations/native-image-mask/apply',{requestId:'native-mask-adopt-0001'}]);
});

test('native layer group tools preserve atomic creation and exact source', async t => {
    const calls=[],server=createServer({workspace:true,request:async(...args)=>{calls.push(args);return {taskId:'native-compose'};}}),client=new Client({name:'layer-contract',version:'1'});
    const [left,right]=InMemoryTransport.createLinkedPair();await Promise.all([server.connect(left),client.connect(right)]);t.after(async()=>{await client.close();await server.close();});
    const input={canvasId:'canvas',requestId:'native-group-create-0001',sources:[{nodeId:'layer-base',resourceId:'base'},{nodeId:'layer-top',resourceId:'top'}]};
    assert.equal((await client.callTool({name:'yingce_create_image_layer_group',arguments:input})).isError,true);assert.equal(calls.length,0);
    assert.equal((await client.callTool({name:'yingce_create_image_layer_group',arguments:{...input,confirmCompose:true}})).isError,undefined);
    assert.deepEqual(calls[0].slice(0,3),['POST','/api/canvas-projects/canvas/image-layer-groups',{requestId:input.requestId,sources:input.sources}]);
    for(const invalid of [{sources:[input.sources[0],input.sources[0]]},{width:20}]){assert.equal((await client.callTool({name:'yingce_create_image_layer_group',arguments:{...input,...invalid,confirmCompose:true}})).isError,true);assert.equal(calls.length,1);}
    await client.callTool({name:'yingce_read_image_layer_group',arguments:{canvasId:'canvas',nodeId:'group'}});
    assert.deepEqual(calls[1].slice(0,3),['GET','/api/canvas-projects/canvas/image-layer-groups/group/source',undefined]);
    const compose={width:31,height:23,layers:[{id:'layer-base',resourceId:'base',x:-0.5,y:2.5},{id:'layer-top',resourceId:'top',x:4,y:0,opacity:0.35,visible:false}]};
    const request={projectId:'canvas',sourceNodeId:'group',resourceId:'original',sourceGroupSha256:'a'.repeat(64),requestId:'native-compose-request-0001',compose,confirmCompose:true};
    assert.equal((await client.callTool({name:'yingce_compose_image_layer_group',arguments:request})).isError,undefined);
    const normalized={...compose,layers:[{...compose.layers[0],visible:true,opacity:1},compose.layers[1]]};
    assert.deepEqual(calls[2].slice(0,3),['POST','/api/images/operations',{projectId:request.projectId,sourceNodeId:request.sourceNodeId,resourceId:request.resourceId,sourceGroupSha256:request.sourceGroupSha256,requestId:request.requestId,clientCompositeSignature:JSON.stringify([31,23,[['layer-base',-0.5,2.5,true,1,'resource:base'],['layer-top',4,0,false,0.35,'resource:top']]]),recipe:{operation:'compose',compose:normalized}}]);
});
