# Agent Supervision

The general concept is that we want to imlement an agent supervisor mechanism that can hook the conversation between any client (human user or agent user) and any agent. The supervisor should have full access to the state of the conversation and be able to drive the conversation itself. 

The supervisor should have access to, and the ability to modify:
- The system prompt
- References
- Rules
- Tools
- Conversation context (message history, summarizations)
- Message payload

The supervisor will understand the direction of the message flow.

The supervisor can send multiple messages to the executor agent, for example to test and tune.

The supervisor my elect to send multiple responses to the user (if human user) to let them indicate a preference. The supervisor will receive notification of selected response (with full context, including other responses).

The supervisor need not itself be an agent (but will sometimes employ an agent).
- When the supervisor is an agent, it will have its own system prompt, rules, references, and tools
- Its tools will include the ability to modify the context of the executor agent (system prompt, rules, references, tools, context/history, etc).

Maybe supervisors should have permissions (so it's clear what they are allowed to do, especially to the executor agent state and the conversation).

## Contect Curator Supervisor Agent

Uses request (and message history) to determine which references, rules, and tools should be brought into the processing context, and then actually brings those things into the context (for the current request, maybe also future requests).

This agent could also summarize message history to reduce the context size and to focus on the key information in the context.

If "implicit" context (refs/rules/tools) are pulled in and left in context for some number of turns, this agent could detect when they are no longer relevant and remove them.

## Architect Supervisor Agent

An archtiect is a supervisor whose job is to build and tune an executor agent to perform a specific function. It could do this by observing conversations and building rules and references for the executor agent. It may test multiple message paths, either comparing the outputs itself or letting the user indicate their preference. It could replay steps in the conversation after mutating context to determine if the mutations were effective (with or without the user in the loop).

A very simple example would be a "memory agent" that just picks key facts out of messages (in both directions) and adds them to references (new or existing, as appropriate). It could prompt the user to decide (or give the selected memories as options the user could choose to enact).

## Guardian Supervisor

A guardian is a a supervisor that can watch conversations and implement specific guardrails, for example, to prevent various content from flowing in either direction.

## Collection Supervisor

A collection agent is a read-only agent that monitors the conversation and writes all messages to an external system (log, data store, OpenTelemety, etc) for future evaluation.

## Similar concepts

LangGraph - Supervisor Agent / Ochestrator
LangChain - Callback handlers (hooks)

## Notes

Passive observation - A supervisor is passed an entire conversation after the fact (limited actions).

Active interaction - A supervisor is in the conversation loop in real-time (full control, subject to priviledges).
