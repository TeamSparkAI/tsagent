# Tool Usage Permission

## Overview

TeamSpark AI Workbench supports tool usage via installed MCP servers, where each server provides a set of named tools.

Currently the LLM implementations runs these tools without asking permission.

We will implement a solution that allows the LLM to assess wether permission is required for a given tool call, and if so, return a reply that indicates a tool call request (server, tool, args) such that the chat client can present the permission request to the user, and upon granting permission, the chat session updates the LLM (perhaps by submitting a new message) such that the LLM can pick up with the tool call and processing of the response.

There is the possibility that an LLM could have multiple tool calls in a single turn, including tools calls that have been completed and others that require approval.

It would be ideal if the chat interface presented the tool call permission inline as it does with tool call details, and that as tool calls are made or other chat responses are received, that they are integrated into the same chat message visually (so it doesn't look like the approved tool execution is a "separate" step in the final output - if approved, the tool calls in the final chat message display look just as they do now).

## Permission Configuration and Application

We have a session level setting for tool permission with values Always, Never, and Tool (use tool's permission required value)

We have a server level setting for default tool permissions for tools from that server with values of Always and Never

We have a tool level setting that is Default (user default value from that tool's server), Always, or Never

To determined whether tool use permission is required for a given tool call in a chat session:
- If Chat Session setting for tool usage permission is always or never, that is the tool permission
- Else if Chat Session setting for tool usage permission is tool:
  - If the tool permission setting indicates that permission is always or never, then that is the tool permission
  - Else the server default tool permission for the server of the tool in question is the tool permission

We have implemented the user interface and serialization of the above settings, but we do not yet enforce them.

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