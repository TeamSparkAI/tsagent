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
  - Bedrock
    - Many
  - Ollama
    - Llame 3.2
    - DeepSeek

This is a decent design/start, but isn't complete or up-to-date: https://github.com/fkesheh/any-llm

Need configuration specs for models (what values they take, the type and range, description, etc)
Pricing config with default (input/output token pricing)
Need default configuration for each model

Would be nice to have db online with latest models and pricing.

It would be great to have it pluggable, but maybe later.

Do we have a Models tab that lists all the models and let's you view/update their default config?

If we tied a chat window to a model, we could have a "settings" button that lets you override the model settings for that chat.

## Usage

Currently we track token usage at the LLM response level, but we don't accumulate them on each turn.
We should probably record the token usage on each turn and accumulate them for the overall LlmReply.
It would be nice to expose this in the UX (turn counts and total counts for a given reply).

Track token usage for chat session

Track cost for call/session
- This could be tricky if we allow model switches in a session.

## Tools

mcp client can specify cwd to stdio transport (workspace implications)

To run MCP test app: npx @modelcontextprotocol/inspector

Resources
Resource templates?
Prompts?
Tools

"History" for each tool call that shows JSON request (tool name, params) and response

## Chat UX

Allow user to @mention a rule or referencec to add them to the chat context (interactively, as you type, maybe with lookup/matching)
- @ref:[referenceName]
- @rule:[ruleName]

Allow user to @mention a toolset/tool to apply to the message
- @tool:[toolset,toolset.tool,tool] 
- Not clear if selective tool inclusion is the right idea, maybe configurable - use all tools, determine tools, explicit tool use only?)

Allow user to pick any chat element and store it as a reference

Clone chat tab

Chat import/export
- JSON file of messages/replies/references/rules

Edit chat
- Truncate makes sense
- Arbitrary message/reply removal?

Chat Debug
- Show full details of chat history (everything we sent/received on every call, including prior message context, rules, tools, references, etc)
- Maybe this is better as a specific log category/file

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

Would a hosted version of this be useful?
- Refs and rules would work fine
- Not clear what tools could be made to work on a hosted server

## References and Rules config

Include: Always, Auto Attached, Agent Requested, Manual (these are the Cursor options)
- Add tool to include/exclude ref/rule from current chat session (maybe see which refs/rules are attached/available)

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

Allow tool call from [server name]?

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

## Workspaces Issues

Structure
- workspaces.json (in app files directory) - list of workspaces
- In a workdspace directory:
  - worksapce.json - config for workspace itself (name, description, last accessed?)
  - mcp-servers.json - config for MCP servers (or do we put in workspace config?)
  - prompt.md (put this in workspace config?)
  - refs (dir of mdw files - YAML frontmatter + GFM text)
  - rules (dir of mdw files - YAML frontmatter + GFM text)

workspace.json
- Add Description to metadata - make name/discription editable
- Check last accessed updating
- Move config.json into workspace.json (get rid of config.json)
- Have environment section where you can have env vars (including for the API keys)
- Make sure those env vars are available to the app (maybe set them into state after dotenv)
- Make LLMs use env vars for keys (priority is workspace env, the dotenv, then env)
- Make "models" dict with entry for each provider, model

It's not clear that the workspace change notification is ever received (or if it's needed, or what will happen if it gets called)

Clone Workspace would be nice.

For find/open workspace, it currently replaces workspace (if any) in current window.
- Should it set workspace if current window doesn't have one, else open in new window?

CLI
- Process launch params (workspace path, --create)
- Command to switch workspaces?
- Command to show workspace info

## Project Org

Implement css support (so we can share styles across app)

Remodel project
- main
  - index.html
  - main.ts
  - subdirs for backend (mcp, state, llm)
- cli
  cli.ts
- renderer
  - renderer.tsx
  - components
  - styles
    - global.css
- preload
  - preload.ts
- shared
  - api.ts
  - types