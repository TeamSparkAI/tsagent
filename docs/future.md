# TeamSpark AI Workspace Future

## Chat

Support non-text message types (mainly images?)

## Hosted Version

Refs and rules would work fine
Hosted server tools catalog (installed per account)

## Model abstraction

It would be great to have it pluggable, maybe later.

## Tool Permission

Note: Currently we're YOLO only

Allow tool call from [server name]?

  Run [toolname] from [server/server name] (maybe pop this open to see server/tool config)

Malicious MCP Servers or conversation content could potentially trick xxxxx into attempting harmful actions through your installed tools.
<bold>Review each action carefully before approving</bold>

[Allow for this chat] [Allow once] [Deny]

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