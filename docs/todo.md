# TsAgent Foundry

## Pre-publish README review

Revew all README docs
Add screen shots for foundry and cli, anything else?
In top-level readme, distinguish between agent features and platform features (currently kind of mixed together)

## Publishing strategy

Publish @tsagent/core
Change dependencies in desktop, cli, and a2a-server projects to use @tsagent/core
Test TsAgent Foundry build from GHA, install
Build, test/validate, publish cli, a2a-server (including validating a2a-server in use by MCP server)
Change dependency in a2a-mcp to use @tsagent/server
Build, test/validate, publish a2a-mcp (validating MCP server in use)

## Launch

Website update
LinkedIn post
Videos?

## Project - switch to pnpm 

When the agent-api was broken out into its own package we adopted npm workspaces (which we use with some success in ToolVault).
This created a huge issue with building the Electron app via CI/CD (GHA) because of the requirement to build in the app/project
directory and expectations about where electron-builder and other tools must reside (which was out of our control because of
npm workspace hoisting, which cannot be disabled).  After a day of fighting with it, in the end we had to abandon npm workspaces.

If we switch to pnpm, its workspace support is much better, and would allow us the disable hoising for electron and any other
tooling.  It would also make it easier to publish agent-api as it's own npm package (which we'd like to do at some point).

## Chat UX

Allow user to @mention a rule or reference to add them to the chat context (interactively, as you type, maybe with lookup/matching)
- @ref:[referenceName]
- @rule:[ruleName]

Allow user to pick any chat element and store it as a reference

Clone chat tab

Chat import/export
- JSON file
  - Messages/replies
  - Context (references and rules)
  - Settings (if any override agent defaults)

Edit chat
- Truncate makes sense
- Arbitrary message/reply removal?

Chat Debug
- Show full details of chat history (everything we sent/received on every call, including prior message context, rules, tools, references, etc)
- Maybe this is better as a specific log category/file

## Agent Issues

How many previous agents, what happens in UX if they overflow

## Dist

In install/run, wants access to Documents?

====

## Tool library

Build metadata catalog of tools (name, overview, default config)

On Tool "Add" - show list of tools (like list of providers) with a "Custom..." option, maybe search edit control to filter (if there are more than ~20)

On selection of tool to add, take to tool add form page (should see mostly configured tool, with any required args/env having placeholder values)

In a more sophisticated version
- The metadata would contain indications of required config values (desc/type/etc)
- We'd collect those via a more friendly form
- Maybe re-use (generalize) the provider metadata implementation (which does something similar)

## Claude is picky about max output token limit

Error: Error: Failed to generate response from Claude - 400 {"type":"error","error":{"type":"invalid_request_error","message":"max_tokens: 10000 > 8192, which is the maximum allowed number of output tokens for claude-3-5-haiku-20241022"}}

Claude APIs don't appear to provide any useful metadata.  Here is what is on the web page:

Claude Model |  Max Output
============ | ==========
3-7-sonnet   |   200k
3-5-sonnet   |   8192
3-5-haiku    |   8192
3-opus       |   8192
3-haiku      |   8192

Context window is 200k for all

## Context Overflow

Generally speaking, the LLM APIs don't give solid feedback when you overflow the context window.

The failure mode can be that it just truncates the input (which can result in odd failures).

In order to address this (assuming the libraries don't help out):
- We need to understand how large the context window is for the model being used (whole can of worms)
- We need to be able measure (via token counting APIs) or estimate (via our own algos) the size of the context
  - Do we warn, summarize, trim, etc?

### MCP

mcp-grep-server publishes schema using anyOf:

Note: We should probably treat "oneOf" the same way?

Implications:

Tool test form needs to support
LLMs that support JSON Schema should work (or they get what they get)
We need to look at Gemini (where we convert JSON Schema to OpenAPI-ish schema for them)

For the UX of any anyof, dropdown containing choices per anyOf:
- Description (optional)
- Type: Get type description (primitive or array, maybe object)
  - Pray to god if it's an object type it has a description

User picks one, we give them the correct controls (say string versus array of strings, or number versus null)

{
  "name": "grep",
  "description": "xxxxx",
  "inputSchema": {
    "type": "object",
    "properties": {
      "pattern": {
        "title": "Pattern",
        "type": "string"
      },
      "paths": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "items": {
              "type": "string"
            },
            "type": "array"
          }
        ],
        "title": "Paths"
      },
      "ignore_case": {
        "default": false,
        "title": "Ignore Case",
        "type": "boolean"
      },
      "before_context": {
        "default": 0,
        "title": "Before Context",
        "type": "integer"
      },
      "after_context": {
        "default": 0,
        "title": "After Context",
        "type": "integer"
      },
      "context": {
        "anyOf": [
          {
            "type": "integer"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Context"
      },
      "max_count": {
        "default": 0,
        "title": "Max Count",
        "type": "integer"
      },
      "fixed_strings": {
        "default": false,
        "title": "Fixed Strings",
        "type": "boolean"
      },
      "recursive": {
        "default": false,
        "title": "Recursive",
        "type": "boolean"
      },
      "regexp": {
        "default": true,
        "title": "Regexp",
        "type": "boolean"
      },
      "invert_match": {
        "default": false,
        "title": "Invert Match",
        "type": "boolean"
      },
      "line_number": {
        "default": true,
        "title": "Line Number",
        "type": "boolean"
      },
      "file_pattern": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "File Pattern"
      }
    },
    "required": [
      "pattern",
      "paths"
    ],
    "title": "grepArguments"
  }
}





