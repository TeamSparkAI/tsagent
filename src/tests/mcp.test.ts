import { MCPClientImpl } from '../mcp/client';
import path from 'path';

describe('MCP Client', () => {
    let client: MCPClientImpl;

    beforeEach(() => {
        client = new MCPClientImpl();
    });

    afterEach(async () => {
        await client.cleanup();
    });

    it('should connect to a server and list tools', async () => {
        // You'll need to provide path to an actual MCP server script
        // const serverPath = path.join(__dirname, '../../examples/server.py');
        // const tools = await client.connectToServer(serverPath);
        // expect(Array.isArray(tools)).toBe(true);
    });
}); 