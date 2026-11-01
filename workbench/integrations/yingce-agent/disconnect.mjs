import fs from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { loadProfile } from './native-client.mjs';

try {
    const { values } = parseArgs({ options: { profile: { type: 'string' } } });
    if (!values.profile) throw new Error('需要 --profile。');
    const client = await loadProfile(values.profile);
    await client.request('POST', '/api/auth/logout', {});
    await fs.unlink(values.profile);
    process.stdout.write('THQ Video连接已注销，本机连接文件已移除。\n');
} catch {
    process.stderr.write('未能确认注销，连接文件已保留；请在THQ Video账号的会话管理中撤销。\n');
    process.exitCode = 1;
}
