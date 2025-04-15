# Teamspark Workbenc Workspaces

## Workdpaces

workspaces.json (in app files directory) - list of workspaces

## Workspace

tspark.json - in root of workspace

{
  metadata: {
    name: "xxxx",
    description: "xxxxxx",
    created: "2025-04-07T17:32:29.081Z",
    lastAccessed: "2025-04-07T17:32:29.081Z",
    version: "1.0.0"
  },
  settings: {
    maxTurns: 10
  }
  providers: {
    anthropic: {
      ANTHROPIC_API_KEY: "xxxxx"
    },
    gemini: {
      GEMINI_API_KEY: "xxxxx"
    },
    openai: {
      OPENAI_API_KEY: "xxxxx"
    },
    bedrock: {
      BEDROCK_ACCESS_KEY_ID: "xxxxx",
      BEDROCK_SECRET_ACCESS_KEY: "xxxxx"
    },
    ollama: {
      OLLAMA_HOST: "xxxxx" (optional)
    }
  },
  mcpServers: {
    server: {
      command: "xxxx"
    }
  }
}

/prompts/system.md (GFM)
/references/*.mdt (YAML frontmatter + GFM text)
/rules/*.mdt (YAML frontmatter + GFM text)
