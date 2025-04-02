# TeamSpark AI Workbench

https://docs.anthropic.com/en/docs/build-with-claude/tool-use/overview

https://www.anthropic.com/news/model-context-protocol

https://modelcontextprotocol.io/

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

Priority would be:
- Amazon Bedrock
- Ollama (local Lllama, DeepSeek, etc)

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

"History" for each tool call that shows JSON request (tool name, params) and response

## Chat UX

Show references and rules included in chat context
- Show in list
- Allow removal

Allow user to @mention a rule or referencec to add them to the chat context (interactively, as you type, maybe with lookup/matching)
- @ref:[referenceName]
- @rule:[ruleName]

When a ChatMessage pulls in references or rules, should we track that in the message (in addition to adding them to the chat session)
- If we removed such a message from the chat, would we expect the ref/rule to be removed?

Allow user to @mention a toolset/tool to apply to the message
- @tool:[toolset,toolset.tool,tool] 
- Not clear if selective tool inclusion is the right idea, maybe configurable - use all tools, determine tools, explicit tool use only?)

Allow user to pick any chat element and store it as a reference

Duplicate chat

Chat import/export
- JSON file of messages/replies/references/rules

Edit chat
- Truncate makes sense
- Arbitrary message/reply removal?

Chat Debug
- Show full details of chat history (everything we sent/received on every call, including prior message context, rules, tools, references, etc)
- Maybe this is better as a specific log category/file

## Logic

Can we have an LLM help us determine refs/rules to add based on message (or other context)? 
- This could be the LLM we're using
- Or maybe we could run a local LLM that just specialized in this

## Context

Context of a chat message includes:
- System prompt
- History (chat history, tool calls, tool results, etc, possibly summarized)
- References (insights, facts, or other data provided by the user, or saved from chats)
  - @ref
- Rules (rules that apply to the chat message)
  - @rule
- Tools (tools that apply to the chat message)
  - @toolset, @tool
- User message

## Agents

We have global rules, tools, and references.
We create an agent which can have its own rules, tools, and references (in addition to the global ones)
- Agent can disable/override global
We create a chat which is associated with an agent
- Chat can override agent settings
- Chat can have its own rules, tools, and references (in addition to the agent's)?

LLM model chosen and model config applies at least to chat level?

Maybe global tools list is very large, agent/workspace is a curated subset (pulled from main list)

## Misc

Track token usage for chat session
- This is model-specific, which is a little odd (track model for metrics?)

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

## References and Rules config

Store config in YAML frontmatter

References
- Keywords - apply reference whenever these keywords appear in the user prompt (* is always)
- Tools - when this tool is used, apply this reference
- Rules - whem this rule is used, apply this reference (rule will be applied at the time of tool output processing)

Rules
- Keywords - apply rule whenever these keywords appear in the user prompt (* is always)
- Tools - when this tool is used, apply this rule (rule will be applied at the time of tool output processing)
- References - when this reference is used, apply this rule

Examples:
- ???

## Tool Permission

Allow tool from [server name]?

  Run [toolname] from [server/server name] (maybe pop this open to see server/tool config)

Malicious MCP Servers or conversation content could potentially trick xxxxx into attempting harmful actions through your installed tools.
<bold>Review each action carefully before approving</bold>

[Allow for this chat] [Allow once] [Deny]

## Keyword matching

We have references and rules with keywords (comma separated, quoted strings?, wildcards?)
- Separate by any combination of commas/spaces
We have prompt text
We want to see which reference or rules have keywords that are found in the prompt text
Ideally we want to match regardless of plurality or tense of word (Stemming via natural.js or stemmer)
We could do fuzzy matches with wildcards (Fuse.js) - only use Fuse for wildcarded keywords?  Just *?
We could also support literal quoted exact match keywords

Gather all bare keywords, stem them, stem the prompt, determine which keywords are found
Gather all quoted keywords and wildcard keywords, convert to regex, search text, determine which keywords were found
- Quoted string is word boundary before and after

## Tool matching

Each rule and reference has a list of tools
The tool list can include server or server.tool
When a tool fires, it gets the list of references and rules that match the server/server.tool

## MCP / Tools Work

Allow tool set to be enabled/disabled
- Make sure LLMs gettings tools only get enabled tools

Test support for SSE server
- Local weather server in /mcp-sse
  - uv run weather.py

## Bugs

When building tool call history, need to make sure tool names are prefixed [fixed]

When LLM returns error, need to set parts, currently (this is the error above, can't find function without prefix):

  {
    "role": "model",
    "parts": []
  },

## Demo

Select Gemini

what's my name?

@ref:about-me what's my name?

what else do you know about me?

can you put the information about the files in test_files (including file name, size, and date) into a new database table

show me what tables I have

show me the contents of file_info

Can you show me that as a table

can you make a new rule so that you will use markdown lists when returning lists of items, and you will use tables when returning multiple items with attributes

@rules:new-rule

what files are in in test_files