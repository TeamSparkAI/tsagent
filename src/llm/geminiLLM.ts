import { ILLM } from './types.js';
import { GenerativeModel, GoogleGenerativeAI, Tool as GeminiTool, SchemaType, ModelParams } from '@google/generative-ai';
import { config } from '../config.js';
import { Tool } from "@modelcontextprotocol/sdk/types";
import { LLMStateManager } from './stateManager.js';

export class GeminiLLM implements ILLM {
  private model: GenerativeModel;
  private stateManager: LLMStateManager;
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

  constructor(modelName: string, stateManager: LLMStateManager) {
    if (!config.geminiKey) {
      throw new Error('GEMINI_API_KEY must be provided');
    }
    const genAI = new GoogleGenerativeAI(config.geminiKey);
    const mcpTools = stateManager.getAllTools();
    const modelOptions: ModelParams = { model: modelName };
    
    if (mcpTools.length > 0) {
      const tools = this.convertMCPToolsToGeminiTool(mcpTools);
      modelOptions.tools = [tools];
    }
    
    this.model = genAI.getGenerativeModel(modelOptions);
    this.stateManager = stateManager;
  }

  async generateResponse(prompt: string): Promise<string> {
    try {
      const chat = this.model.startChat({
        history: [{
          role: "user",
          parts: [{ text: this.stateManager.getSystemPrompt() }]
        }]
      });

      const finalText = [];
      let turnCount = 0;
      let currentPrompt = prompt;

      while (turnCount < this.MAX_TURNS) {
        turnCount++;
        console.log(`Sending message prompt "${prompt}", turn count: ${turnCount}`);
        const result = await chat.sendMessage(currentPrompt);
        const response = result.response;

        console.log('response', JSON.stringify(response, null, 2));

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
              console.log('Function call detected:', part.functionCall);

              // Call the tool
              const toolResult = await this.stateManager.callTool(
                name,
                args as Record<string, unknown>
              );
              console.log('Tool result:', toolResult);

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
      console.error('Gemini API error:', error);
      const errorMessage = error.message || 'Unknown error';
      return `Error: Failed to generate response from Gemini - ${errorMessage}`;
    }
  }
} 