import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { createServer } from '../server.mjs';

async function connected(t) {
    const calls = [], server = createServer({ workspace: true, request: async (...args) => { calls.push(args); return { result: { kind: 'review-write', replayed: false } }; } });
    const client = new Client({ name: 'native-review-contract', version: '1' });
    const [left, right] = InMemoryTransport.createLinkedPair(); await Promise.all([server.connect(left), client.connect(right)]);
    t.after(async () => { await client.close(); await server.close(); }); return { client, calls };
}
test('review creation binds a concrete version, explicit permission and stable receipt identity', async t => {
    const { client, calls } = await connected(t), args = { projectId: 'p', requestId: 'native-review-request-0001', title: '原片', target: { kind: 'asset', assetVersionId: 'v', representationId: 'rep' } };
    assert.equal((await client.callTool({ name: 'yingce_create_review', arguments: args })).isError, true); assert.equal(calls.length, 0);
    assert.equal((await client.callTool({ name: 'yingce_create_review', arguments: { ...args, confirmReview: true } })).isError, undefined);
    const { projectId, ...nativeBody } = args;
    assert.deepEqual(calls[0].slice(0, 3), ['POST', '/api/projects/p/reviews', nativeBody]);
    assert.equal((await client.callTool({ name: 'yingce_create_review', arguments: { ...args, confirmReview: true, target: { ...args.target, url: 'https://unowned.invalid/file' } } })).isError, true); assert.equal(calls.length, 1);
    await client.callTool({ name: 'yingce_review_result', arguments: { projectId: 'p', requestId: args.requestId } }); assert.equal(calls[1][1], '/api/projects/p/reviews/results?requestId=native-review-request-0001');
});
test('review feedback and rework retain occurrence and clock identities without arbitrary generated bodies', async t => {
    const { client, calls } = await connected(t), body = { requestId: 'review-comment-request-0001', targetSha256: 'a'.repeat(64), location: { timeMs: 1200, endMs: 1500, clipId: 'repeat-2' }, message: '调整第二次使用的画面', blocking: true };
    await client.callTool({ name: 'yingce_add_review_comment', arguments: { projectId: 'p', reviewId: 'r', ...body, confirmComment: true } }); assert.deepEqual(calls[0].slice(0, 3), ['POST', '/api/projects/p/reviews/r/comments', body]);
    await client.callTool({ name: 'yingce_review_rework_source', arguments: { projectId: 'p', reviewId: 'r', commentId: 'c' } }); assert.equal(calls[1][1], '/api/projects/p/reviews/r/comments/c/rework');
    assert.equal((await client.callTool({ name: 'yingce_add_review_comment', arguments: { projectId: 'p', reviewId: 'r', ...body, location: { timeMs: -1 }, confirmComment: true } })).isError, true); assert.equal(calls.length, 2);
});
test('review sharing and grant changes require confirmation and keep control flags outside native bodies', async t => {
    const { client, calls } = await connected(t), body = { requestId: 'review-share-request-0001', expiresDays: 7, allowComments: false };
    assert.equal((await client.callTool({ name: 'yingce_create_review_share', arguments: { projectId: 'p', reviewId: 'r', ...body } })).isError, true);
    await client.callTool({ name: 'yingce_create_review_share', arguments: { projectId: 'p', reviewId: 'r', ...body, confirmShare: true } }); assert.deepEqual(calls[0].slice(0, 3), ['POST', '/api/projects/p/reviews/r/shares', body]);
    assert.equal((await client.callTool({ name: 'yingce_set_review_member', arguments: { projectId: 'p', requestId: body.requestId, expectedRevision: 0, userId: 'member', role: 'owner', active: true, confirmPermission: true } })).isError, true);
    assert.equal((await client.callTool({ name: 'yingce_revoke_review_share', arguments: { projectId: 'p', reviewId: 'r', shareId: 's', requestId: body.requestId, expectedRevision: 1, confirmRevoke: true } })).isError, undefined);
    assert.equal(calls[1][1], '/api/projects/p/reviews/r/shares/s/revoke'); assert.equal(calls[1][2].confirmRevoke, undefined);
});
