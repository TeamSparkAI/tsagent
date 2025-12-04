# Agents

This directory contains sample agents.  

## Configuration

These agents all rely on default provider configurations that rely on standard environment variables.  The easiest way to provide those is via a .env file in the agents directory, formatted like this:

```env
ANTHROPIC_API_KEY=sk-ant-api-xxxxxxxx
GOOGLE_API_KEY=xxxxxxx
OPENAI_API_KEY=sk-proj-xxxxxxxx
AWS_SECRET_ACCESS_KEY=xxxxxxx
AWS_ACCESS_KEY_ID=xxxxxxxx
```

## Scenarios

### Tool Exporting Agents (mcp-meta)

- `optimizer.yaml` - Provides optimized access to MCP tools (find_tool, call_tool)
- `tvault.yaml` - Provides ToolVault status and details in MCP servers managed by running ToolVault server

### Orchestration (a2a-mcp, a2a-server)

- `orchestrator.yaml` (orchestrates autonomous skill-exporting agents)
  - `bob.yaml` - Autonomous agent that is an expert on Bob Dickinson with a skill for Bob facts
  - `tspark.yaml` - Autonomous agent that is an export on the TeamSpark TsAgent Foundry (no defined skills)
