# TsAgent Work Items & Open Questions

This document tracks open issues, future enhancements, and work items for the TsAgent platform.

## Platform Improvements

### Package Management

- **Switch to pnpm**: Consider migrating from npm to pnpm for better workspace support. Current npm workspace implementation caused issues with Electron builds in CI/CD due to hoisting requirements. pnpm would allow disabling hoisting for electron and other tooling.

### Context & Chat Enhancements

- **@mention support**: Allow users to @mention rules or references to add them to chat context interactively (as you type, with lookup/matching)
  - Syntax: `@ref:[referenceName]` or `@rule:[ruleName]`
- **Store chat elements as references**: Allow users to pick any chat element and store it as a reference
- **Clone chat tab**: Enable cloning of chat sessions
- **Chat import/export**: Support JSON file format for:
  - Messages/replies
  - Context (references and rules)
  - Settings (if any override agent defaults)
- **Edit chat**: Support truncation and arbitrary message/reply removal
- **Chat Debug**: Show full details of chat history (everything sent/received on every call, including prior message context, rules, tools, references, etc). May be better as a specific log category/file.

### Context Overflow Management

- **Context window tracking**: LLM APIs don't provide solid feedback when context window is overflowed. Failure mode can be silent truncation leading to odd failures.
- **Solution requirements**:
  - Understand context window size for each model (complex - varies by model)
  - Measure context size via token counting APIs or estimation algorithms
  - Implement warnings, summarization, or trimming strategies

### Tool Library

- **Tool metadata catalog**: Build metadata catalog of tools (name, overview, default config)
- **Tool selection UI**: On tool "Add", show list of tools (like list of providers) with a "Custom..." option, with search/filter capability
- **Tool configuration form**: On tool selection, show mostly configured tool with required args/env having placeholder values
- **Advanced tool metadata**: Include indications of required config values (desc/type/etc) for more friendly form collection

### MCP Schema Support

- **anyOf/oneOf support**: Some MCP servers (e.g., mcp-grep-server) publish schemas using `anyOf`. Should treat `oneOf` the same way.
- **Tool test form**: Needs to support anyOf schemas
- **Gemini conversion**: Review how anyOf is handled when converting JSON Schema to OpenAPI-ish schema for Gemini
- **UX for anyOf**: Dropdown containing choices per anyOf with:
  - Description (optional)
  - Type description (primitive, array, or object)
  - User picks one, system provides correct controls (string vs array of strings, number vs null, etc.)

## Provider & Model Issues

### Claude Model Limits

Claude APIs don't provide useful metadata about max output tokens. Known limits:
- Claude 3-7-sonnet: 200k max output
- Claude 3-5-sonnet: 8192 max output
- Claude 3-5-haiku: 8192 max output
- Claude 3-opus: 8192 max output
- Claude 3-haiku: 8192 max output
- Context window: 200k for all

**Issue**: Error when max_tokens exceeds model limit (e.g., "max_tokens: 10000 > 8192")

**Solution needed**: Model metadata system to track max output tokens per model.

### Provider Default Models

- **Better default model selection**: Need better default model when switching to provider without specifying model. Currently uses first one, which isn't ideal (e.g., Gemini 2.5 has no non-metered quota and fails).

### Bedrock Enhancements

- **Inference profiles**: Add support for inference profile models
- **Provisioned models**: Add support for provisioned models

## Desktop App Enhancements

### Agent Management

- **Recent agents overflow**: Determine behavior when recent agents list overflows (how many to keep, UX implications)

### Distribution

- **File access permissions**: In install/run, wants access to Documents? (macOS permission issue)

## CLI Enhancements

- **Provider management**: No way to install/uninstall providers or tools via CLI

## MCP Functionality

Improve MCP support and config/interaction (best of MCP Inspector and ToolVault)

- **Resources support**: Add support for MCP resources
- **Resource templates**: Add support for MCP resource templates
- **Prompts**: Add support for MCP prompts
- **Tool call history**: "History" for recent tool calla showing JSON request (tool name, params) and response (like MCP Inspector)
- **Catalog/Registry support**: Integrate tool catalog/registry (and metadata-driven config)
- **Tool logging**: Better tool logging UX (including container logging)
- **Tool results**: Better tool results display (toggle text / JSON as in ToolVault)
- Make sure we support CWD proplerly (as ToolVault)
- Auto containerization like ToolVault for agent tool usage?
  - "Run in container" would be config element, and that would drive containerization at runtime

## Future Considerations

### Usage & Pricing 

- **Pricing database**: Build database of provider/model pricing
  - Complicated as pricing constantly changes, no automated way to get prices
  - Allow user to set/override (they may have more current data or specialized pricing)
- **Usage tracking**: Compute price per session (running total) and most recent message
- **Token usage collection**: Collect token usage over time (maybe by session) to show monthly or lifetime totals
- **Multi-provider pricing**: Handle different models from different providers in usage display
- **Model switching**: Handle pricing when switching models mid-session (maybe don't allow, or spawn cloned session for new model)

### Multi-Modal Support

- **Non-text types**: Support for images, videos in chat?

### Model Abstraction

- **Pluggable model layer**: Make model abstraction pluggable (future enhancement)

### Dynamic References

- **Dynamic reference sources**: References that pull from external sources (APIs, databases, etc.) rather than static text

### Supervision System

- **Supervisor permissions**: Define permissions for supervisors (what they're allowed to do, especially to executor agent state and conversation)
- **Passive observation**: Supervisor passed entire conversation after the fact (limited actions)
- **Active interaction**: Supervisor in conversation loop in real-time (full control, subject to privileges)

## Agent Creation

### Agent Types

We currently have interactive, autonomous (A2A), and tool providing (for meta-MCP)

This is odd in part because tool-providing agents are also autonomous (at least currently)
- In terms of how they operate, only presenting MPC tools that don't require approval, for example

It's also possible that an agent could provide both skills and tools

Should you be able to use a skill or tool-providing agent interactively with MCP tools that require permission?
- Only lock down the tools when in autonomous mode (how would we know)?
- At least lock down tools in test mode (so you can simulate how it will work when autonomous)

One path could agent mode is interactive or autonomous
- This determines whether tools require permission can be used by the agent (anything else?)
- If autonomous, you are allowed to define skills and/or tools (or neither)
- For example, you might make an autonomous agent with no skills or tools for an ACP deployment

There is currently a bug with autonomous agents 
- When they include tools via semantic inclusion, they don't filter out tools that require approval (easy fix)
- If that happens, you get a tool call that can't be completed, resulting in an empty response and end of turn

We should filter for tool permission when including tools by context (for both autonomous and tool providing modes)
We should add some error logging or error response in the case that we encounter an tool permission requirement when in autonomous mode
- Should never happen after fix, but still good to be safe

### MCP Server Config

We should implement registry support and metadata-driven config (via ServerCard?) before we lock the mcpServers config down

### Agent Serialization / Strategies

Read-only mode
- Should we support a mode of agent usage that is read-only 
  - We might allow explicit operations that do writes, or an explicit save, but no automatic updates (like embeddings)
  - This would probably mainly include embeddings (we would generate/update JIT but not save updates)

Should we implement a strategy backed by something else now that it's much simpler (single file)?
- Maybe a URL strategy, which would also support buckets?

Should we remove all implicit serialization and make the agent call an explicit save() to serialize?
- Some things, like embeddings update, the agent doesn't know about (unless we invent a way to tell them)

### Agent collection / provider config

Are there things, like provider config, that you'd want to share either system-wide or across a group of agents?
- Provider configs
- Provider part of agent info (org, url, icon)
- Commonly used tools (MCP servers) - this might imply tool settings (path)
- System prompt
- Chat session settings (defaults)
- Rules and references ("global")
  - How would this work? They'd always be "available", but you could disable? Could you "delete"?  Change include mode?
- Appearance (dark mode) - Should this even be in agent state?  Maybe better as app state.

Is the idea of a multi-agent yaml file (like cagent) the way to go?
- Define elements at root (optional), inherit or override in agents
- Do they auto-orchestrate?  How?
  - Default could be A2A
  - If agent exports tools, could be MCP

### Cloud-hosted system

Agent Loading
- From file (local) is around 250ms (check how much is file IO, how much is yaml parse)
- MCP client preload is much slower, 3+ seconds (could make this happen JiT)

General
- User has account
- Provider configs at account level
- Maybe all other shared stuff (list above) configured at account level
- Create Agent
- Add subagents (orchestration via a2a-mcp/a2a-server)
- Make agent available via A2A
- Make agent available via MCP
- Local model inference on cloud solution?  Generic OpenAI provider (supply endpoint, config)
- Agents can have remote MCP servers - what about local (probably not)?

For a2a-server and meta-mcp, how could we host many tenant agents at one endpoint (per protocol)
- mcp.teamspark.io/yourAgent
- a2a.teamspark.io/yourAgent
- Would being able to host an ACP server be useful?

How would we auth to exposed services (A2A, ACP, MCP)?

For A2A, for AgentCard publishing, the agent card has to be on the root URL (so we'd need URL-per-agent)
- myAgent.teamspark.ai (has .well-known/agent-card.json, server via A2A)