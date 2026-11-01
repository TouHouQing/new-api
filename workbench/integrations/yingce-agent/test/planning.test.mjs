import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/client';
import {InMemoryTransport} from '@modelcontextprotocol/server';
import {createServer} from '../server.mjs';

test('native planning preserves confirmed source and request across a lost reply, without generating',async t=>{
    const calls=[];
    const server=createServer({workspace:true,request:async(method,route,body)=>{calls.push({method,route,body});if(method==='PUT')throw new Error('reply lost');return{current:true,record:{id:'history'},snapshot:{entries:[]}};}});
    const [a,b]=InMemoryTransport.createLinkedPair(),client=new Client({name:'planning-regression',version:'1'});
    await Promise.all([server.connect(a),client.connect(b)]);t.after(async()=>{await client.close();await server.close();});
    const input={projectId:'project',unitId:'chapter',requestId:'stable-original-plan-0001',expectedSourceSha256:'a'.repeat(64),expectedShotIds:['original'],shots:[{title:'镜头',description:'窗边的猫',durationMs:1800}]};
    const rejected=await client.callTool({name:'yingce_replace_shot_plan',arguments:input});assert.equal(rejected.isError,true);assert.equal(calls.length,0);
    for(let i=0;i<2;i++){const result=await client.callTool({name:'yingce_replace_shot_plan',arguments:{...input,confirmReplace:true}});assert.equal(result.isError,true);assert.equal(calls.length,i+1);}
    assert.deepEqual(calls[0],calls[1]);assert.equal(calls[0].body.expectedSourceSha256,input.expectedSourceSha256);assert.equal(calls[0].route,'/api/projects/project/units/chapter/shots');
    const result=await client.callTool({name:'yingce_restore_shot_plan',arguments:{projectId:'project',recordId:'history',requestId:'stable-original-restore-0001',sourceSha256:'b'.repeat(64),expectedSourceSha256:'c'.repeat(64),expectedShotIds:['new-shot'],confirmRestore:true}});assert.equal(result.isError,undefined);
    assert.equal(calls.at(-1).body.sourceSha256,'b'.repeat(64));assert.equal(calls.at(-1).body.expectedSourceSha256,'c'.repeat(64));
    await client.callTool({name:'yingce_update_creative_brief',arguments:{projectId:'project',expectedRevision:4,creativeBrief:{version:1,goal:'product',keyMessage:'一个核心信息'},confirmChange:true}});
    assert.equal(calls.at(-1).method,'PATCH');assert.equal(calls.at(-1).body.creativeBrief.keyMessage,'一个核心信息');assert.equal(calls.at(-1).body.expectedRevision,4);
    await client.callTool({name:'yingce_task_by_operation',arguments:{clientOperationId:'chapter-plan:original-0001'}});assert.equal(calls.at(-1).method,'GET');
    assert.equal(calls.filter(value=>value.route==='/api/tasks').length,0);
});

test('native intention tools preserve stage-specific fixed references and reject an unknown stage',async t=>{
    const calls=[],server=createServer({workspace:true,request:async(method,route,body)=>{calls.push({method,route,body});return {shot:{id:'shot'}};}}),[a,b]=InMemoryTransport.createLinkedPair(),client=new Client({name:'stage-regression',version:'1'});
    await Promise.all([server.connect(a),client.connect(b)]);t.after(async()=>{await client.close();await server.close();});
    const input={projectId:'project',shotId:'shot',expectedRevisionId:'fixed-revision',confirmChange:true,referenceStates:[{assetVersionId:'fixed-version',stage:'image',wardrobe:'红外套',referenceResourceIds:['image-reference']},{assetVersionId:'fixed-version',stage:'video',wardrobe:'蓝外套',referenceResourceIds:['video-reference']}]};
    const result=await client.callTool({name:'yingce_update_shot_intentions',arguments:input});assert.equal(result.isError,undefined);assert.equal(calls.length,1);assert.deepEqual(calls[0].body.referenceStates.map(value=>[value.stage,...value.referenceResourceIds]),[['image','image-reference'],['video','video-reference']]);
    const rejected=await client.callTool({name:'yingce_update_shot_intentions',arguments:{...input,referenceStates:[{assetVersionId:'fixed-version',stage:'unknown'}]}});assert.equal(rejected.isError,true);assert.equal(calls.length,1);assert.equal(calls[0].method,'PATCH');
});
