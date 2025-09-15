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
  - Will define one or more skills (each skill will have skill metadata and skill prompt)
    - Skill metadata is id, name, desc, tags

Agent Orchestration
- Any agent (interactive or autonomous) can orchestrate other agents
- Orchestration implemented via A2A MCP server (list_agents, call_agent)
- Orchestration prompt (to explain how to use the tools - is this necessary of can the tool description handle it?)

## Agent Definiton
Agent metadata (public information) will be maintained in agent card JSON file, supplemented with other files in that directory
Move MCP server config (including permissions, etc) into mcp.json file (so it will work with TeamSpark and anything that supports that file/format)
New tspark_a2a_server server will take agent directory (or agentcard path), default to cwd, and port, and run the agent an A2A server
- Launchable via command-line or code

## Orchestration MCP server

tspark_a2a_mcp

Can we build orchestrator prompt into tool descriptions or do we need separate orchestration prompt?
Configuration is list of agents
- http path to agents running on the network
- file path to agent profile (can be run via tspark_a2a server command line or code)

## Orchestration Tab

- Enabled (install/uninstall MCP server on enable/disable?)
- Orchestration Prompt
- Agents (point to agentcard file or url) - add/edit/del

Do we need an agent enum (with details) and test function?  Maybe later, since you can do it via the MCP server?

## TODO

Change agent config (UX and serialization)

Current: tspark.json

{
  "metadata": {
    "name": "",
    "created": "",
    "lastAccessed": "",
    "version": "1.0.0"
  }
  providers: {}
  mcpServers: {}
  settings: {
    "maxChatTurns": "20",
  }
}

New:

agent-card.json (public information about the agent)
mcp.json (mcpServers key) - MCP server configs (and permissions) - this will make it compatible with ToolVault and maybe other MCP tools
tspark.json (private information required to run the agent in the UX, from the command line, or programatically)
- providers
- settings

Maybe agent-tspark.json or agent-config.json for internal/private config?


What about:

/prompt.md (GFM)
/references/*.mdt (YAML frontmatter + GFM text)
/rules/*.mdt (YAML frontmatter + GFM text)

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

## TODO

As long was we store all of the metadata we need for agent-card.json in tspark.json, do we really need to store agent-card.json?
- We'll just generate it in our A2A server from our config
- Metadata to add:
  - mode (interactive/autonomous) - could use presence of "skills" attribute (ux requires at least one skill when autonomous toggled on)?
  - version (existing version is metadataVersion)
  - name (existing)
  - description
  - provider (organization/url)
  - iconUrl
  - documentationUrl
  - skills (id, name, description, tags, examples)

Implement a2a_server (command line app and API launcher)
- A2A server than runs against a TeamSpark agent
  - Command line app takes optional dir/file path (uses cwd if not specified) and optional port
- Produce agent-card from agent config/metadata
- Bridge A2A server (Express?) to our agents

Implement a2a_mcp
- MCP server that implements A2A orchestration
- Takes list of A2A servers as config (http endpoints of running servers)
- Implements list_agents, call_agent
- Later:
  - Also allow file endpoints of TeamSpark agent config dir/file in config
  - Run these endpoints from MCP server in order to include them is agent set

## Later

Implement constraints of agent (chat session?) based on interactive/autonomous
- Autonomous
  - Only present tools that don't require approval
  - Immutable rules/references (suppress internal tools that mutate them - is that enough?)
  - Session doesn't include history on request
  - Response filters out tool calls
- We could just:
  - Parameterize tools approval availability and immutable rules/refs (together or separately)
  - Have the a2a_server use a new session per skill call (should do that anyway), so it will have no history
  - Have the a2a_server strip out the tool call results

Orchestration tab (better UX for a2a_mcp)
- Installs MCP server when enabled, removes whe disabled
- Manages config of MCP server (agents) - add/remove/delete
- Shows details of configured agents/skills (including metadata, icon, docs link, etc)
  - Lets you test skills interactively