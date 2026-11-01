import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { loadProfile } from './native-client.mjs';
import { createServer } from './server.mjs';

try {
    const client = await loadProfile(process.env.YINGCE_PROFILE);
    const server = createServer(client);
    await server.connect(new StdioServerTransport());
} catch {
    process.stderr.write('影策 MCP 启动失败，请检查 YINGCE_PROFILE、连接文件和运行依赖。\n');
    process.exitCode = 1;
}
