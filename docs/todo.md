# TeamSpark AI Workbench

## Chat UX

What happens in context UX when we have lots of refs/rules (scroll, search?)

Allow user to @mention a rule or reference to add them to the chat context (interactively, as you type, maybe with lookup/matching)
- @ref:[referenceName]
- @rule:[ruleName]

Selective tool inclusion (like context mgmt)?

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

## References and Rules config

Include: Always, Auto Attached, Agent Requested, Manual (these are the Cursor options)
- Add tool to include/exclude ref/rule from current chat session (maybe see which refs/rules are attached/available)

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

## MCP / Tools Work

Test support for SSE server
- Local weather server in /mcp-sse
  - uv run weather.py

## Workspaces Issues

Workspace metadata (name/desc) would be nice in UX

Clone Workspace would be nice.

For find/open workspace, it currently replaces workspace (if any) in current window.
- Should it set workspace if current window doesn't have one, else open in new window?

How many previous workspaces, what happens in UX if they overflow

If not workspace history, show explainer for workspaces?

## Before Release

Package for dist
- Verify app icon (including in app)

Top-level menus?

Option to "register" command line app on first run (and from menu later)

## Providers tab and other stuff

How do we tell if a provider is properly configured and working?  Test/ping?

Either show models or error

Each model could have "Start Chat" that launches a chat with that model

## CLI

Make sure CLI supports no model selected
- There was (is) a bug where it showed "Test" as selected, but messages just spun forever

/clear (implement)
- New chat session

### Providers

/providers or /providers list
- Show list of providers (dash and star to show available/installed)

/providers add <provider>
- Prompts for config values

/providers remove <provider>
- Confirms

/provider <provider> <modelId>
- select provider (modelId optional, will use default model for provider if not specified)
- Update most recent model

/models
- List models for current provider (active model has star)

/model <modelId>
- Select model
- Update most recent model

### Session settings

/settings
- List settings (chat session and workspace if different)
  - (overrides workspace default of: xx)

/settings clear
- Revert chat settings to workspace default

/settings save
- Save current chat settings as workspace default

/setting <setting> <value>
