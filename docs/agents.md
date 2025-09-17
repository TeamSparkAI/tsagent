# Teamspark AI Workbench Agents

## Agent functionality

We now have agent-api where all of our agent functionality lives.  The current implementation is FileSystemAgent which
works off of the tspark.json file and other related files in the agent directory.  It should be pretty easy to create
an ephemeral agent (that just manages everything in memory, with no serialization - the client just loads it on create,
and is free to interrogate its contents and save if desired).

We could also return an in memory Agent that had a pluggable serialization strategy.

## Agents

agents.json (in app files directory) - list of recent agents (GUI app only)

## Agent

tspark.json - in root of agent

{
  "metadata": {
    "name": "xxxx",
    "description": "xxxxxx",
    "created": "2025-04-07T17:32:29.081Z",
    "lastAccessed": "2025-04-07T17:32:29.081Z",
    "version": "1.0.0"
  },
  "settings": {s
    "maxChatTurns": "10",
    "maxOutputTokens": "1000",
    "temperature": "0.5",
    "topP": "0.5",
    "maxTurns": "25",
    "mostRecentModel": "gemini:gemini-2.0-flash"
  }
  "providers": {
    "anthropic": {
      "ANTHROPIC_API_KEY": "xxxxx"
    },
    "gemini": {
      "GOOGLE_API_KEY": "xxxxx"
    },
    "openai": {
      "OPENAI_API_KEY": "xxxxx"
    },
    "bedrock": {
      "BEDROCK_ACCESS_KEY_ID": "xxxxx",
      "BEDROCK_SECRET_ACCESS_KEY": "xxxxx"
    },
    "ollama": {
      "OLLAMA_HOST": "xxxxx" (optional)
    }
  },
  "mcpServers": {
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "./test_files"
      ]
    },
    "weather": {
      "type": "sse",
      "url": "http://0.0.0.0:8080/sse",
      "headers": {}
    }
  }
}

## Other agent files

/prompt.md (GFM)
/references/*.mdt (YAML frontmatter + GFM text)
/rules/*.mdt (YAML frontmatter + GFM text)

===============================================================

https://github.com/a2aproject/A2A
https://a2a-protocol.org/latest/

# Agent v2 (A2A)

Goals
- Allow TeamSpark agents to be able to orchestrate other agents (TeamSpark or otherwise) via A2A
- Allow TeamSpark agents to be served via A2A and usable by an agent supporting A2A

Agents can be one of:
- Interactive
  - System prompt: "You are a helpful assistent..."
  - Maintains chat history in context
  - Can ask user permission to use tools if needed
  - Can modify state (rules/references) during session (manually or via LLM tool usage)
- Autonomous
  - System prompt: "You are an autonomous agent..."
  - No chat history - input prompt produces complete reply (no clarification or partial answers)
  - Only returns final result (no reasoning details, etc)
  - Only presents model with approved tools (cannot ask user for tool use permission)
  - Does not return tool call details (we can suppress/remove)
  - Cannot modify state (rules/references)
  - Will define one or more skills (each skill will have skill metadata: id, name, desc, tags)

Agent Orchestration
- Any agent (interactive or autonomous) can orchestrate other agents
- Orchestration implemented via A2A MCP server (list_agents, call_agent)
- Orchestration prompt (to explain how to use the tools - is this necessary or can the MCP tool description handle it?)

## MCP Server Updates

Move MCP server config (including permissions, etc) into mcp.json file (so it will work with TeamSpark and anything that supports that file/format)
- Not really related to agent work - but would be nice to support ToolVault to process agent calls

Add "disabled" flag to MCP server and to individual MCP tools
- Need to provided UX for both, with serialization
  - Display tool-level "disabled" in tool list
  - UX to enabled/disable all tools (to make it easier to handle large tool lists)
- Need to obey when building tools list
  - Only collect non-disbled tools from non-disabled servers
  - If "autonomous" further filter to only allow tools that don't require permission

Clean up MCP servers UX (limit width of tools column, show text with "show raw")
- Consider tabs with config, tools, logs (like ToolVault)

We might need some way to force reload of the MCP server (to force reload of the a2a-mcp servers agents)

## Agent Definiton

AgentMetadata has been expanded to cover AgentCard:
- name 
- version
- description
- provider (organization/url)
- iconUrl
- documentationUrl
- skills (id, name, description, tags, examples)
- mode (interactive/autonomous) - computed property based on truthy "skills" attribute value (which even if empty array, indicates autonomous)

## A2A Server for TeamSark Agent(s)

Package: a2a-server
  
Command line app and API launcher to expose TeamSpark agent as A2A server

- Command line app takes dir/file path and optional port
  - Future: Agent path optional, uses cwd if not specified
- AgentCard produced from agent metadata
- Bridge A2A server (Express app) to TeamSpark agent(s)
- Note: It is possible to use path routing to host multiple A2A endpoints on one host/port (one Express app)

## A2A Orchestration MCP server

Package: a2a-mcp

MCP server that implements A2A orchestration of A2A servers

- Takes list of A2A servers as config (http endpoints of running servers)
- Implements list_agents, call_agent

## Later

Our chat logic may not be handling structuredContent propery (or maybe the LLMs just don't support it?)

When we returned ONLY structured content (from a2a-mcp) both Gemini and Claude threw errors
- Either they didn't see/accept/process the structuredContent, or our chat logic didn't make it available
- Adding plaintext "content" to the MCP return payload made the errors go away

We also saw that when the tool descriptions had output schema and we didn't return structuredContent that we got errors to that effect
- Which implies that the LLMs could detect the absence of structuredConent and the presensence when we added it

### Support TeamSpark Agents in a2a-mcp

Allow file endpoints of TeamSpark agent config dir/file in config (run via a2a-server command line or API)

Config params can be:
- http:// for A2A agents
- file:// for TeamSpark agents

We collect all TeamSpark agents and run them in a single a2a-server with paths (and default port)
We add each path to our A2A agents list
We have to manage the lifecycle of the a2a-server (specifically the Express server it runs)

### Agent type constraints

Agent Mode is available as property (truthy skills attribute means autonomous)

Implement constraints of agent (chat session?) based on interactive/autonomous
- Autonomous
  - Only present tools that don't require approval
  - Immutable rules/references (suppress internal tools that mutate them - is that enough?)
  - Session doesn't include history on request
  - Response filters out tool calls
- We could just:
  - Parameterize tools approval availability and immutable rules/refs (together or separately)
  - Have the a2a_server use a new session per call/message (should do that anyway), so it will have no history
    - Do we also want to make sure that when using autonomous agent interactively (test/dev) that it doesn't maintain chat history?
  - Have the a2a_server strip out the tool call results

### Orchestration UX

A TeamSpark Workbench tab providing a better UX for a2a-mcp

- Enabled/Disabled (installs MCP server when enabled, removes when disabled)
  - We may added enabled/disable support for servers and do that instead to preserve config
- Orchestration Prompt (?)
  - Insert after system prompt in context
- Manages config of MCP server (agents) - add/remove/delete
  - Agents are file or URL paths
- Shows details (AgentCard) of configured agents (including metadata, icon, docs link, skills details, etc)
- Lets you test agents interactively

## Sample agent card

{
  "protocolVersion": "0.3.0",
  "name": "GeoSpatial Route Planner Agent",
  "description": "Provides advanced route planning, traffic analysis, and custom map generation services. This agent can calculate optimal routes, estimate travel times considering real-time traffic, and create personalized maps with points of interest.",
  "url": "https://georoute-agent.example.com/a2a/v1",
  "preferredTransport": "JSONRPC",
  "provider": {
    "organization": "Example Geo Services Inc.",
    "url": "https://www.examplegeoservices.com"
  },
  "iconUrl": "https://georoute-agent.example.com/icon.png",
  "version": "1.2.0",
  "documentationUrl": "https://docs.examplegeoservices.com/georoute-agent/api",
  "defaultInputModes": ["application/json", "text/plain"],
  "defaultOutputModes": ["application/json", "text/plain"],
  "skills": [
    {
      "id": "route-optimizer-traffic",
      "name": "Traffic-Aware Route Optimizer",
      "description": "Calculates the optimal driving route between two or more locations, taking into account real-time traffic conditions, road closures, and user preferences (e.g., avoid tolls, prefer highways).",
      "tags": ["maps", "routing", "navigation", "directions", "traffic"],
      "examples": [
        "Plan a route from '1600 Amphitheatre Parkway, Mountain View, CA' to 'San Francisco International Airport' avoiding tolls.",
        "{\"origin\": {\"lat\": 37.422, \"lng\": -122.084}, \"destination\": {\"lat\": 37.7749, \"lng\": -122.4194}, \"preferences\": [\"avoid_ferries\"]}"
      ]
    },
    {
      "id": "custom-map-generator",
      "name": "Personalized Map Generator",
      "description": "Creates custom map images or interactive map views based on user-defined points of interest, routes, and style preferences. Can overlay data layers.",
      "tags": ["maps", "customization", "visualization", "cartography"],
      "examples": [
        "Generate a map of my upcoming road trip with all planned stops highlighted.",
        "Show me a map visualizing all coffee shops within a 1-mile radius of my current location."
      ]
    }
  ],
  ]
}
