# TeamSpark AI Workbench

https://docs.anthropic.com/en/docs/build-with-claude/tool-use/overview

https://www.anthropic.com/news/model-context-protocol

https://modelcontextprotocol.io/

Chat message
- System prompt plus user message
- while response < max turns
  - record any text reponse (optional)
  - if any function calls
    - call functions
    - reply with function call results
  - if no function calls
    - done (break)

## Model abstraction

We probably want to have a list of providers (basically representing an API/SDK)
- Under each provider we have a list of models (with model configuration)
- So we'd have something like:
  - Google Gemini
    - Gemini 1.5 Pro
    - Gemini 1.5 Flash
    - Gemini 1.5 Pro (latest)
  - Anthropic
    - Claude 3.5 Sonnet
    - Claude 3.5 Sonnet (latest)
  - OpenAI
    - GPT-4o
    - GPT-4o (latest)

This is a decent design/start, but isn't complete or up-to-date: https://github.com/fkesheh/any-llm

Need configuration specs for models (what values they take, the type and range, description, etc)
Pricing config with default (input/output token pricing)
Need default configuration for each model

Would be nice to have db online with latest models and pricing.

It would be great to have it pluggable, but maybe later.

Do we have a Models tab that lists all the models and let's you view/update their default config?

If we tied a chat window to a model, we could have a "settings" button that lets you override the model settings for that chat.

## Tools

mcp client can specify cwd to stdio transport (workspace implications)

To run MCP test app: npx @modelcontextprotocol/inspector

Resources
Resource templates?
Prompts?
Tools

Test tool - collect params, run, show output
- Show tool name/description
- For for params (incliding array params)
- Test Tool button
- Tool output shown below

"History" for each tool call that shows JSON request (tool name, params) and response

When configuring a new tool (or when saving it?) - test connection to tool?  Test button option?  Ping?

Need a way to collect server error stream and display (esp for new server / connection type errors)

## Rules

MCP (internal) for rule CRUD

## Rerefences

MCP (internal) for reference CRUD

Is/can reference be local to a chat, or attached to a role/agent definition, or global?

Need way to control chat session context (message history, both sides, including tool calls and results)

## Misc UX

Show tool calls / results in chat in compact items where you can click for full details

Show tools/rules/contexts included in chat somehow?

Allow user to @mention a tool, rule, or context to force include in the chat

Allow user to pick any chat element and store it as context

Maybe as you type we add in scope that you can see (and you can remove if you don't want it)

Debug logic
- Show full details of chat history (everything we sent/received on every call, including prior message context, rules, tools, contexts, etc)

## Logic

Can we have an LLM help us determine scope for a chat message? 
- This could be the LLM we're using
- Or maybe we could run a local LLM that just specialized in this

## Context

Context of a chat message includes:
- System prompt
- User message
- History (chat history, tool calls, tool results, etc, possibly summarized)
- References (insights, facts, or other data provided by the user, or saved from chats)
  - @ref
- Rules (rules that apply to the chat message)
  - @rule
- Tools (tools that apply to the chat message)
  - @toolset, @tool

## Agents

We have global rules, tools, and references.
We create an agent which can have its own rules, tools, and references (in addition to the global ones)
- Agent can disable/override global
We create a chat which is associated with an agent
- Chat can override agent settings
- Chat can have its own rules, tools, and references (in addition to the agent's)?

LLM model chosen and model config applies at least to chat level?

## Misc

Export/import agent/chat (bag of files?)

Track token usage for chat session

Save chat session?

Would a hosted version of this be useful?
- Refs and rules would work fine
- Not clear what tools could be made to work on a hosted server

Maybe we have the concept of a "Workspace" which is a collection of all of our stuff (config, chats)
- workspaces.json (/config) - list of workspaces
- workbench.json - config for workspace itself (is there any?  Agent name, notes?)
- mcp-servers.json - config for MCP servers (or do we put in workspace config?)
- prompt.md (put this in workspace config?)
- refs (dir of md files)
- rules (dir of md files)

A rule could refer to a reference or a toolset/tool (or any combination of instances of both)
- When the users asks about files, use [tool:filesystem](tool:filesystem)
- When the user asks about the product, use [ref:product](ref:product)

A rule could be correlated to a reference or a toolset/tool
- Anytime you use this reference or tool, this rule will be applied
- In rule frontmatter:
  - terms: file directory
  - tool: filesystem (anytime you use filesystem tools, this rule will be applied)
  - ref: product (anytime you use this reference, this rule will be applied)
