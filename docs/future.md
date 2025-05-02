# TeamSpark AI Workspace Future

## Chat

Support non-text message types (mainly images?)

## Model abstraction

It would be great to have it pluggable, maybe later.

## Chat usage / priving

Build db of provider/model pricing
- Complicated as this is constantly changes, no automated way to get prices
- Allow user to set/override (they may have more current data or specialized pricing)

Compute pricer per session (running total) and most recent message

Collect token usage over time (maybe by session) so you can see monthly or lifetime totals.

Assuming different models from different providers are used, will need to show that

This can be trick on a given chat session if you switch models mid-session
- Maybe we don't allow that, or maybe we spawn a cloned session for the new model?

## Tool functionality

mcp client can specify cwd to stdio transport (workspace implications)

To run MCP test app: npx @modelcontextprotocol/inspector

Support for other MCP functionality:
- Resources
- Resource templates
- Prompts
- Tools

"History" for each tool call that shows JSON request (tool name, params) and response

## Tool enable/disable

Allow tool set to be enabled/disabled
- Make sure LLMs gettings tools only get enabled tools

## Selective Tool Usage

Each rule and reference has a list of tools
The tool list can include server or server.tool
When a tool fires, it gets the list of references and rules that match the server/server.tool
User can manually indicate active tools?

## LLM Providers

Need better default model for switch to provider without specifying model
- Maybe LLM provides it (if not first one)?
- Currently uses first one, which isn't ideal for Gemini (2.5 has no non-metered quota and fails)

## Bedrock

Add support for inference profile and provisioned models

## CLI

No way to install/uninstall providers or tools

## References / Rules include by keyword

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

## File References

OK, so we're not trying to be a coding tool, but...

Instead of all file access being via tool, maybe we can improve upon that:
- The model doesn't generally understand that files change through external forces, or to tell if they've changed (unless you tell it)
- If the model is repeatedly reading the same files, it's going to have many versions in the chat session history (confusing and cluttering context)
- If we had a reference type that was a file reference - that pointed to a file
  - When building context on each message we can get the current version of the file (maybe we cache it and update if changed)
  - This way, there will only be one instance of the file in context and it will be current

Or maybe file context is it's own thing separate from references?
- The model has tools to include/exclude files from context

We probably need a medium complexity coding-type use case to validate these approaches

## Tools

### Tool library

List of installable tools
- name
- description
- icon
- url
- defaultConfig

Starting list:

### Add Tool

Show available tools to install (icon/name/desc), with "Custom" as the first option

Filter edit control

When one is picked, go to add/edit modal in add mode populated with metadata

### Tool config

Installed tool maintains link to metadata tool it was installed from
- Can get icon/url from there (display only, default icon if no icon)

Requires permission: yes/no (if yes, prompt will be as below: Allow once, Allow for this chat, Deny)

### Tool Permission

Note: Currently we're YOLO only

Allow tool call from [server name]?

  Run [toolname] from [server/server name] (maybe pop this open to see server/tool config)

Malicious MCP Servers or conversation content could potentially trick xxxxx into attempting harmful actions through your installed tools.
<bold>Review each action carefully before approving</bold>

[Allow for this chat] [Allow once] [Deny]

Session will track tool approvals for session

On tool call(s), determine if any require permission, and if so, mark them

Tool permission request (variation of tool call)
- Return this in a way that the client

Client needs to resubmit with approved tool calls to trigger tool calls and continuation
