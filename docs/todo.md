# TeamSpark AI Workbench

https://docs.anthropic.com/en/docs/build-with-claude/tool-use/overview

https://www.anthropic.com/news/model-context-protocol

https://modelcontextprotocol.io/

## Model abstraction

This is a decent design/start, but isn't complete or up-to-date: https://github.com/fkesheh/any-llm

It would be great to have it pluggable, but maybe later.

## Tools

mcp client can specify cwd to stdio transport (workspace implications)

To run MCP test app: npx @modelcontextprotocol/inspector

Resources
Resource templates?
Prompts?
Tools

"History" for each tool call that shows JSON request (tool name, params) and response

## Chat UX

Allow user to @mention a rule or reference to add them to the chat context (interactively, as you type, maybe with lookup/matching)
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

## Workspaces Issues

Workspace metadata (name/desc) would be nice in UX

Clone Workspace would be nice.

For find/open workspace, it currently replaces workspace (if any) in current window.
- Should it set workspace if current window doesn't have one, else open in new window?

## Before Release

Package for dist
- Verify app icon (including in app)

Top-level menus?

CLI
- Register CLI on first run (like Ollama) - tspark
- Model selector (install/configure providers?  allow providers via env?)

## Providers tab and other stuff

Should all models have defaults (trickier to pick for Bedrock and Ollama)?  Probably only impacts CLI.

How do we tell if a provider is properly configured and working?  Test/ping?

Either show models or error

Each model could have "Start Chat" that launches a chat with that model

## Workspace issues

Track (and persist) last selected model, select it when creating new chat tab

Currently, all tabs are remounted (in App.tsx) on workspace:switch
- This is how rules/references tabs are getting reloaded even though they don't listen for workplace:switch
- We could try to be more clever, because all tabs other than the Chat tabs don't actually need to detach/attach (they can update themselves on workspace:switch)

## Settings

New settings tab, list of items on left, details on right
- System Prompt
- Chat Settings
  - Max turn count
  - Max output tokens
- Model Settings (default model settings)
  - See below

Would we want to be able to set these per chat session also ("Settings" that had chat and model settings)?

Max tokens (?)
Max output tokens (?)

### Common model settings

Note: For both settings, "use model default" or "override model default"

Temperature (0.0 to 1.0):

Temperature controls how random and creative the AI's responses are.
* Lower values (closer to 0): Make the output more predictable, focused, and factual. Good for tasks where accuracy is key.
* Higher values (closer to 1): Introduce more randomness and surprise, leading to more creative and varied responses. Good for brainstorming or creative writing.   

Top-P (Nucleus Sampling) (0.0 to 1.0):

Top-P also influences the randomness of the AI's output by considering a selection of the most likely words.   
* Lower values (closer to 0): Focus the AI on a smaller, more probable set of words, resulting in more predictable and focused output.   
* Higher values (closer to 1): Allow the AI to consider a wider range of less probable but still relevant words, leading to more diverse and sometimes more creative responses.   

Important Note: It's generally recommended to adjust either Temperature or Top-P, but not both at the same time, for the most predictable control over the AI's behavior.