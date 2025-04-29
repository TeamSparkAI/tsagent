# TeamSpark AI Workbench

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
  - Settings (if any override workspace defaults)

Edit chat
- Truncate makes sense
- Arbitrary message/reply removal?

Chat Debug
- Show full details of chat history (everything we sent/received on every call, including prior message context, rules, tools, references, etc)
- Maybe this is better as a specific log category/file

## Workspaces Issues

Workspace metadata (name/desc) would be nice in UX

How many previous workspaces, what happens in UX if they overflow

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





