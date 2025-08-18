# TeamSpark AI Workbench Hosted

Website with login, account management

Probably still bring-your-own-model (BYOM) unless we were funded and could subsidize

Agents all serialized to cloud account / DB
- Including everything serialized through the agent (including rules, refs, tools)

Settings - same as local (except PATH not needed)

References/Rules - same as local

Tools
- Predefined catalog of server-hosted tools
- Proxy to local machine to run local tools
  - Local agent (configured locally) exposes tools (same client code as now)
  - Expose SSE server endpoint (easy, but means local machine must be internet locatable)
  - PubSub might be better (client registration, tool calling, tool call response, etc)

==========

Package
- Convert API to REST API in existing Electron app
- Add API for "run agent"
- Create dual mode packaging
  - Electron App
  - Next.js server with UX and API
