# Local Provider Tool Calling Implementation Plan

## Overview

Implement tool calling for the Local provider using `node-llama-cpp`'s `promptWithMeta` with an abort-based approval workflow. This approach uses our own `AbortController` to pause generation after function calls are processed but before the model continues generating with placeholder results.

**Key Optimization**: Tools that don't require approval are executed directly in the handler and return real results immediately, avoiding the abort/approval workflow entirely. Only tools requiring approval use the abort mechanism.

## Architecture

### Core Concept
- Use `promptWithMeta` with `stopOnAbortSignal: true`
- Create our own `AbortController` and pass its `signal` to `promptWithMeta`
- Function handlers call `abortController.abort()` and return pending tool call data
- Generation stops after function calls are added to chat history but before continuing
- Handle approval workflow, then resume with `promptWithMeta` using real results

### Function Call Flow
1. **Initial Generation**: Model generates function calls
2. **Handler Execution**: 
   - If tool doesn't require approval: Execute tool directly and return real result
   - If tool requires approval: Return pending tool call data and abort
3. **Chat History Update**: Function calls with results (real or pending) are added to history
4. **Generation Stop**: Only stops if approval is required (abort signal)
5. **Approval Workflow**: Process pending tool calls for user approval (only if needed)
6. **Resume Generation**: Call `promptWithMeta` again with real tool results (only if approval was needed)

## Implementation Details

### 1. Tool Call Data Structure

#### Pending Tool Call (returned by handler)
```typescript
interface PendingToolCall {
  toolCallId: string;
  toolName: string;
  params: any;
  pending: true;
  timestamp: number;
}
```

#### Completed Tool Call (after approval)
```typescript
interface CompletedToolCall {
  toolCallId: string;
  toolName: string;
  params: any;
  pending: false;
  result: any;
  timestamp: number;
}
```

### 2. Function Call Representation in Chat History

Based on `node-llama-cpp`'s `addFunctionCallToChatHistory`:

```typescript
// Assistant message with function call
{
  type: "model",
  response: [
    {
      type: "functionCall",
      name: "tool_name",
      description: "Tool description",
      params: { /* tool parameters */ },
      result: { /* tool result or pending data */ },
      rawCall: { /* raw function call from model */ }
    }
  ]
}
```

### 3. Handler Implementation

```typescript
const abortController = new AbortController();

const llamaCppTools = {};
for (const tool of tools) {
  llamaCppTools[tool.name] = {
    description: tool.description || '',
    params: tool.inputSchema,
    handler: async (params: any) => {
      // Check if tool requires approval
      const requiresApproval = await session.isToolApprovalRequired(tool.serverName, tool.toolName);
      
      if (!requiresApproval) {
        // Execute tool directly and return real result
        const toolResult = await ProviderHelper.callTool(this.agent, tool.name, params, session);
        return toolResult.content[0]?.text || 'Tool executed successfully';
      }
      
      // Tool requires approval - use abort workflow
      const toolCallId = generateToolCallId();
      const pendingCall: PendingToolCall = {
        toolCallId,
        toolName: tool.name,
        params,
        pending: true,
        timestamp: Date.now()
      };
      
      // Abort generation after this function call is processed
      abortController.abort();
      
      return pendingCall;
    }
  };
}
```

### 4. Generation Loop Integration

#### Initial Setup and Chat History Conversion
```typescript
// Convert ChatMessage[] to node-llama-cpp chat history format
const initialChatHistory = convertChatMessagesToLlamaCppHistory(messages, systemPrompt);

// Create chat session with initial history
const chatSession = await model.createChatSession({
  systemPrompt: systemPrompt
});

// Set the initial chat history
chatSession.setChatHistory(initialChatHistory);

// Create abort controller for this generation
const abortController = new AbortController();
```

#### Multi-Turn Generation Loop
```typescript
let turns = 0;
const maxTurns = session.getState().maxChatTurns;

while (turns < maxTurns) {
  turns++;
  
  // Create abort controller for this turn
  const abortController = new AbortController();
  const llamaCppTools = this.buildLlamaCppTools(tools, abortController);
  
  // Call promptWithMeta for this turn
  const result = await chatSession.promptWithMeta('', {
    functions: llamaCppTools,
    signal: abortController.signal,
    stopOnAbortSignal: true,
    // ... other options
  });
  
  // If we didn't abort (no tools or generation complete), we're done
  if (!(result.stopReason === "abort" && abortController.signal.aborted)) {
    return result;
  }
  
  // We aborted due to tool calls - process them
  const currentChatHistory = chatSession.getChatHistory();
  const completedCalls = await this.processPendingToolCalls(currentChatHistory, tools, session);
  
  // If no tool calls were actually completed, stop to avoid infinite loop
  if (completedCalls.length === 0) {
    break;
  }
  
  // Update chat history with completed tool calls
  const updatedChatHistory = updateChatHistoryWithToolResults(currentChatHistory, completedCalls);
  chatSession.setChatHistory(updatedChatHistory);
  
  // Loop continues - next iteration will call promptWithMeta again with updated history
}

// If we hit max turns, return the last result or error
return result || { error: 'Maximum number of tool uses reached' };
```

#### Process Pending Tool Calls
```typescript
async processPendingToolCalls(
  chatHistory: any[], 
  tools: MCPTool[], 
  session: ChatSession
): Promise<CompletedToolCall[]> {
  const completedCalls: CompletedToolCall[] = [];
  
  // Find pending tool calls in chat history (only tools that required approval)
  for (const item of chatHistory) {
    if (item.type === "model" && item.response) {
      for (const responseItem of item.response) {
        if (responseItem.type === "functionCall" && responseItem.result?.pending === true) {
          const pendingCall = responseItem.result;
          const tool = tools.find(t => t.name === pendingCall.toolName);
          
          if (!tool) continue;
          
          // Get user approval (this tool required approval to get here)
          const approved = await this.getToolApproval(pendingCall, tool, session);
          if (!approved) {
            continue; // User rejected - skip this tool call
          }
          
          // Execute the tool
          const toolResult = await this.executeTool(tool, pendingCall.params, session);
          
          completedCalls.push({
            ...pendingCall,
            pending: false,
            result: toolResult
          });
        }
      }
    }
  }
  
  return completedCalls;
}
```

### 5. Chat History Management

#### Convert ChatMessage[] to LlamaCpp History Format
```typescript
function convertChatMessagesToLlamaCppHistory(messages: ChatMessage[], systemPrompt: string): any[] {
  const history: any[] = [];
  
  // Add system message if present
  if (systemPrompt) {
    history.push({
      type: "system",
      text: systemPrompt
    });
  }
  
  for (const message of messages) {
    if (message.role === 'system') {
      continue; // Already handled above
    }
    
    if ('modelReply' in message) {
      // Assistant response with potential tool calls
      for (const turn of message.modelReply.turns) {
        if (turn.message) {
          history.push({
            type: "model",
            response: [turn.message]
          });
        }
        
        // Add tool calls if any
        if (turn.toolCalls && turn.toolCalls.length > 0) {
          for (const toolCall of turn.toolCalls) {
            history.push({
              type: "model",
              response: [{
                type: "functionCall",
                name: toolCall.serverName + '_' + toolCall.toolName,
                description: "", // Will be filled by tool definition
                params: toolCall.args,
                result: toolCall.output,
                rawCall: undefined
              }]
            });
          }
        }
      }
    } else if (message.role === 'user' && 'content' in message) {
      history.push({
        type: "user",
        text: message.content
      });
    }
  }
  
  return history;
}
```


#### Update Chat History with Tool Results
```typescript
function updateChatHistoryWithToolResults(
  chatHistory: any[],
  completedCalls: CompletedToolCall[]
): any[] {
  const updatedHistory = [...chatHistory];
  
  // Find and update pending tool calls with real results
  for (let i = 0; i < updatedHistory.length; i++) {
    const item = updatedHistory[i];
    
    if (item.type === "model" && item.response) {
      for (let j = 0; j < item.response.length; j++) {
        const responseItem = item.response[j];
        
        if (responseItem.type === "functionCall" && responseItem.result?.pending === true) {
          const completedCall = completedCalls.find(
            c => c.toolCallId === responseItem.result.toolCallId
          );
          
          if (completedCall) {
            // Update the function call result
            updatedHistory[i].response[j].result = {
              ...completedCall,
              pending: false
            };
          }
        }
      }
    }
  }
  
  return updatedHistory;
}
```

### 6. Integration with Existing Provider Interface

#### Update generateResponse Method
```typescript
async generateResponse(
  session: ChatSession,
  messages: ChatMessage[]
): Promise<ModelReply> {
  const modelReply: ModelReply = {
    timestamp: Date.now(),
    turns: []
  };

  try {
    // Convert ChatMessage[] to node-llama-cpp chat history format
    const systemPrompt = this.buildSystemPrompt(session);
    const initialChatHistory = convertChatMessagesToLlamaCppHistory(messages, systemPrompt);
    
    // Create chat session with initial history
    const chatSession = await this.model.createChatSession({
      systemPrompt: systemPrompt
    });
    
    // Set the initial chat history
    chatSession.setChatHistory(initialChatHistory);
    
    // Create abort controller for this generation
    const abortController = new AbortController();
    
    // Build tools for this generation
    const tools = await ProviderHelper.getIncludedTools(this.agent, session);
    const llamaCppTools = this.buildLlamaCppTools(tools, abortController);
    
    // Multi-turn generation loop
    let turns = 0;
    const maxTurns = session.getState().maxChatTurns;
    let result: any;

    while (turns < maxTurns) {
      turns++;
      
      // Create abort controller for this turn
      const abortController = new AbortController();
      const llamaCppTools = this.buildLlamaCppTools(tools, abortController);
      
      // Call promptWithMeta for this turn
      result = await chatSession.promptWithMeta('', {
        functions: llamaCppTools,
        signal: abortController.signal,
        stopOnAbortSignal: true,
        // ... other options
      });
      
      // If we didn't abort (no tools or generation complete), we're done
      if (!(result.stopReason === "abort" && abortController.signal.aborted)) {
        break;
      }
      
      // We aborted due to tool calls - process them
      const currentChatHistory = chatSession.getChatHistory();
      const completedCalls = await this.processPendingToolCalls(currentChatHistory, tools, session);
      
      // If no tool calls were actually completed, stop to avoid infinite loop
      if (completedCalls.length === 0) {
        break;
      }
      
      // Update chat history with completed tool calls
      const updatedChatHistory = updateChatHistoryWithToolResults(currentChatHistory, completedCalls);
      chatSession.setChatHistory(updatedChatHistory);
      
      // Loop continues - next iteration will call promptWithMeta again with updated history
    }

    // Convert result to ModelReply
    return this.convertResultToModelReply(result);
    
  } catch (error) {
    // ... error handling ...
  }
}
```

#### Tool Approval Integration
```typescript
async getToolApproval(pendingCall: PendingToolCall, tool: MCPTool, session: ChatSession): Promise<boolean> {
  // Use existing approval workflow from other providers
  if (this.agent.settings.requireApprovalForTools) {
    return await this.agent.requestToolApproval({
      toolName: pendingCall.toolName,
      params: pendingCall.params,
      description: tool.description
    });
  }
  
  return true; // Auto-approve if not required
}

async executeTool(tool: MCPTool, params: any, session: ChatSession): Promise<any> {
  // Use existing tool execution from ProviderHelper
  return await ProviderHelper.callTool(this.agent, tool.name, params, session);
}
```

## Error Handling

### Abort Signal Conflicts
- Ensure our `AbortController` is the only one that can abort
- Handle cases where external signals might interfere
- Provide clear error messages for abort conflicts

### Tool Execution Failures
- Handle tool execution errors gracefully
- Provide fallback behavior for failed tools
- Log tool execution failures appropriately

### Chat History Corruption
- Validate chat history structure after updates
- Handle malformed function call data
- Provide recovery mechanisms for corrupted history

## Testing Strategy

### Unit Tests
- Test handler creation and abort behavior
- Test pending tool call extraction
- Test chat history updates
- Test approval workflow integration

### Integration Tests
- Test full tool calling flow with real tools
- Test multiple concurrent tool calls
- Test approval rejection scenarios
- Test error recovery paths

### Edge Cases
- Empty tool call results
- Malformed tool call data
- Abort signal timing issues
- Chat history corruption scenarios

## Migration Considerations

### Backward Compatibility
- Ensure existing Local provider functionality remains intact
- Provide fallback for non-tool-calling scenarios
- Maintain existing error handling patterns

### Performance Impact
- Minimize overhead of abort-based approach
- Optimize chat history updates
- Consider caching strategies for repeated tool calls

## Future Enhancements

### Parallel Tool Execution
- Support multiple concurrent tool calls
- Optimize approval workflow for batch operations
- Implement tool call dependency resolution

### Advanced Approval Features
- Tool call preview and modification
- Batch approval for multiple tools
- Approval templates and presets

### Monitoring and Analytics
- Track tool call success rates
- Monitor approval workflow performance
- Provide tool usage analytics


# Chat history examples:

12:23:20.618 › Chat history: [
  {
    "type": "system",
    "text": "You are an autonomous agent that can take actions and provide information in response to prompts from other agents.  You must provide complete answers without requesting any additional information."
  },
  {
    "type": "user",
    "text": "hello"
  },
  {
    "type": "model",
    "response": [
      "call: getSomeInfo({\"someKey\": \"someValue\"})"
    ]
  }
]

12:24:36.890 › Chat history: [
  {
    "type": "system",
    "text": "You are an autonomous agent that can take actions and provide information in response to prompts from other agents.  You must provide complete answers without requesting any additional information."
  },
  {
    "type": "user",
    "text": "what directories can you see"
  },
  {
    "type": "model",
    "response": [
      {
        "type": "functionCall",
        "name": "filesystem_list_allowed_directories",
        "description": "Returns the list of directories that this server is allowed to access. Subdirectories within these allowed directories are also accessible. Use this to understand which directories and their nested paths are available before trying to access files.",
        "params": {},
        "result": {
          "params": {}
        },
        "rawCall": [
          "||call: filesystem_list_allowed_directories",
          {
            "type": "specialTokensText",
            "value": "("
          },
          "{}",
          {
            "type": "specialTokensText",
            "value": ")"
          }
        ]
      },
      {
        "type": "functionCall",
        "name": "filesystem_list_directory_with_sizes",
        "description": "Get a detailed listing of all files and directories in a specified path, including sizes. Results clearly distinguish between files and directories with [FILE] and [DIR] prefixes. This tool is useful for understanding directory structure and finding specific files within a directory. Only works within allowed directories.",
        "params": {
          "path": "root",
          "sortBy": "size"
        },
        "result": {
          "params": {
            "path": "root",
            "sortBy": "size"
          }
        },
        "rawCall": [
          "||call: filesystem_list_directory_with_sizes",
          {
            "type": "specialTokensText",
            "value": "("
          },
          "{\"path\": \"root\", \"sortBy\": \"size\"}",
          {
            "type": "specialTokensText",
            "value": ")"
          }
        ]
      },
      {
        "type": "functionCall",
        "name": "filesystem_directory_tree",
        "description": "Get a recursive tree view of files and directories as a JSON structure. Each entry includes 'name', 'type' (file/directory), and 'children' for directories. Files have no children array, while directories always have a children array (which may be empty). The output is formatted with 2-space indentation for readability. Only works within allowed directories.",
        "params": {
          "path": "root"
        },
        "result": {
          "params": {
            "path": "root"
          }
        },
        "rawCall": [
          "||call: filesystem_directory_tree",
          {
            "type": "specialTokensText",
            "value": "("
          },
          "{\"path\": \"root\"}",
          {
            "type": "specialTokensText",
            "value": ")"
          }
        ]
      },
      "Please note that the result objects contain the parameters used for the function calls and are not the actual output."
    ]
  },
  {
    "type": "user",
    "text": "what directories can you see"
  },
  {
    "type": "model",
    "response": [
      "I'm sorry, but I'm unable to directly access or retrieve the list of directories that my server can see. My capabilities are limited to the functions provided to me, and I cannot perform actions outside of calling these functions. If you would like to know which directories are accessible, you can use the appropriate function to retrieve that information within your own environment."
    ]
  }
]