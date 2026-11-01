import assert from 'node:assert/strict';
import test from 'node:test';
import {Client} from '@modelcontextprotocol/client';
import {InMemoryTransport} from '@modelcontextprotocol/server';
import {createServer} from '../server.mjs';

test('native task history searches all records with encoded read-only filters and retains totals',async()=>{
    const calls=[],reply={tasks:[{id:'an-old-task',status:'succeeded'}],total:146,page:4,pageSize:20,stats:{total:150,active:4,succeeded:146,failed:0,today:2},canvases:[],models:['本地模型']};
    const native={request:async(method,url,body,options)=>{calls.push({method,url,body,options});return reply},canvasURL:id=>'https://localhost/canvas/'+id};
    const server=createServer(native),client=new Client({name:'task-history-regression',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
    try{
        await Promise.all([server.connect(a),client.connect(b)]);
        const tools=await client.listTools(),tool=tools.tools.find(t=>t.name==='yingce_search_task_history');assert.equal(tool.annotations.readOnlyHint,true);assert.equal(tool.annotations.destructiveHint,false);
        const response=await client.callTool({name:tool.name,arguments:{page:4,pageSize:20,query:'原文 100%_ & 绿植',projectId:'native-canvas',kind:'image',model:'local::flux',status:'succeeded',timeZone:'Asia/Shanghai'}});
        assert.equal(response.isError,undefined);assert.deepEqual(response.structuredContent,reply);assert.equal(calls.length,1);assert.equal(calls[0].method,'GET');assert.equal(calls[0].body,undefined);
        const url=new URL(calls[0].url,'https://localhost');assert.equal(url.pathname,'/api/tasks/history');assert.equal(url.searchParams.get('q'),'原文 100%_ & 绿植');assert.equal(url.searchParams.get('page'),'4');assert.equal(url.searchParams.get('timeZone'),'Asia/Shanghai');assert.equal(url.searchParams.get('projectId'),'native-canvas');assert.equal(url.searchParams.get('model'),'local::flux');
        const records=await client.callTool({name:tool.name,arguments:{status:'recorded'}});assert.equal(records.isError,undefined);assert.equal(new URL(calls[1].url,'https://localhost').searchParams.get('status'),'recorded');
        const rejected=await client.callTool({name:tool.name,arguments:{page:0,kind:'unsupported'}});assert.equal(rejected.isError,true);assert.equal(calls.length,2);
    }finally{await client.close();await server.close()}
});
