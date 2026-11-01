import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { createServer } from '../server.mjs';

async function connected(t, clientOptions) {
    const server = createServer(clientOptions), client = new Client({ name: 'cut-contract-regression', version: '1' });
    const [a, b] = InMemoryTransport.createLinkedPair(); await Promise.all([server.connect(a), client.connect(b)]);
    t.after(async () => { await client.close(); await server.close(); }); return client;
}
test('cut loading requires exact preview confirmation and an unknown reply has one write plus separate receipt recovery', async t => {
    const calls = [];
    const client = await connected(t, { workspace: true, request: async (method, route, body) => {
        calls.push({ method, route, body }); if (route.endsWith('/apply')) throw new Error('unknown reply');
        return { appliedRevision: 8, plan: { backupCutId: 'before', cutId: 'chosen' }, replayed: true };
    } });
    const input = { projectId: 'project', cutId: 'chosen', requestId: 'cut/request:stable-1234', expectedRevision: 7, timelineSha256: 'a'.repeat(64) };
    await client.callTool({ name: 'yingce_preview_cut', arguments: input }); assert.equal(calls.length, 1); assert.equal(calls[0].method, 'POST');
    for (const confirmLoad of [undefined, false]) { const reply = await client.callTool({ name: 'yingce_apply_cut', arguments: { ...input, previewToken: 'b'.repeat(64), ...(confirmLoad === undefined ? {} : { confirmLoad }) } }); assert.equal(reply.isError, true); }
    assert.equal(calls.length, 1, 'missing confirmation must not reach the native write');
    const reply = await client.callTool({ name: 'yingce_apply_cut', arguments: { ...input, previewToken: 'b'.repeat(64), confirmLoad: true } }); assert.equal(reply.isError, true);
    assert.equal(calls.filter(call => call.route.endsWith('/apply')).length, 1, 'unknown write must not be retried automatically');
    assert.equal(calls.at(-1).body.expectedRevision, 7); assert.equal(calls.at(-1).body.timelineSha256, input.timelineSha256); assert.equal(calls.at(-1).body.confirmLoad, undefined);
    const receipt = await client.callTool({ name: 'yingce_cut_apply_result', arguments: { projectId: input.projectId, requestId: input.requestId } }); assert.equal(receipt.structuredContent.appliedRevision, 8); assert.ok(calls.at(-1).route.includes('requestId=cut%2Frequest%3Astable-1234')); assert.equal(calls.at(-1).method, 'GET');
    const dual = await client.callTool({ name: 'yingce_read_cut', arguments: { projectId: 'project', cutId: 'chosen', requestId: input.requestId } }); assert.equal(dual.isError, true);
    assert.equal(calls.filter(call => call.route.endsWith('/tasks')).length, 0);
});
test('legacy conversion is separately confirmed and does not automatically load a cut or start a model', async t => {
    const calls = [];
    const client = await connected(t, { workspace: true, request: async (method, route, body) => { calls.push({ method, route, body }); return { cut: { id: 'converted' } }; } });
    const input = { projectId: 'project', expectedProjectRevision: 3, expectedTimelineRevision: 9 };
    const denied = await client.callTool({ name: 'yingce_apply_legacy_native', arguments: { ...input, previewToken: 'a'.repeat(64) } }); assert.equal(denied.isError, true); assert.equal(calls.length, 0);
    await client.callTool({ name: 'yingce_preview_legacy_native', arguments: input });
    await client.callTool({ name: 'yingce_apply_legacy_native', arguments: { ...input, previewToken: 'a'.repeat(64), confirmConvert: true } });
    assert.equal(calls.length, 2); assert.equal(calls[1].route, '/api/projects/project/legacy-native/apply'); assert.equal(calls[1].body.expectedTimelineRevision, 9); assert.equal(calls[1].body.confirmConvert, undefined);
    assert.equal(calls.filter(call => call.route.includes('/timeline/cuts/') || call.route.endsWith('/tasks')).length, 0);
});
test('cut and legacy writes stay behind explicit workspace opt-in', async t => {
    const client = await connected(t, { workspace: false, request: async () => { throw new Error('must not be called'); } });
    const tools = (await client.listTools()).tools; assert.equal(tools.length, 11);
    assert.ok(!tools.some(tool => tool.name === 'yingce_save_cut' || tool.name === 'yingce_apply_cut' || tool.name.includes('legacy_native')));
});

test('cut list carries the native server filter and preserves complete history by default', async t => {
    const calls = [];
    const client = await connected(t, { workspace: true, request: async (method, route) => { calls.push({ method, route }); return { cuts: [] }; } });
    await client.callTool({ name: 'yingce_list_cuts', arguments: { projectId: 'project' } });
    assert.equal(new URL('https://test.invalid' + calls[0].route).searchParams.get('includeAutomatic'), 'true');
    await client.callTool({ name: 'yingce_list_cuts', arguments: { projectId: 'project', includeAutomatic: false, archived: true, cursor: 'saved-cut', limit: 2 } });
    const query = new URL('https://test.invalid' + calls[1].route).searchParams;
    assert.equal(query.get('includeAutomatic'), 'false'); assert.equal(query.get('archived'), 'true'); assert.equal(query.get('cursor'), 'saved-cut'); assert.equal(query.get('limit'), '2');
    const denied = await client.callTool({ name: 'yingce_list_cuts', arguments: { projectId: 'project', includeAutomatic: 'no' } });
    assert.equal(denied.isError, true); assert.equal(calls.length, 2); assert.ok(calls.every(call => call.method === 'GET'));
});

test('saved canvas conversion keeps exact source pages, requires confirmation and does not load or generate', async t => {
    const calls=[];
    const client=await connected(t,{workspace:true,request:async(method,route,body)=>{calls.push({method,route,body});if(route.endsWith('/canvas-cut/apply'))throw new Error('unknown native reply');return {cut:{id:'fixed-canvas-cut'}};}});
    await client.callTool({name:'yingce_canvas_cut_source',arguments:{projectId:'project',canvasId:'saved-canvas'}});
    assert.equal(calls[0].method,'GET');assert.equal(new URL('https://test.invalid'+calls[0].route).searchParams.get('limit'),'50');
    const badPage=await client.callTool({name:'yingce_canvas_cut_source',arguments:{projectId:'project',canvasId:'saved-canvas',cursor:50}});
    assert.equal(badPage.isError,true);assert.equal(calls.length,1);
    const input={projectId:'project',requestId:'canvas-cut-stable-request-001',expectedProjectRevision:2,expectedTimelineRevision:5,canvasId:'saved-canvas',canvasRevision:3,sourceSha256:'a'.repeat(64),title:'原画布剪辑',mappings:[{clipId:'repeat-a',resourceId:'exact-original'}],texts:[{clipId:'missing-caption',text:'由用户核对的台词'}]};
    await client.callTool({name:'yingce_preview_canvas_cut',arguments:input});assert.deepEqual(calls[1].body.mappings,input.mappings);assert.deepEqual(calls[1].body.texts,input.texts);
    for(const confirmConvert of [undefined,false]){const result=await client.callTool({name:'yingce_convert_canvas_cut',arguments:{...input,previewToken:'b'.repeat(64),...(confirmConvert===undefined?{}:{confirmConvert})}});assert.equal(result.isError,true);}
    assert.equal(calls.length,2);
    const unknown=await client.callTool({name:'yingce_convert_canvas_cut',arguments:{...input,previewToken:'b'.repeat(64),confirmConvert:true}});assert.equal(unknown.isError,true);
    assert.equal(calls.filter(call=>call.route.endsWith('/canvas-cut/apply')).length,1);assert.equal(calls.at(-1).body.confirmConvert,undefined);
    await client.callTool({name:'yingce_read_cut',arguments:{projectId:'project',requestId:input.requestId}});assert.equal(calls.at(-1).method,'GET');assert.ok(calls.at(-1).route.includes('/cut-requests?'));
    assert.ok(!calls.some(call=>call.route.endsWith('/tasks')||/\/cuts\/[^/]+\/apply$/.test(call.route)));
});

test('regional sources and fixed cut exports use native confirmations and read-only unknown-reply recovery', async t => {
    const calls = [];
    const client = await connected(t, { workspace: true, request: async (method, route, body) => {
        calls.push({ method, route, body });
        if (route.endsWith('/renders')) throw new Error('unknown export reply');
        return { id: 'same-native-task', cut: { id: 'converted' } };
    } });
    const input = { projectId: 'project', sourceId: 'ja', sourceSha256: 'a'.repeat(64), expectedProjectRevision: 2, expectedTimelineRevision: 9 };
    const page = await client.callTool({ name: 'yingce_legacy_versions', arguments: { projectId: 'project', cursor: 20 } });
    assert.equal(page.isError, true); assert.equal(calls.length, 0);
    await client.callTool({ name: 'yingce_preview_legacy_version', arguments: input });
    assert.equal(calls[0].route, '/api/projects/project/legacy-versions/preview');
    const denied = await client.callTool({ name: 'yingce_convert_legacy_version', arguments: { ...input, previewToken: 'b'.repeat(64) } });
    assert.equal(denied.isError, true); assert.equal(calls.length, 1);
    await client.callTool({ name: 'yingce_convert_legacy_version', arguments: { ...input, previewToken: 'b'.repeat(64), acceptPreservedFields: ['regionalVersions.motionGraphics'], confirmConvert: true } });
    assert.deepEqual(calls[1].body.acceptPreservedFields, ['regionalVersions.motionGraphics']); assert.equal(calls[1].body.confirmConvert, undefined);
    const output = { projectId: 'project', cutId: 'fixed-cut', requestId: 'render-request-stable-001', timelineSha256: 'c'.repeat(64) };
    const unconfirmed = await client.callTool({ name: 'yingce_render_cut', arguments: output });
    assert.equal(unconfirmed.isError, true); assert.equal(calls.length, 2);
    const unknown = await client.callTool({ name: 'yingce_render_cut', arguments: { ...output, confirmExport: true } });
    assert.equal(unknown.isError, true); assert.equal(calls.length, 3);
    assert.deepEqual(calls[2].body, { requestId: output.requestId, timelineSha256: output.timelineSha256 });
    await client.callTool({ name: 'yingce_cut_render_result', arguments: { projectId: output.projectId, cutId: output.cutId, requestId: output.requestId } });
    assert.equal(calls.at(-1).method, 'GET'); assert.ok(calls.at(-1).route.includes('/fixed-cut/render-request?'));
    assert.equal(calls.filter(call => call.route.endsWith('/renders')).length, 1);
    await client.callTool({ name: 'yingce_list_cut_renders', arguments: { projectId: output.projectId, cutId: output.cutId, cursor: 'older-task', limit: 2 } });
    assert.equal(calls.at(-1).method, 'GET');
    const historyQuery = new URL('https://test.invalid' + calls.at(-1).route).searchParams;
    assert.equal(historyQuery.get('cursor'), 'older-task'); assert.equal(historyQuery.get('limit'), '2');
    assert.ok(!calls.some(call => call.route.endsWith('/tasks') || /\/cuts\/[^/]+\/apply$/.test(call.route)));
});
