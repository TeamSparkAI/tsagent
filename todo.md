# TeamSpark AI Workbench

https://docs.anthropic.com/en/docs/build-with-claude/tool-use/overview

https://www.anthropic.com/news/model-context-protocol

https://modelcontextprotocol.io/

Chat message
- System prompt plus user message
- while response < max turns
  - record any text reponse (optional)
  - if any function calls
    - call functions
    - reply with function call results
  - if no function calls
    - done (break)


## Tools

List of installed servers
Add server (collect info, verify we can connect, get name/version)
Remove server
Disable server?

Configuration
- Name
- Command
- Args (list of strings)
- Environment (list of kvp )

Resources
Resource templates?
Prompts?
Tools

Test tool - collect params, run, show output

Note: Need array param support (in general)

## Rules

Rule
- name
- description
- enabled
- text
- priority level

List in priority order, the alpha by name?

API to CRUD rules

MCP (internal) for rule CRUD

## Context

Context
- name
- description
- enabled
- context

MCP (internal) for context CRUD

Is/can context be local to a chat, or attached to a role/agent definition, or global?


Now we will add rules support.  We will support a collection of rules, where each rule has a name, description, priority level (000 through 999), enabled (boolean), and text.  The rules will be stored in a the settings directory under a rules sub-directory, where each rule has a file named with the rule name and with the extension mdw.  The files themselves will use the YAML front-matter format to store the metadata (name, description, enabled, priority level), with the text following in the body of the markdown file.  Our llm state manager needs to maintain the list of rules so they can be provided to the LLM as needed (the LLMs aren't going to use the rules yet, so don't worry about that part).  The rules tab needs to show the list of rules with the ability to add, edit, and delete rules. The rules tab will list the rules in priority order, the alpha by name.  The rules text is markdown format, so it should be rendered as markdown in the rules tab (when viewing).  Let's manage the rules files and state in a similar way to how we did the prompt.  Please build out the entire solution.