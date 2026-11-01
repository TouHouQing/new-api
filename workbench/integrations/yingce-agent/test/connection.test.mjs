import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { connect } from '../connect.mjs';
import { loadProfile, YingceClient, profileSchema } from '../native-client.mjs';

test('hosted MCP uses an explicit host PAT, preserves its API mount and cannot escape the origin', async t => {
    const backend = http.createServer((req,res) => {
        assert.equal(req.url,'/api/workbench-agent/projects');
        assert.equal(req.headers.authorization,'Bearer manually-provisioned-host-pat');
        assert.equal(req.headers.cookie,undefined);
        res.setHeader('Content-Type','application/json');
        res.end(JSON.stringify({code:0,data:{projects:[]}}));
    });
    await new Promise(resolve=>backend.listen(0,'127.0.0.1',resolve));
    t.after(()=>new Promise(resolve=>backend.close(resolve)));
    const profile = profileSchema.parse({version:1,baseURL:'http://127.0.0.1:'+backend.address().port,session:'manually-provisioned-host-pat',apiPrefix:'/api/workbench-agent'});
    const client = new YingceClient(profile);
    assert.deepEqual(await client.request('GET','/api/projects'),{projects:[]});
    assert.match(client.canvasURL('canvas-id'),/\/workbench\/canvas\/canvas-id\?/);
    await assert.rejects(client.request('GET','/api/../../outside'));
    await assert.rejects(client.request('GET','https://example.com/api/projects'));
    assert.equal(profileSchema.safeParse({...profile,apiPrefix:'/outside'}).success,false);
});

test('login profile, actual stdio process, native session and explicit logout', async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yingce-connection-test-'));
    const profile = path.join(directory, 'connection.json'), credentials = path.join(directory, 'credentials.json');
    t.after(async () => {
        for (const file of [profile, credentials]) await fs.unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
        await fs.rmdir(directory);
    });
    let loginCount = 0, revoked = false;
    const backend = http.createServer(async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.url === '/api/auth/login') {
            loginCount++;
            const parts = []; for await (const part of req) parts.push(part);
            const value = JSON.parse(Buffer.concat(parts).toString());
            assert.equal(value.password, 'test-password-not-for-logs');
            res.setHeader('Set-Cookie', 'open_ai_canvas_session=owned-native-session-token; Path=/; HttpOnly');
            res.end(JSON.stringify({ code: 0, data: { user: { id: 'owned-user' } } })); return;
        }
        assert.equal(req.headers.cookie, 'open_ai_canvas_session=owned-native-session-token');
        if (req.url === '/api/auth/logout') revoked = true;
        const data = req.url === '/api/auth/session' ? { user: revoked ? null : { id: 'owned-user' } } :
            req.url === '/api/agent/capabilities' ? { tools: ['image_process'], writeTools: true } : { ok: true };
        res.end(JSON.stringify({ code: 0, data }));
    });
    await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => backend.close(resolve)));
    await fs.writeFile(credentials, JSON.stringify({ username: 'test-user', password: 'test-password-not-for-logs' }), { mode: 0o600 });
    const result = await connect({ profile, 'base-url': 'http://127.0.0.1:' + backend.address().port, 'credentials-file': credentials });
    assert.equal(result.agentRunsEnabled, false);
    assert.ok(!JSON.stringify(result).includes('session-token'));
    assert.ok(!(await fs.readFile(profile, 'utf8')).includes('test-password'));
    const native = await loadProfile(profile);
    await assert.rejects(connect({ profile, 'base-url': result.baseURL, 'credentials-file': credentials }));
    assert.equal(loginCount, 1);
    const transport = new StdioClientTransport({ command: process.execPath, args: [path.resolve(import.meta.dirname, '../mcp.mjs')], env: { ...process.env, YINGCE_PROFILE: profile }, stderr: 'pipe' });
    const client = new Client({ name: 'yingce-stdio-regression', version: '1.0.0' });
    try {
        await client.connect(transport);
        assert.equal((await client.listTools()).tools.length, 11);
        const response = await client.callTool({ name: 'yingce_capabilities', arguments: {} });
        assert.deepEqual(response.structuredContent.tools, ['image_process']);
    } finally { await client.close(); }
    const legacyTransport = new StdioClientTransport({ command: process.execPath, args: [path.resolve(import.meta.dirname, '../mcp.mjs')], env: { ...process.env, YINGCE_PROFILE: profile }, stderr: 'pipe' });
    let legacyInitialized = false;
    const send = legacyTransport.send.bind(legacyTransport);
    legacyTransport.send = (message, ...args) => { if (message.method === 'initialize') legacyInitialized = true; return send(message, ...args); };
    const legacy = new Client({ name: 'yingce-legacy-regression', version: '1.0.0' }, { supportedProtocolVersions: ['2025-11-25'] });
    try {
        await legacy.connect(legacyTransport);
        assert.equal(legacyInitialized, true);
        assert.equal((await legacy.listTools()).tools.length, 11);
    } finally { await legacy.close(); }
    assert.equal((await native.request('GET', '/api/auth/session')).user.id, 'owned-user');
    const disconnected = await promisify(execFile)(process.execPath, [path.resolve(import.meta.dirname, '../disconnect.mjs'), '--profile', profile]);
    assert.ok(!disconnected.stdout.includes('session-token'));
    assert.equal((await native.request('GET', '/api/auth/session')).user, null);
    await assert.rejects(fs.stat(profile), error => error.code === 'ENOENT');
});
