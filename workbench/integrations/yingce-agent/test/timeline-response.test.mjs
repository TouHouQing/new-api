import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { YingceClient } from '../native-client.mjs';

test('native edit previews carry a bounded full timeline while unrelated routes retain the smaller response limit', async t => {
    let bytes = 5 * 1024 * 1024;
    const backend = http.createServer((req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ code: 0, data: { timeline: 'x'.repeat(bytes) } }));
    });
    await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => backend.close(resolve)));
    const client = new YingceClient({ version: 1, baseURL: 'http://127.0.0.1:' + backend.address().port, session: 'unit-test-native-session-token' });
    assert.equal((await client.request('POST', '/api/projects/owned/timeline/edits/preview', {})).timeline.length, bytes);
    await assert.rejects(client.request('POST', '/api/projects/owned/timeline/edits/apply', {}));
    bytes = 17 * 1024 * 1024;
    await assert.rejects(client.request('POST', '/api/projects/owned/timeline/edits/preview', {}));
});
