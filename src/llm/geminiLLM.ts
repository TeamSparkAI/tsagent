import { ILLM } from './types';
import { GoogleGenerativeAI, Tool as GeminiTool, SchemaType } from '@google/generative-ai';
import { Tool } from "@modelcontextprotocol/sdk/types";
import { LLMStateManager } from './stateManager';
import { ConfigManager } from '../state/ConfigManager';
import log from 'electron-log';

export class GeminiLLM implements ILLM {
  private genAI: GoogleGenerativeAI | null = null;
  private model: any = null;
  private initialized = false;
  private readonly modelName: string;
  private readonly stateManager: LLMStateManager;
  private readonly configManager: ConfigManager;
  private readonly MAX_TURNS = 5;  // Maximum number of tool use turns

  private convertPropertyType(prop: any): { type: string; items?: { type: string } } {
    const baseType = (prop.type || "string").toUpperCase();
    if (baseType === "ARRAY") {
      return {
        type: baseType,
        items: {
          type: "STRING" // Default to STRING for array items
        }
      };
    }
    return { type: baseType };
  }

  private convertMCPToolsToGeminiTool(mcpTools: Tool[]): GeminiTool {
    return {
      functionDeclarations: mcpTools.map(mcpTool => {
        const properties = mcpTool.inputSchema.properties || {};
        const declaration: any = {
          name: mcpTool.name,
          description: mcpTool.description || ''
        };

        if (Object.keys(properties).length > 0) {
          declaration.parameters = {
            type: SchemaType.OBJECT,
            properties: Object.entries(properties).reduce((acc, [key, value]) => {
              const prop: any = {
                ...this.convertPropertyType(value)
              };
              
              const desc = (value as any).description;
              if (desc && desc.trim()) {
                prop.description = desc;
              }
              
              return {
                ...acc,
                [key]: prop
              };
            }, {})
          };
        }

        return declaration;
      })
    };
  }

  constructor(modelName: string, stateManager: LLMStateManager, configManager: ConfigManager) {
    this.modelName = modelName;
    this.stateManager = stateManager;
    this.configManager = configManager;
    this.initialize();
  }

  async initialize(): Promise<void> {
    try {
      const apiKey = await this.configManager.getConfigValue('GEMINI_API_KEY');
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({ model: this.modelName });
      this.initialized = true;
      log.info('Gemini LLM initialized successfully');
    } catch (error) {
      log.error('Failed to initialize Gemini LLM:', error);
      throw error;
    }
  }

  async generateResponse(prompt: string): Promise<string> {
    try {
      const chat = this.model.startChat({
        history: [{
          role: "user",
          parts: [{ text: this.stateManager.getSystemPrompt() }]
        }],
      });

      const finalText = [];
      let turnCount = 0;
      let currentPrompt = prompt;

      while (turnCount < this.MAX_TURNS) {
        turnCount++;
        log.info(`Sending message prompt "${prompt}", turn count: ${turnCount}`);
        const result = await chat.sendMessage(currentPrompt);
        const response = result.response;

        log.info('response', JSON.stringify(response, null, 2));

        // Process all parts of the response
        let hasFunctionCalls = false;
        const toolResults: string[] = [];
        
        const candidates = response.candidates?.[0];
        if (candidates?.content?.parts) {
          for (const part of candidates.content.parts) {
            // Handle text parts
            if (part.text) {              
              finalText.push(part.text.replace(/\\n/g, '\n'));
            }
            
            // Handle function calls
            if (part.functionCall?.name && part.functionCall?.args) {
              hasFunctionCalls = true;
              const { name, args } = part.functionCall;
              log.info('Function call detected:', part.functionCall);

              // Call the tool
              const toolResult = await this.stateManager.callTool(
                name,
                args as Record<string, unknown>
              );
              log.info('Tool result:', toolResult);

              // Record the function call and result
              finalText.push(
                `[Calling function ${name} with args ${JSON.stringify(args)}]`
              );
              
              if (toolResult.content[0]?.type === 'text') {
                const resultText = toolResult.content[0].text;
                finalText.push(`[Function returned: ${resultText}]`);
                toolResults.push(resultText);
              }
            }
          }
          
          // If there were function calls, continue the conversation with all results
          if (hasFunctionCalls) {
            currentPrompt = `The functions returned:\n${toolResults.join('\n')}`;
            continue;
          }
        }

        break;
      }

      if (turnCount >= this.MAX_TURNS) {
        finalText.push("\n[Maximum number of function calls reached]");
      }

      return finalText.join('\n');

    } catch (error: any) {
      log.error('Gemini API error:', error);
      const errorMessage = error.message || 'Unknown error';
      return `Error: Failed to generate response from Gemini - ${errorMessage}`;
    }
  }
} 