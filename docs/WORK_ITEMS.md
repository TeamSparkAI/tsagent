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

- **Non-existent agents**: If on startup recent agent includes files that don't exist, remove them
- **Recent agents overflow**: Currently keep last 10

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

### Agent Types/Modes

We currently present (in the ux) an agent "mode" of interactive, autonomous (A2A), or tool providing (for meta-MCP)
- Determined by the prescence of skills or tools
- Naming is odd because tool providing agents are also autonomous
- Operationally, if either skills or tools present, only present agent with tools not requiring approval
- Does not support:
  - An agent providing both skills and tools (supported in agent defintion, but not in ux)
  - An interative agent providing either skills or tools
  - An autonomous agent providing neither skills nor tools (possibly needed for ACP)

Should you be able to use a skill or tool-providing agent interactively with MCP tools that require permission?
- Only lock down the tools when in autonomous mode (how would we know)?
  - We could tell the agent its in autonomous mode when we instatiate it (from the A2A or MCP server, for example)
  - We could make the agent request processing be autonomous when we are in tool test mode
  - We could establish a similar skill test mode (a little weird since skills aren't individually testable)
  - Maybe an ephemeral session param to make session autonomous?
  - This is all really about the use case of we want an agent we can interact with non-autonomously
    - But when that agent is used via A2A or MCP we want it to be autonomous
    - Which means we'd like to be able to test it in autonomous mode
    - If not for the desire to have it also be non-autonomous, we could just use an agent setting (interactive/autonomous)
- At least lock down tools in test mode (so you can simulate how it will work when autonomous)

What if we had agent config "interactive" (default) or autonomous (or just an "interactive" bool that defaults to true)
- If autonomous, all sessions are autonomous (attempts to create/set to interactive will fail)
- If interactive, sessions default to interactive but can be created/set to autonomous
  - This is how we would do tool test (and maybe "agent" test for skills agents?) - creating the test session as autonomous
  - When a2a/mcp server instantiates agent/session, it sets the session to autonomous (think about this for ACP)
  - Should we allow the user to set it in the desktop via session settings (show state, allow change if allowed)
- We would let you create skills or tools in either mode
  - This is already how it works at the config (agent file) level
  - Think about the desktop ux for this (enable means create empty skills/tools element, then tabs show up)
    - Checkbox for "Exports skills" and "Exports tools"
    - When checked, we create emtpy skills/tools, tabs show up
    - When unckeched, remove skills/tools (if any skills/tools defined, confirm that they will be deleted), and tabs
  - Check logic for what happens if we have both (in ux and agent)
    - "autonomous" would now be driven by specific attribute at the session level, not presensce of skills/tools
- This also supports the idea of making an agent autonomous without any skills/tools (currently not a supported use case)
  - Would we do this when building an ACP agent?
- For now this is only used for tool presentation (suppress tools requiring approval), but might later be used to control elicitaton or other interactive behaviors
  - If elicitation always directed at the user, or might it be directed at the agent?


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