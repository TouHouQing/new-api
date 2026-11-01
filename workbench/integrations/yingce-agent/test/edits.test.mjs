import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { createServer } from '../server.mjs';

async function connected(t, options) {
    const server = createServer(options), client = new Client({ name: 'timeline-edit-contract', version: '1' });
    const [left, right] = InMemoryTransport.createLinkedPair(); await Promise.all([server.connect(left), client.connect(right)]);
    t.after(async () => { await client.close(); await server.close(); }); return client;
}

test('legacy settings review binds fields, explicit confirmation and original receipt identity', async t => {
    const calls = [], client = await connected(t, { workspace: true, request: async (...args) => { calls.push(args); return { kind: 'legacy-settings-review', appliedRevision: 8 }; } });
    const args = { projectId: 'p', requestId: 'review-contract-0001', expectedRevision: 7, discardFields: ['regionalVersions.reframes'] };
    const preview = await client.callTool({ name: 'yingce_preview_legacy_settings_review', arguments: args }); assert.equal(preview.isError, undefined); assert.equal(calls.length, 1);
    for (const patch of [{}, { confirmDiscard: false }, { confirmDiscard: true, originCutId: 'forged' }]) {
        const response = await client.callTool({ name: 'yingce_apply_legacy_settings_review', arguments: { ...args, previewToken: 'a'.repeat(64), ...patch } }); assert.equal(response.isError, true);
    }
    assert.equal(calls.length, 1);
    await client.callTool({ name: 'yingce_apply_legacy_settings_review', arguments: { ...args, previewToken: 'a'.repeat(64), confirmDiscard: true } });
    assert.deepEqual(calls[1].slice(0, 3), ['POST', '/api/projects/p/timeline/legacy-settings/apply', { requestId: args.requestId, expectedRevision: 7, discardFields: args.discardFields, previewToken: 'a'.repeat(64) }]);
    await client.callTool({ name: 'yingce_legacy_settings_review_result', arguments: { projectId: 'p', requestId: args.requestId } }); assert.equal(calls[2][0], 'GET'); assert.ok(calls[2][1].endsWith('requestId=' + args.requestId));
});

test('legacy review is unavailable without workspace permission', async t => {
    const client = await connected(t, { workspace: false, request: async () => { throw new Error('unexpected'); } });
    const list = await client.listTools(); assert.ok(!list.tools.some(tool => tool.name.includes('legacy_settings_review')));
});
test('native timeline edits require preview confirmation and recover an unknown reply without automatic retries', async t => {
    const calls = [];
    const client = await connected(t, { workspace: true, request: async (method, route, body) => { calls.push({ method, route, body }); if (route.endsWith('/apply')) throw new Error('unknown reply'); return { kind: 'timeline-edit', appliedRevision: 6, replayed: true }; } });
    const input = { projectId: 'project', requestId: 'edit/request:stable-1234', expectedRevision: 5, commands: [{ op: 'setAudioLink', id: 'voice', sourceClipId: 'video:occurrence', mode: 'source' }, { op: 'splitClip', id: 'video:occurrence', splitAtMs: 1500 }] };
    await client.callTool({ name: 'yingce_preview_timeline_edits', arguments: input }); assert.equal(calls.length, 1); assert.equal(calls[0].method, 'POST');
    for (const confirmEdit of [undefined, false]) { const result = await client.callTool({ name: 'yingce_apply_timeline_edits', arguments: { ...input, previewToken: 'a'.repeat(64), ...(confirmEdit === undefined ? {} : { confirmEdit }) } }); assert.equal(result.isError, true); }
    assert.equal(calls.length, 1);
    const lost = await client.callTool({ name: 'yingce_apply_timeline_edits', arguments: { ...input, previewToken: 'a'.repeat(64), confirmEdit: true } }); assert.equal(lost.isError, true);
    assert.equal(calls.filter(call => call.route.endsWith('/apply')).length, 1); assert.deepEqual(calls.at(-1).body.commands, input.commands); assert.equal(calls.at(-1).body.confirmEdit, undefined);
    const receipt = await client.callTool({ name: 'yingce_timeline_edit_result', arguments: { projectId: input.projectId, requestId: input.requestId } }); assert.equal(receipt.structuredContent.appliedRevision, 6); assert.ok(calls.at(-1).route.includes('requestId=edit%2Frequest%3Astable-1234')); assert.equal(calls.at(-1).method, 'GET');
    assert.ok(!calls.some(call => call.route.endsWith('/tasks')));
});
test('native edit tools reject forged media fields, unsupported operations and invalid rates before HTTP', async t => {
    const calls = [];
    const client = await connected(t, { workspace: true, request: async (...args) => { calls.push(args); return {}; } });
    for (const command of [{ op: 'moveClip', id: 'video', startMs: 10, storageKey: 'resource:foreign' }, { op: 'replaceResource', id: 'video' }, { op: 'setClipPlaybackRate', id: 'video', playbackRate: 8 }, { op: 'addResource', resourceId: 'owned', media: { durationMs: 5000 } }, { op: 'addResource', resourceId: 'owned', storageKey: 'resource:foreign' }]) {
        const result = await client.callTool({ name: 'yingce_preview_timeline_edits', arguments: { projectId: 'project', requestId: 'edit-invalid-native-1234', expectedRevision: 1, commands: [command] } }); assert.equal(result.isError, true);
    }
    assert.equal(calls.length, 0);
});
test('query-only connections do not expose timeline edit writes before workspace opt-in', async t => {
    const client = await connected(t, { workspace: false, request: async () => { throw new Error('must not be reached'); } });
    assert.ok(!(await client.listTools()).tools.some(tool => tool.name.includes('timeline_edit')));
    await assert.rejects(client.callTool({ name: 'yingce_apply_timeline_edits', arguments: { projectId: 'project', requestId: 'edit-readonly-native-1234', expectedRevision: 1, commands: [{ op: 'removeClip', id: 'video' }], previewToken: 'a'.repeat(64), confirmEdit: true } }), error => error.code === -32602);
});

test('graphic edits carry fixed owned image IDs and reject unsupported settings before HTTP', async t => {
    const calls = [], client = await connected(t, { workspace: true, request: async (...args) => { calls.push(args); return { previewToken: 'a'.repeat(64) }; } });
    const graphic = { version: 1, kind: 'image', resourceId: 'owned', x: .5, y: .5, size: 64, color: '#ffffff', animation: 'rotate', bpm: 60, phaseDurationMs: 3000 };
    const input = { projectId: 'project', requestId: 'native-graphic-edit-0001', expectedRevision: 2, commands: [{ op: 'addGraphic', id: 'logo', text: 'Logo', startMs: 0, durationMs: 3000, graphic }] };
    assert.equal((await client.callTool({ name: 'yingce_preview_timeline_edits', arguments: input })).isError, undefined);
    assert.deepEqual(calls[0][2].commands, input.commands);
    assert.equal((await client.callTool({ name: 'yingce_apply_timeline_edits', arguments: { ...input, previewToken: 'a'.repeat(64) } })).isError, true);
    for (const patch of [{ resourceId: '' }, { animation: 'morph' }, { url: 'https://invalid.example/logo' }, { fontFamily: 'system-font' }, { size: 99999 }]) assert.equal((await client.callTool({ name: 'yingce_preview_timeline_edits', arguments: { ...input, commands: [{ ...input.commands[0], graphic: { ...graphic, ...patch } }] } })).isError, true);
    assert.equal(calls.length, 1);
    const restart = { op: 'setGraphic', id: 'logo', graphic, restart: true };
    assert.equal((await client.callTool({ name: 'yingce_preview_timeline_edits', arguments: { ...input, commands: [restart] } })).isError, undefined);
    assert.deepEqual(calls[1][2].commands, [restart]);
});

test('caption appearance and text use the same confirmed edit protocol with bounded fields', async t => {
    const calls = [], client = await connected(t, { workspace: true, request: async (...args) => { calls.push(args); return { previewToken: 'a'.repeat(64) }; } });
    const appearance = { version: 1, fontSize: 66, color: '#ff0000', position: 'top', backgroundColor: '#00000000', padding: 0, highlights: [{ start: 2, end: 4, sourceText: '你好🌟世界', color: '#ffff00', backgroundColor: '#111111cc', paddingX: 8, paddingY: 3, radius: 6, animation: 'wipe' }] };
    const input = { projectId: 'project', requestId: 'caption-appearance-native-0001', expectedRevision: 2, commands: [{ op: 'setCaptionPresentation', id: 'cue', captionPresentation: appearance }] };
    const preview = await client.callTool({ name: 'yingce_preview_timeline_edits', arguments: input }); assert.equal(preview.isError, undefined); assert.deepEqual(calls[0][2].commands, input.commands);
    const unconfirmed = await client.callTool({ name: 'yingce_apply_timeline_edits', arguments: { ...input, previewToken: 'a'.repeat(64) } }); assert.equal(unconfirmed.isError, true); assert.equal(calls.length, 1);
    const text = await client.callTool({ name: 'yingce_preview_timeline_edits', arguments: { ...input, commands: [{ op: 'setCaptionText', id: 'cue', text: '新的台词' }] } }); assert.equal(text.isError, undefined); assert.equal(calls.length, 2);
    for (const change of [{ fontSize: 100000 }, { color: 'red:enable=1' }, { fontSzie: 66 }]) { const result = await client.callTool({ name: 'yingce_preview_timeline_edits', arguments: { ...input, commands: [{ ...input.commands[0], captionPresentation: { ...appearance, ...change } }] } }); assert.equal(result.isError, true); }
    assert.equal(calls.length, 2); assert.ok(calls.every(call => !call[1].endsWith('/tasks')));
});

test('output format edits preserve the native confirmation and reject invalid or misspelled fields', async t => {
    const calls = [], client = await connected(t, { workspace: true, request: async (...args) => { calls.push(args); return { previewToken: 'a'.repeat(64) }; } });
    const input = { projectId: 'project', requestId: 'native-output-edit-0001', expectedRevision: 2, commands: [{ op: 'setOutput', output: { width: 384, height: 640, fps: 24, fit: 'blur' } }] };
    const result = await client.callTool({ name: 'yingce_preview_timeline_edits', arguments: input }); assert.equal(result.isError, undefined); assert.deepEqual(calls[0][2].commands, input.commands);
    const unconfirmed = await client.callTool({ name: 'yingce_apply_timeline_edits', arguments: { ...input, previewToken: 'a'.repeat(64) } }); assert.equal(unconfirmed.isError, true);
    for (const patch of [{ width: 385 }, { fps: 61 }, { fit: 'stretch' }, { frameRate: 24 }]) {
        const bad = await client.callTool({ name: 'yingce_preview_timeline_edits', arguments: { ...input, commands: [{ op: 'setOutput', output: { ...input.commands[0].output, ...patch } }] } }); assert.equal(bad.isError, true);
    }
    assert.equal(calls.length, 1);
});

test('canvas caption snapshots use an owned native read and an exact revision/hash edit contract', async t => {
    const calls = [];
    const client = await connected(t, { workspace: true, request: async (...args) => { calls.push(args); return { canvasRevision: 7, nodeSha256: 'a'.repeat(64) }; } });
    const source = { projectId: 'p', canvasId: 'c', nodeId: 'n', resourceId: 'r' };
    const result = await client.callTool({ name: 'yingce_canvas_ingest_source', arguments: source });
    assert.equal(result.isError, undefined); assert.equal(calls.length, 1); assert.equal(calls[0][0], 'GET');
    const query = new URL(calls[0][1], 'https://local.example'); assert.equal(query.searchParams.get('nodeId'), 'n');
    const input = { projectId: 'p', requestId: 'canvas-caption-test-0001', expectedRevision: 0, commands: [{ op: 'addCanvasNode', canvasId: 'c', nodeId: 'n', resourceId: 'r', canvasRevision: 7, nodeSha256: 'a'.repeat(64) }] };
    await client.callTool({ name: 'yingce_preview_timeline_edits', arguments: input });
    assert.deepEqual(calls[1][2].commands, input.commands);
    for (const change of [{ nodeSha256: 'missing' }, { captions: [{ text: 'forged' }] }]) {
        const bad = await client.callTool({ name: 'yingce_preview_timeline_edits', arguments: { ...input, commands: [{ ...input.commands[0], ...change }] } }); assert.equal(bad.isError, true);
    }
    assert.equal(calls.length, 2);
    const linked = await client.callTool({ name: 'yingce_preview_timeline_edits', arguments: { ...input, commands: [{ op: 'setCaptionLink', id: 'caption', sourceClipId: 'voice:occurrence' }] } }); assert.equal(linked.isError, undefined);
});
