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
  "settings": {
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
