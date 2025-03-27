import { MCPClientManager } from '../mcp/manager';
import { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types";

export class LLMStateManager {

  private mcpManager: MCPClientManager;

  constructor(mcpManager: MCPClientManager) {
    this.mcpManager = mcpManager;
  }

  getAllTools(): Tool[] {
    return this.mcpManager.getAllTools();
  }

  async callTool(name: string, args?: Record<string, unknown>): Promise<CallToolResult> {
    return this.mcpManager.callTool(name, args);
  }
}