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

- **Resources support**: Add support for MCP resources
- **Resource templates**: Add support for MCP resource templates
- **Prompts**: Add support for MCP prompts
- **Tool call history**: "History" for each tool call showing JSON request (tool name, params) and response

## Usage & Pricing

- **Pricing database**: Build database of provider/model pricing
  - Complicated as pricing constantly changes, no automated way to get prices
  - Allow user to set/override (they may have more current data or specialized pricing)
- **Usage tracking**: Compute price per session (running total) and most recent message
- **Token usage collection**: Collect token usage over time (maybe by session) to show monthly or lifetime totals
- **Multi-provider pricing**: Handle different models from different providers in usage display
- **Model switching**: Handle pricing when switching models mid-session (maybe don't allow, or spawn cloned session for new model)

## Future Considerations

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

## Technical Debt

- **Type safety improvements**: Continue improving type safety across the codebase
- **Documentation**: Keep architecture and work items documents up to date
- **Testing**: Expand test coverage for edge cases and integration scenarios

