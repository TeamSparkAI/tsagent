# TeamSpark AI Workbench

## Chat UX

Allow user to @mention a rule or reference to add them to the chat context (interactively, as you type, maybe with lookup/matching)
- @ref:[referenceName]
- @rule:[ruleName]

Allow user to pick any chat element and store it as a reference

Clone chat tab

Chat import/export
- JSON file
  - Messages/replies
  - Context (references and rules)
  - Settings (if any override workspace defaults)

Edit chat
- Truncate makes sense
- Arbitrary message/reply removal?

Chat Debug
- Show full details of chat history (everything we sent/received on every call, including prior message context, rules, tools, references, etc)
- Maybe this is better as a specific log category/file

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

## Context

Update session context UX to handle larger lists of rules/references, maybe filter?

Add "include" field to rules/references
- "always" (on new session)
- "manual" (default, can only be added/remove by user)
- "agent" (future) - Agent is allowed to add/remove in context (in addition to user)

Beef up internal tools metadata for rules/refs (allowed chars in name, defaults, etc)

---

Add agent mode option to UX
Update tools to be able to add/remove ref/rule from context (and see what rules/refs are in context)
