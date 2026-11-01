import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { YingceClient, loadProfile, platformURL } from '../native-client.mjs';
import { createServer } from '../server.mjs';

test('delivery tools bind the reviewed source, recover read-only and never invoke generation', async t => {
    const calls=[], digest='d'.repeat(64), source={sha256:digest,projectRevision:7}, saved={resourceId:'delivery-resource',fileName:'project.zip',sha256:'e'.repeat(64),bytes:1024};
    const client=await connected(t,{workspace:true,request:async(method,route,body)=>{calls.push({method,route,body});if(route.endsWith('/delivery-source'))return source;return saved;}});
    const tools=(await client.listTools()).tools;
    assert.equal(tools.find(row=>row.name==='yingce_prepare_delivery').annotations.readOnlyHint,false);
    assert.equal(tools.find(row=>row.name==='yingce_delivery_result').annotations.readOnlyHint,true);
    assert.deepEqual((await client.callTool({name:'yingce_delivery_source',arguments:{projectId:'owned'}})).structuredContent,source);
    for(let i=0;i<2;i++)assert.deepEqual((await client.callTool({name:'yingce_prepare_delivery',arguments:{projectId:'owned',sourceSha256:digest}})).structuredContent,saved);
    assert.deepEqual(calls[1],calls[2]);assert.deepEqual(calls[1],{method:'POST',route:'/api/projects/owned/delivery-packages',body:{sourceSha256:digest}});
    await client.callTool({name:'yingce_delivery_result',arguments:{projectId:'owned',sourceSha256:digest}});
    assert.equal(calls.at(-1).method,'GET');const before=calls.length;
    assert.equal((await client.callTool({name:'yingce_prepare_delivery',arguments:{projectId:'owned',sourceSha256:'invalid',apiKey:'forbidden'}})).isError,true);
    assert.equal(calls.length,before);assert.ok(!calls.some(row=>row.route.includes('/tasks')));
});

async function connected(t, native) {
    const server = createServer(native), client = new Client({ name: 'yingce-regression', version: '1.0.0' });
    const [left, right] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(right), client.connect(left)]);
    t.after(async () => { await client.close(); await server.close(); });
    return client;
}
const policy = { selection: { logicalModelId: 'local-text' }, maxCredits: 10, maxSteps: 8, maxGenerationTasks: 0, maxVideoSeconds: 0 };

test('canvas restore is explicit, revision-bound and never retries an unknown write', async t => {
    const requests = [];
    const client = await connected(t, { workspace: true, canvasURL: id => 'https://yingce.example/canvas/' + id, request: async (method, route, body) => {
        requests.push({ method, route, body });
        if (method === 'POST') throw new Error('response lost');
        return route.endsWith('/history') ? { currentRevision: 8, snapshots: [{ id: 'saved', revision: 3 }] } : { snapshot: { id: 'saved' }, project: { nodes: [] } };
    } });
    const read = await client.callTool({ name: 'yingce_canvas_history', arguments: { canvasId: 'owned' } });
    assert.equal(read.structuredContent.currentRevision, 8);
    const snapshot = await client.callTool({ name: 'yingce_canvas_snapshot', arguments: { canvasId: 'owned', snapshotId: 'saved' } });
    assert.equal(snapshot.structuredContent.snapshot.id, 'saved');
    const unconfirmed = await client.callTool({ name: 'yingce_restore_canvas', arguments: { canvasId: 'owned', snapshotId: 'saved', expectedRevision: 8 } });
    assert.equal(unconfirmed.isError, true);
    assert.equal(requests.length, 2);
    const restore = await client.callTool({ name: 'yingce_restore_canvas', arguments: { canvasId: 'owned', snapshotId: 'saved', expectedRevision: 8, confirmRestore: true } });
    assert.equal(restore.isError, true);
    assert.equal(requests.length, 3);
    assert.deepEqual(requests[2], { method: 'POST', route: '/api/canvas-projects/owned/history/saved/restore', body: { expectedRevision: 8 } });
});

test('default MCP exposes queries only and preserves native pagination', async t => {
    const requests = [];
    const client = await connected(t, { request: async (...args) => { requests.push(args); return { items: [], hasMore: false }; } });
    const listed = await client.listTools();
    assert.equal(listed.tools.length, 11);
    assert.ok(listed.tools.every(tool => tool.annotations.readOnlyHint));
    assert.ok(!listed.tools.some(tool => tool.name === 'yingce_agent_start'));
    const value = await client.callTool({ name: 'yingce_agent_history', arguments: { canvasId: 'canvas-one', cursor: 'cursor+one=' } });
    assert.equal(value.isError, undefined);
    assert.match(requests[0][1], /cursor=cursor%2Bone%3D/);
    await assert.rejects(client.callTool({ name: 'yingce_agent_start', arguments: {} }), error => error.code === -32602);
    assert.equal(requests.length, 1);
});

test('project starter forwards exact native goal and template without generation or invented state', async t => {
    const requests=[];
    const client=await connected(t,{workspace:true,platformOrigin:'https://yingce.example',request:async(method,route,body)=>{requests.push({method,route,body});return {project:{id:'native-starter-project'}};}});
    const request={name:'商品作品',sourceType:'template',idempotencyKey:'native-template-project-once',creativeBrief:{version:1,goal:'product',audience:'新观众',keyMessage:'展示绿植细节',targetDurationMs:15000,language:'zh-CN',tone:'温暖',constraints:[]},starter:{entry:'template',presetKey:'product-v1'}};
    for(let i=0;i<2;i++){const result=await client.callTool({name:'yingce_create_project',arguments:request});assert.ok(!result.isError);assert.equal(result.structuredContent.project.id,'native-starter-project');}
    assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);assert.equal(requests[0].route,'/api/project-creations');assert.deepEqual(requests[0].body.starter,request.starter);assert.deepEqual(requests[0].body.creativeBrief,request.creativeBrief);
    const invalid=await client.callTool({name:'yingce_create_project',arguments:{...request,starter:{...request.starter,apiKey:'forbidden'}}});assert.equal(invalid.isError,true);assert.equal(requests.length,2);
});

test('Agent bridge fixes managed model, budget caps, native approval and idempotent request', async t => {
    const requests = [];
    const client = await connected(t, { agent: policy, canvasURL: id => 'https://example.test/canvas/' + id,
        request: async (...args) => { requests.push(args); return { run: { id: 'run-one', status: 'queued' } }; } });
    const args = { canvasId: 'canvas-one', prompt: '按原图切成六张', idempotencyKey: 'mcp-regression-0001', maxCredits: 5 };
    for (const invalid of [{ permissionMode: 'auto' }, { maxCredits: 11 }, { maxGenerationTasks: 1 }, { channelId: 'other' }, { idempotencyKey: 'short' }]) {
        const value = await client.callTool({ name: 'yingce_agent_start', arguments: { ...args, ...invalid } });
        assert.equal(value.isError, true);
    }
    assert.equal(requests.length, 0);
    await client.callTool({ name: 'yingce_agent_start', arguments: args });
    await client.callTool({ name: 'yingce_agent_start', arguments: args });
    assert.equal(requests.length, 2);
    assert.equal(requests[0][1], '/api/agent/runs');
    assert.deepEqual(requests[0][2], requests[1][2]);
    assert.equal(requests[0][2].permissionMode, 'request_approval');
    assert.equal(requests[0][2].logicalModelId, 'local-text');
    assert.deepEqual(requests[0][2].budget, { maxCredits: 5, maxSteps: 8, maxGenerationTasks: 0, maxVideoSeconds: 0 });
    const continuation = await client.callTool({ name: 'yingce_agent_continue', arguments: { ...args, parentRunId: 'original-run' } });
    assert.equal(continuation.isError, undefined);
    assert.equal(requests[2][1], '/api/agent/runs/original-run/messages');
    assert.equal(requests[2][2].parentRunId, undefined);
    await client.callTool({ name: 'yingce_agent_start', arguments: { ...args, contextScope: ['canvas', 'project'] } });
    assert.deepEqual(requests[3][2].contextScope, ['canvas', 'project']);
    const invalidScope = await client.callTool({ name: 'yingce_agent_start', arguments: { ...args, contextScope: ['project', 'project'] } });
    assert.equal(invalidScope.isError, true);
    assert.ok(!(await client.listTools()).tools.some(tool => /approve|decision/.test(tool.name)));
});

test('native session never follows redirects or echoes response/credential contents', async t => {
    let calls = 0;
    const server = http.createServer((req, res) => { calls++; res.writeHead(302, { Location: 'https://outside.example/private' }); res.end('session-secret-response'); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const client = new YingceClient({ baseURL: 'http://127.0.0.1:' + server.address().port, session: 'private-session-secret' });
    await assert.rejects(client.request('POST', '/api/agent/runs', { prompt: 'private-prompt' }), error => /302/.test(error.message) && !/secret|private|outside/.test(error.message));
    assert.equal(calls, 1);
    await assert.rejects(client.request('GET', '//outside.example/api/run'));
    await assert.rejects(client.request('GET', '/api/../../admin'));
    assert.equal(calls, 1);
});

test('platform and profile checks reject credential URLs and malformed secret files', async t => {
    for (const url of ['http://public.example', 'https://user:secret@example.test', 'https://example.test/?token=secret', 'https://example.test/subpath']) assert.throws(() => platformURL(url));
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yingce-bridge-test-'));
    const file = path.join(directory, 'profile.json');
    t.after(async () => { await fs.unlink(file); await fs.rmdir(directory); });
    await fs.writeFile(file, '{"session":"do-not-echo-secret"');
    await assert.rejects(loadProfile(file), error => !/do-not-echo-secret/.test(error.message));
});

test('local transfer tools require a configured media root and do not enable Agent runs', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yingce-media-bridge-test-'));
    const file = path.join(root, 'reference.txt');
    t.after(async () => { await fs.unlink(file); await fs.rmdir(root); });
    await fs.writeFile(file, 'reference');
    const client = await connected(t, { media: { root, maxBytes: 1000 }, request: async () => ({ user: { id: 'owner' } }) });
    const listed = (await client.listTools()).tools;
    assert.equal(listed.length, 14);
    assert.ok(!listed.some(tool => tool.name === 'yingce_agent_start'));
    assert.equal(listed.find(tool => tool.name === 'yingce_upload_resource').annotations.readOnlyHint, false);
    const result = await client.callTool({ name: 'yingce_local_media', arguments: {} });
    assert.deepEqual(result.structuredContent.files.map(item => item.path), ['reference.txt']);
    const escape = await client.callTool({ name: 'yingce_local_media', arguments: { directory: '../' } });
    assert.equal(escape.isError, true);
});

test('workspace creation is explicit, uses native durable writes and keeps retries identical', async t => {
    const requests = [];
    const client = await connected(t, {
        workspace: true, platformOrigin: 'https://yingce.example', canvasURL: id => 'https://yingce.example/canvas/' + id,
        request: async (method, route, body) => {
            requests.push({ method, route, body });
            if (route === '/api/auth/session') return { user: { id: 'owner' } };
            if (route === '/api/project-creations') return { project: { id: 'native-project' } };
            if (route.endsWith('/resource-adoptions')) return { adoption: { nodeId: 'native-node', assetVersionId: 'native-version' } };
            if (route.endsWith('/core')) return { project: { id: 'native-project', status: 'active' } };
            if (method === 'GET' && route.startsWith('/api/canvas-projects/')) return { project: { id: route.split('/').at(-1) } };
            return { project: { revision: 1 }, mutationId: body.mutationId };
        },
    });
    const tools = (await client.listTools()).tools;
    assert.equal(tools.length, 106);
    for (const name of ['yingce_list_transcripts', 'yingce_adopt_transcript', 'yingce_read_transcript', 'yingce_transcript_history', 'yingce_preview_lyrics', 'yingce_apply_lyrics', 'yingce_lyrics_result']) assert.ok(tools.some(tool => tool.name === name));
    for (const name of ['yingce_video_rework_source', 'yingce_video_rework_media', 'yingce_create_video_rework', 'yingce_video_rework_status']) assert.ok(tools.some(tool => tool.name === name));
    for (const name of ['yingce_plan_image_layers', 'yingce_image_layer_plans']) assert.ok(tools.some(tool => tool.name === name));
    for (const name of ['yingce_create_review', 'yingce_review_rework_source', 'yingce_create_review_share', 'yingce_set_review_member', 'yingce_apply_image_mask', 'yingce_adopt_image_operation']) assert.ok(tools.some(tool => tool.name === name));
    for (const name of ['yingce_preview_legacy_settings_review', 'yingce_apply_legacy_settings_review', 'yingce_legacy_settings_review_result']) assert.ok(tools.some(tool => tool.name === name));
    for (const name of ['yingce_canvas_cut_source', 'yingce_preview_canvas_cut', 'yingce_convert_canvas_cut']) assert.ok(tools.some(tool => tool.name === name));
    assert.ok(!tools.some(tool => tool.name === 'yingce_agent_start' || tool.name === 'yingce_upload_resource'));
    const project = await client.callTool({ name: 'yingce_create_project', arguments: { name: '作品', idempotencyKey: 'project-workspace-1234' } });
    assert.equal(project.structuredContent.projectURL, 'https://yingce.example/projects/native-project');
    const args = { title: '分镜画布', projectId: 'native-project', idempotencyKey: 'canvas-workspace-1234' };
    const first = await client.callTool({ name: 'yingce_create_canvas', arguments: args });
    const second = await client.callTool({ name: 'yingce_create_canvas', arguments: args });
    assert.deepEqual(first.structuredContent, second.structuredContent);
    const writes = requests.filter(request => request.method === 'PATCH');
    assert.equal(writes.length, 2);assert.deepEqual(writes[0], writes[1]);
    assert.deepEqual(writes[0].body.operations[0].patch, { title: '分镜画布', projectId: 'native-project' });
    const bad = await client.callTool({ name: 'yingce_create_project', arguments: { name: '作品', idempotencyKey: 'short' } });
    assert.equal(bad.isError, true);assert.equal(requests.filter(request => request.method === 'POST').length, 1);
    const placement = await client.callTool({ name: 'yingce_place_resource', arguments: { canvasId: first.structuredContent.canvasId, resourceId: 'owned-original', idempotencyKey: 'resource-workspace-1234' } });
    assert.equal(placement.structuredContent.adoption.assetVersionId, 'native-version');
    const placementRequest = requests.at(-1);
    assert.match(placementRequest.route, /\/resource-adoptions$/);
    assert.deepEqual(placementRequest.body, { resourceId: 'owned-original', title: '导入素材', x: 0, y: 0, requestId: 'resource-workspace-1234' });
});
