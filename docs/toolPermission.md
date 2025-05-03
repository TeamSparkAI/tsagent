# Tool Usage Permission

## Overview

TeamSpark AI Workbench supports tool usage via installed MCP servers, where each server provides a set of named tools.

Currently the LLM implementations runs these tools without asking permission.

We will implement a solution that allows the LLM to assess wether permission is required for a given tool call, and if so, return a reply that indicates a tool call request (server, tool, args) such that the chat client can present the permission request to the user, and upon granting permission, the chat session updates the LLM (perhaps by submitting a new message) such that the LLM can pick up with the tool call and processing of the response.

There is the possibility that an LLM could have multiple tool calls in a single turn, including tools calls that have been completed and others that require approval.

It would be ideal if the chat interface presented the tool call permission inline as it does with tool call details, and that as tool calls are made or other chat responses are received, that they are integrated into the same chat message visually (so it doesn't look like the approved tool execution is a "separate" step in the final output - if approved, the tool calls in the final chat message display look just as they do now).

The CLI implementation will need to handle the approval UX differently (where there will be an approval prompt, then another response after that if approved and we continue)

## Permission Configuration and Application

We have implemenented the following methods in the chat session to handle tool call approval checks and flows:
- public toolIsApprovedForSession(serverId: string, toolId: string)
- public async isToolApprovalRequired(serverId: string, toolId: string): Promise<boolean>

## Permission Prompt

The permission prompt to the chat user should look like:

----

Allow tool call from [server name]?

  Run [toolname] from [server name] (> pop open to see args)

Malicious MCP Servers or conversation content could potentially trick TeamSpark AI Workbench into attempting harmful actions through your installed tools.
<bold>Review each action carefully before approving</bold>

[Allow for this chat] [Allow once] [Deny]

----

## Instructions

Can you analyze the code and describe a strategy for implementing this feature (do not write any code yet).

Describe phases of the approach that could be done one at a time.