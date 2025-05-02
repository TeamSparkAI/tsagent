# TeamSpark AI Workbench Hosted

Website with login, account management

Probably still bring-your-own-model (BYOM) unless we were funded and could subsidize

Workspaces all serialized to cloud account / DB
- Including everything serialized through the workspace manager (including rules, refs, tools)

Settings - same as local (except PATH not needed)

References/Rules - same as local

Tools
- Predefined catalog of server-hosted tools
- Proxy to local machine to run local tools
  - Local agent (configured locally) exposes tools (same client code as now)
  - Expose SSE server endpoint (easy, but means local machine must be internet locatable)
  - PubSub might be better (client registration, tool calling, tool call response, etc)
