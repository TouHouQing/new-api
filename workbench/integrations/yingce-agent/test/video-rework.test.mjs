import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { createServer } from '../server.mjs';
async function connect(t, config) { const server = createServer(config), client = new Client({ name: 'video-rework-contract', version: '1' }); const [a, b] = InMemoryTransport.createLinkedPair(); await Promise.all([server.connect(a), client.connect(b)]); t.after(async () => { await client.close(); await server.close(); }); return client; }
const edit = { clipId: 'occurrence-1', clipSha256: 'a'.repeat(64), sourceResourceId: 'original', sourceSha256: 'b'.repeat(64), sourceStartMs: 500, sourceEndMs: 1500, candidateResourceId: 'candidate', candidateSha256: 'c'.repeat(64), candidateStartMs: 250, audio: 'original', region: { x: 17, y: 15, width: 31, height: 33 } };
test('native repair requires exact source, explicit composition confirmation and unchanged retry body', async t => {
    const calls = [], client = await connect(t, { workspace: true, request: async (method, route, body) => { calls.push({ method, route, body }); if (method === 'POST' && route.endsWith('/video-reworks')) throw new Error('lost accepted reply'); return { id: 'one-native-task' }; } });
    const body = { projectId: 'project', requestId: 'repair-native-stable-0001', expectedRevision: 7, edit };
    await client.callTool({ name: 'yingce_video_rework_source', arguments: { projectId: body.projectId, clipId: edit.clipId } });
    await client.callTool({ name: 'yingce_video_rework_media', arguments: { projectId: body.projectId, resourceId: edit.candidateResourceId } });
    const before = calls.length;
    for (const patch of [{}, { confirmCompose: false }, { confirmCompose: true, edit: { ...edit, candidateSha256: '' } }, { confirmCompose: true, edit: { ...edit, sourceEndMs: 40000 } }, { confirmCompose: true, edit: { ...edit, url: 'https://unowned.invalid/video' } }]) {
        const reply = await client.callTool({ name: 'yingce_create_video_rework', arguments: { ...body, ...patch } }); assert.equal(reply.isError, true);
    }
    assert.equal(calls.length, before);
    for (let i = 0; i < 2; i++) assert.equal((await client.callTool({ name: 'yingce_create_video_rework', arguments: { ...body, confirmCompose: true } })).isError, true);
    assert.deepEqual(calls.at(-1).body, calls.at(-2).body); assert.deepEqual(calls.at(-1).body, { requestId: body.requestId, expectedRevision: 7, edit });
    await client.callTool({ name: 'yingce_video_rework_status', arguments: { projectId: body.projectId, requestId: body.requestId } });
    assert.equal(calls.at(-1).method, 'GET'); assert.ok(calls.at(-1).route.endsWith('requestId=' + body.requestId));
});
test('repair adoption and removal use existing preview, confirmation, source fingerprint and receipt contracts', async t => {
    const calls = [], client = await connect(t, { workspace: true, request: async (...args) => { calls.push(args); return { previewToken: 'd'.repeat(64) }; } });
    for (const command of [{ op: 'applyVideoRepair', id: edit.clipId, repairTaskId: 'native-task' }, { op: 'removeVideoRepair', id: 'repair-clip:native-task', repairTaskId: 'native-task', expectedClipSha256: 'e'.repeat(64) }]) {
        const input = { projectId: 'project', requestId: 'repair-adoption-stable-0001', expectedRevision: 7, commands: [command] };
        assert.equal((await client.callTool({ name: 'yingce_preview_timeline_edits', arguments: input })).isError, undefined);
        const count = calls.length; assert.equal((await client.callTool({ name: 'yingce_apply_timeline_edits', arguments: { ...input, previewToken: 'd'.repeat(64) } })).isError, true); assert.equal(calls.length, count);
        await client.callTool({ name: 'yingce_apply_timeline_edits', arguments: { ...input, previewToken: 'd'.repeat(64), confirmEdit: true } }); assert.deepEqual(calls.at(-1)[2].commands, [command]);
    }
});
test('query-only connection does not expose repair sources or writes', async t => {
    const client = await connect(t, { workspace: false, request: async () => { throw new Error('unexpected'); } }); assert.ok(!(await client.listTools()).tools.some(tool => tool.name.includes('video_rework')));
});

test('repair history is read-only and forwards occurrence-scoped bounded pagination',async t=>{
 const calls=[],client=await connect(t,{workspace:true,request:async(...args)=>{calls.push(args);return {entries:[],nextCursor:'next'};}});
 const tools=(await client.listTools()).tools,tool=tools.find(x=>x.name==='yingce_video_rework_history');assert.equal(tool.annotations.readOnlyHint,true);
 await client.callTool({name:tool.name,arguments:{projectId:'project',clipId:'one-use_%!',cursor:'cursor-1',limit:7}});
 assert.equal(calls.at(-1)[0],'GET');const route=new URL(calls.at(-1)[1],'https://localhost');assert.equal(route.searchParams.get('clipId'),'one-use_%!');assert.equal(route.searchParams.get('cursor'),'cursor-1');assert.equal(route.searchParams.get('limit'),'7');
 const count=calls.length;assert.equal((await client.callTool({name:tool.name,arguments:{projectId:'project',clipId:'one-use',limit:51}})).isError,true);assert.equal(calls.length,count);
});
