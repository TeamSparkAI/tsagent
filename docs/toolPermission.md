# Tool Usage Permission

## Overview

TeamSpark AI Workbench supports tool usage via installed MCP servers, where each server provides a set of named tools.

Currently the LLM implementations runs these tools without asking permission.

We will implement a solution that allows the LLM to assess wether permission is required for a given tool call, and if so, return a reply that indicates a tool call request (server, tool, args) such that the chat client can present the permission request to the user, and upon granting permission, the chat session updates the LLM (perhaps by submitting a new message) such that the LLM can pick up with the tool call and processing of the response.

There is the possibility that an LLM could have multiple tool calls in a single turn, including tools calls that have been completed and others that require approval.

It would be ideal if the chat interface presented the tool call permission inline as it does with tool call details, and that as tool calls are made or other chat responses are received, that they are integrated into the same chat message visually (so it doesn't look like the approved tool execution is a "separate" step in the final output - if approved, the tool calls in the final chat message display look just as they do now).

## Permission Configuration and Application

We need to add a chat setting for Tool Call Permission: [Ask if tool not pre-approved, Never ask (dangerous)] - this setting should be at the workspace and chat session (override) level

For each server, we should have a setting for Tool Use Approval [Approval Required, Approval Not Required] (may be override on by individual tools)

For each tool, there should be a setting for Tool Use Approval [Server Default (Approval Required/Not Required), Approval Required, Approval Not Required]

To determined whether tool use permission is required for a given tool call in a chat session:
- If Chat Session setting for tool usage permission is Never Ask, permission is not required
- If Chat Session indicates a tool has been approved for the session, permission is not required
- If the tool configuration indicates that permission is not required, permission is not required
- If the tool configuration indicates that permission is required, permission is required
- If the tool configuration indicates to use the server default permission value, permission required is the server default permission value

## Permission Prompt

The permission prompt to the chat user should look like:

----

Allow tool call from [server name]?

  Run [toolname] from [server name] (> pop open to see args)

Malicious MCP Servers or conversation content could potentially trick TeamSpark AI Workbench into attempting harmful actions through your installed tools.
<bold>Review each action carefully before approving</bold>

[Allow for this chat] [Allow once] [Deny]

----

The chat session will track which tools (server and tool) have been approved for the session (when the permission response is "Allow for this chat").

## Instructions

Can you analyze the code and describe a strategy for implementing this feature (do not write any code yet).

Describe phases of the approach that could be done one at a time.