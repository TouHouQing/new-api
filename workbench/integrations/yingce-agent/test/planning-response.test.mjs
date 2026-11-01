import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {YingceClient} from '../native-client.mjs';

test('native shot plans carry bounded source and paginated scripts without widening unrelated requests',async t=>{
    let responseBytes=5*1024*1024,received=0;
    const backend=http.createServer((req,res)=>{received++;req.resume();res.setHeader('Content-Type','application/json');res.end(JSON.stringify({code:0,data:{payload:'x'.repeat(responseBytes)}}));});
    await new Promise(resolve=>backend.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>backend.close(resolve)));
    const client=new YingceClient({version:1,baseURL:'http://127.0.0.1:'+backend.address().port,session:'planning-limit-session-token'});
    for(const path of ['/api/projects/project/shot-plans/record?page=2','/api/projects/project/units/chapter/shot-plan-source'])assert.equal((await client.request('GET',path)).payload.length,responseBytes);
    await assert.rejects(client.request('GET','/api/projects/project/shot-plans'));
    responseBytes=0;
    const large={shots:[{description:'x'.repeat(150*1024)}]};
    await client.request('PUT','/api/projects/project/units/chapter/shots',large);
    const before=received;await assert.rejects(client.request('PUT','/api/projects/project/unrelated',large));assert.equal(received,before);
    responseBytes=17*1024*1024;await assert.rejects(client.request('GET','/api/projects/project/shot-plans/record?page=1'));
});
