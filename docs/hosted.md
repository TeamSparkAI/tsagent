# Hosted MCP Foundry

Web site
User accounts
Auth

Org roots and accounts

Would we want API tokens at account level (versus agent-level as they are now)?
- Anthing else in agent that we'd want at account (review)

Create MCP server
Set up auth to MCP server (OAuth, fallback to token?)
- How does owner determine who can auth (account level, management tools?)
Public/private (just determines whether listed in directory/catalog)

Would we want to expose these as chat agents also?  Give the option to make agent and/or export tools?

Exposed chat agent or MCP server hides all details of implementation (it will show tools calls, including context item tool calls)

Bill for usage?  Pass through / mark up inference plus tool call fee?

Catalog of published MCP servers

Would need a strategy that worked against some kind of cloud storage/db

Limits on rules/references (size/count)?

How would agents be able to run MCP servers?
- Run hosted servers (via http)
- Maybe a limited number of local MCP servers
  - Fetch?
  - Puppeteer?
- Hosted
  - Zapier, Postman, n8n

Custom instance config
- Provide Github repo and creds and get a version that talks to your repo
- Provide creds and get a version that talks to your GMail
- A published creates a set of required params, which are used by MCP servers (and other places)
- A user creates an "instance" of the MCP server with their params

Could we reach into local envs to run locally hosted MCP servers in a secure way?

Abiltity to import/export agents
- Import is tricky since imported agent has to fit profile (limitations)

## Use cases

Come up with five compelling demo use cases

Some of them can be "specific" (accessing a specific github repo, for example)
