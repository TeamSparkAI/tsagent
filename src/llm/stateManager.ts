import { MCPClientManager } from '../mcp/manager';
import { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types";
import { ILLM } from './types';

export class LLMStateManager {
  private systemPrompt: string = '';
  private rules: string[];
  private documents: Map<string, string>;
  private mcpManager: MCPClientManager;

  constructor(mcpManager: MCPClientManager) {
    this.rules = [];
    this.documents = new Map();
    this.mcpManager = mcpManager;
  }

  setSystemPrompt(prompt: string) {
    this.systemPrompt = prompt;
  }

  getSystemPrompt(): string {
    return this.systemPrompt;
  }

  getAllTools(): Tool[] {
    return this.mcpManager.getAllTools();
  }

  async callTool(name: string, args?: Record<string, unknown>): Promise<CallToolResult> {
    return this.mcpManager.callTool(name, args);
  }

  addRule(rule: string) {
    this.rules.push(rule);
  }

  getRules(): string[] {
    return this.rules;
  }

  addDocument(id: string, content: string) {
    this.documents.set(id, content);
  }

  getDocument(id: string): string | undefined {
    return this.documents.get(id);
  }

  async generateResponse(prompt: string, llm: ILLM): Promise<string> {
    const fullPrompt = `${this.systemPrompt}\n\nUser: ${prompt}\nAssistant:`;
    return await llm.generateResponse(fullPrompt);
  }
} 