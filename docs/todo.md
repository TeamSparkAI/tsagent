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

## Before Release

Top-level menus?

Option to "register" command line app on first run (and from menu later)

## Symlink

MacOS:

sudo ln -s "/Applications/TeamSpark AI Workbench.app/Contents/MacOS/TeamSpark AI Workbench" /usr/local/bin/tspark

Then:

tspark --cli

## Dist

In install/run, wants access to Documents?

Update website to point to downloads

Verify download / install of Mac/Linux

Make real website
- Branding (icon, etc)
- Screen shots
- Video (Youtube demo?)

====

## MCP Servers using npx in the bundled app

For many common commands (node, ucx, uvx), using a full path is required and sufficient

For npx, you must path a PATH that points to node bin, and /bin (for "sh" and other shell commands)
- this works: /Users/bob/.nvm/versions/node/v20.10.0/bin:/bin

NVM_BIN is a good hint for the node bin

If no path to command:

  "spawn xxx ENOENT"

If npx can't run Node (needs Node bin on path):

  "env: node: No such file or directory"

If npx can't run some other command:

  "npm ERR! enoent spawn sh ENOENT"
  "This is related to npm not being able to find a file."

### Solution

Settings/Tools
- Default path (defaults to empty?)

When installing tool, if fails, parse output and suggest fix (based on list above)

"Commands typically need to either have a fully specified path, or have a PATH environment variable that refers to their location."
"For some more complex commands, including npx, a PATH to both the Node bin and system bin directories must be provided."

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
