# Tool Usage Permission

## Overview

TeamSpark AI Workbench supports tool usage via installed MCP servers, where each server provides a set of named tools.

Currently the LLM implementations runs these tools without asking permission.

We will implement a solution that allows the LLM to assess wether permission is required for a given tool call, and if so, return a reply that indicates a tool call request (server, tool, args) such that the chat client can present the permission request to the user, and upon granting (or denying) permission, the chat session updates the LLM by submitting a new message with tool call approvals such that the LLM can pick up with the tool call and processing.

There is the possibility that an LLM could have multiple tool calls in a single turn, including tools calls that have been completed and others that require approval.

It would be ideal if the chat interface presented the tool call permission inline as it does with tool call details, and that as tool calls are made or other chat responses are received, that they are integrated into the same chat message visually (so it doesn't look like the approved tool execution is a "separate" step in the final output - if approved, the tool calls in the final chat message display look just as they do now).

The CLI implementation will need to handle the approval UX differently (where there will be an approval prompt, then another response after that if approved and we continue)

## Permission Prompt

The permission prompt to the chat user should look like:

----

Allow tool call from [server name]?

  Run [toolname] from [server name] (> pop open to see args)

Malicious MCP Servers or conversation content could potentially trick TeamSpark AI Workbench into attempting harmful actions through your installed tools.
<bold>Review each action carefully before approving</bold>

[Allow for this chat] [Allow once] [Deny]

----

## Message flow for tool call approval

When the LLM encounters a tool call, it checks to see if approval is needed

If there are tool calls that do not require approval, it calls them as normal and populates the turn with the calls and results (as current)

If approval is required for any tool calls, it adds a ToolCallRequest object for each to the ModelReply.pendingToolCalls and ends processing

When the chat tab gets a ModelReply, it inspects "pendingToolCalls" and presents permission prompts for any found

When all tool requests have been responded to, the chat tab submits a message back to the chat session:
- message.role is "approval" 
- message.toolCallApprovals is an array of ToolCallApproval
  - Each ToolCallApproval has a "decision" value of:
    - TOOL_CALL_DECISION_ALLOW_SESSION
    - TOOL_CALL_DECISION_ALLOW_ONCE
    - TOOL_CALL_DECISION_DENY

LLM processes "approval" messages along with other messages in the list (this part is already implemented)
- For each tool call, if "decision" is TOOL_CALL_DECISION_ALLOW_SESSION call toolIsApprovedForSession with tool detail to whitelist it
- If "decision" is TOOL_CALL_DECISION_ALLOW_SESSION or TOOL_CALL_DECISION_ALLOW_ONCE, run tool, populate tool call and tool call result in message history
- If "decision" is TOOL_CALL_DECSION_DENY, populate tool call and a tool call result with "User denied tool invocation"
- LLM calls its generate with message history that includes tool calls / results

## Tool permission processing and disposition (completed)

The UX may receive multiple tool permisssion requests.  When this happens, it displays them all and waits for a decision to be indicated on each one before continuing.

When a user chooses a tool permission response, that request is considered "dispositioned".  
- When this happens, the buttons are replaced with a text indication of the disposition ("Approved for session", "Approved once", or "Denied")
- There is also an undo control that undoes the dispositon and brings the buttons back up.
- Once all tool permission requests have been dispositioned
  - The "undo" control for each approval is removed
  - The approval message is sent to the chat session (triggering the normal "Waiting for Response" status)
- From the beginning of this permission request cycle until the next response is returned from the chat session, the input controls are disabled.

## TODO

UX still looks like shit - clean it up (make it look more like tool call results)

## NEXT - Integration permission request with tool call in chat tab display

UX should integrated the tool call permissions with results so the AI response is just a clean list as if permission was never requested

This might require use to have a user chat message ID or something so we can understand when a response is a resolution of previous tool approvals (and integrate them)

## LATER - CLI support for tool permission processing

With the CLI, we may get multiple tool approval requests, but we'll still process them once at a time (when all are answered we submit approval message)
