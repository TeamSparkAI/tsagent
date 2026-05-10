# LangChain + LangGraph in TsAgent

This document describes **how the agent’s chat LLM layer works today** (LangChain **+** LangGraph in **`@tsagent/core`**) and **what we intend to improve next**. For provider config, descriptors, and the `Provider` / factory pattern, see [PROVIDER_ARCHITECTURE.md](./PROVIDER_ARCHITECTURE.md).

**Runtime:** TypeScript on **npm** — **`@langchain/core`**, scoped **`@langchain/*`** chat integrations, and **`@langchain/langgraph`**. This doc says **LangChain** / **LangGraph** without a **`.js`** suffix unless referring to a package name.

---

## Why LangChain and LangGraph

Previously, **chat lived behind each provider’s own `generateResponse`**: turn the full **`ChatMessage[]`** into whatever the vendor needed, run **multi-step tool** loops inside that method, branch on **consent / approval**, enforce **turn caps**, and map everything into **`ModelReply`**. Session history doubled as **model context**: large transcripts were effectively re-serialized for every call, and **tool orchestration** duplicated across providers.

Today:

- **`ProviderDescriptor`** (via **`ProviderFactory.createChatModel`**) only **builds a LangChain `BaseChatModel`** from resolved config — **`buildChatModel`** per `providerId`. It does **not** own the chat loop, checkpoints, or tool execution.
- **`ChatSession`** still owns the **product transcript** (**`ChatMessage[]`**, persistence, approval UI) but drives **one** implementation path for generation: **`runLangGraphChat`** in `packages/agent-api/src/providers/langchain/langgraph-chat-runner.ts`.
- **LangGraph** owns **checkpointed `messages`**, the **model ↔ tool** loop, and **`interrupt` / `Command.resume`** when consent requires a human gate before a tool runs. **LangChain** supplies **`BaseChatModel`**, **`bindTools`** (when the model supports it), and standard **message types** used inside that graph.

So: **descriptors configure the model; the graph owns inference-time thread state and tool rounds; the session maps graph results back to the transcript and existing UX types.**

---

## As-built architecture

### Layering

| Layer | Owner | Role |
|--------|--------|------|
| Shell / apps | This product | CLI, desktop, etc. call **`ChatSession`** only — no LangChain imports in apps. |
| **`ProviderDescriptor`** | This product | Zod config, secrets resolution, **`getModels()`**, **`buildChatModel`** → vendor **`BaseChatModel`** (via shared **`ProviderDescriptor.createChatModel`**). |
| **LangGraph + checkpointer** | LangGraph (wired in `agent-api`) | **`StateGraph`**, **`messages`** reducer, **`MemorySaver`**, **`thread_id`**, **`call_model` / `apply_tools`** loop, **`interrupt`** for gated tools. |
| **`ChatSession` + runner mapping** | This product | Builds per-turn inputs, calls **`runLangGraphChat`**, handles **approval messages**, maps graph output → **`ModelReply`** and transcript rows. |

### Chat hot path

1. User message (or approval) enters **`ChatSession.handleMessage`**.
2. Session builds the **LangChain `BaseMessage[]`** slice it needs for this turn (including context from **`buildRequestContext`** — see [Context and rules today](#context-and-rules-today)).
3. Session obtains a **`BaseChatModel`** from **`ProviderFactory.createChatModel`** (installed config → descriptor → **`buildChatModel`**).
4. Session calls **`runLangGraphChat(session, agent, logger, model, messages, options)`** with:
   - a **per-session `MemorySaver`** checkpointer,
   - **`useMessageDeltas: true`** and **`graphAppendChatMessages`** so that after the **first** graph invoke (full **prime**), later **user** turns append **only new** messages into the checkpointed thread,
   - **`configurable.thread_id`** = TsAgent **session id** (stable for **`Command({ resume })`** after **`interrupt`**).

On provider / model switch, the session clears the graph thread (**`deleteThread`**) so tool state does not leak across models.

### Graph shape (today)

- **`StateGraph`** with checkpointed state: at least **`messages`** (LangGraph **`messagesStateReducer`**), **`turnCount`**, **`needsAnotherModelRound`**, **`draftTurn`** (working state for mapping into **`ModelReply`**; not treated as a second full transcript).
- **Nodes:** **`call_model`** invokes the (possibly **`bindTools`**-wrapped) **`BaseChatModel`**; **`apply_tools`** runs MCP tools via **`ProviderHelper`**, appends **`ToolMessage`s**, and when consent requires approval, **`interrupt`s** with the same **`pendingToolCalls`** shape the UI already expects.
- **Edges:** model → (tool calls?) → **`apply_tools`** → loop until no more tool work or **turn cap**; there is **no** separate **`human_approval`** node — the pause is **inside `apply_tools`**.
- **Invocation:** the runner uses **`.invoke()`** only today (**`stream`** is not wired through to the UI yet). A **new** compiled graph is built **per `runLangGraphChat` call**; persistence for **`Command.resume`** comes from the **session-held checkpointer** instance.

### Tools and `bindTools`

MCP tools are turned into LangChain-callable tools; when the model exposes **`bindTools`**, the runner binds them with **`tool_choice: 'auto'`**. If a **`BaseChatModel` does not implement `bindTools`**, the runner logs a warning and continues **chat-only** (no MCP tools bound for that model).

### Consent and approval

- Tools that **may run** under current session consent execute inside **`apply_tools`** and produce **`ToolMessage`s** without pausing the graph.
- When **`session.isToolApprovalRequired`** says a call needs a gate, **`apply_tools`** **`interrupt`s** with **`pendingToolCalls`**; the UI responds; on resume, **`Command({ resume })`** carries **`materializeToolCallApprovals`** output so **`ToolMessage`s** still land in checkpointed **`messages`**.
- If there is **no** paused interrupt on the checkpointer (e.g. some tests), **`appendApprovalMessagesToHistory`** still applies approvals from the transcript path — same helper as the interrupt materialization path.

### Transcript vs model thread

**Two histories, on purpose:**

- **`ChatMessage[]`** — full **audit / UI** log (user, assistant, tool rows, errors). Persisted and shown as today.
- **Checkpointed graph `messages`** — what the **model** actually sees for the **live** session. Filled via **prime + deltas + tool/assistant rounds**, **not** by dumping the entire transcript every turn.

They are **not** kept identical; the transcript grows from **mapped graph results**. After restart, **only the transcript** reloads from product persistence today — **graph checkpoints are not rehydrated** (see [Out of scope](#out-of-scope)).

### Checkpoint message window

Before each **`call_model`** invoke, if checkpointed **`messages`** exceed a cap (**default 100** by message **count**), the runner emits LangGraph **`RemoveMessage`** updates for the **oldest** messages (by stable **`id`**), calls **`BaseChatModel.invoke`** on the **tail** slice only, then merges the new assistant message through **`messagesStateReducer`**. Implementation: `packages/agent-api/src/providers/langchain/langgraph-message-window.ts`; wiring in **`runLangGraphChat`** (`langgraph-chat-runner.ts`). Override the default by passing **`graphMessageWindowMax`** in **`RunLangGraphChatOptions`** from **`ChatSession`** when calling **`runLangGraphChat`**.

**Caveats:**

- **Count, not tokens** — The cap is **number of LangChain messages**, not an input-token or character budget. A single very long message still counts as one message toward the cap.
- **Oldest-first truncation** — Messages are dropped from the **start** of the checkpoint list. That can **split a tool episode** in principle (e.g. dropping an **`AIMessage`** that issued **`tool_calls`** while leaving later **`ToolMessage`s** or vice versa), which can confuse models. **Token-aware `trimMessages`** and **pair-aware** trimming (keep **`AIMessage` + `ToolMessage`** groups intact) are **not** implemented here; they remain [roadmap](#roadmap) improvements.
- **`id` required to remove** — Each dropped message must have a non-empty **`id`** (the LangGraph reducer normally assigns UUIDs when state merges). If a message that needs trimming has **no `id`**, the runner **throws** with an explicit error instead of silently corrupting state.
- **Window applied on `call_model` only** — **`apply_tools`** can append **`ToolMessage`s`** and push **`messages`** above the cap until the **next** **`call_model`** step, which trims again.
- **Transcript is unaffected** — The product **`ChatMessage[]`** / UI log stays **full**; only **checkpointed graph `messages`** are bounded.

### Context and rules (today)

**Ground truth:** rules and references use **`include: 'always' | 'manual' | 'agent'`**; tools use the same three-way mode where applicable. **`ChatSession.buildRequestContext`** builds a **`RequestContext`** (**always** + **manual** pins, then **`agent`** items via embedding similarity to the current user text). **`promptRequestContext`** reuses the last built context on **approval continuations** of the same user turn (**frozen context**).

That context is still folded into the **`BaseMessage[]`** the session sends into the runner (including **synthetic `HumanMessage` lines** for “Reference:” / “Rule:” style content). **Design debt we accept for now:** dialog and retrieved context share the same message list at the LangChain boundary; a future **`prepare_context`** graph step should separate **system / structured blocks** from **dialog** (see [Roadmap](#roadmap)).

---

## Request frame

Rules, references, and **RAG-style chunks** are **invisible in the product UI** but steer the model. They are **not** something the user can name in follow-ups (“use the same chunk as turn 3”). Continuity for vague follow-ups (“do that again”, “same as above”) is usually anchored on **visible assistant text**, not on re-sending raw blobs forever.

A practical pattern is a **per-prompt request frame**: latched **semantic selections** (rules, refs, retrieval hits) and, optionally, a **tool allowlist** used for **`bindTools`**, kept in **graph state (or session state) outside `messages`**, not as synthetic chat turns.

### Behavior

- On a **primary user prompt** (or equivalent “new intent” signal), run **`buildRequestContext`** / semantic search / RAG as today and **store the result in the frame** (e.g. structured list + scores, or paths to backend-stored blobs).
- On each **`call_model`** for the next **K** graph turns (or until a **refresh** event), **re-project** the frame into the **invoke payload**: e.g. merged **system** / clearly delimited **context blocks**, **not** extra **`HumanMessage`s** pretending to be user speech.
- **`messages`** / checkpoint history stays **dialog + tool results**; the frame is **orthogonal**. Same idea as **tool definitions**: available every turn without being “chat history.”

### Tools

**“Do that again”** does not tell the model which MCP tools were semantically selected. Latching **the same tool set** as last turn (for a bounded window), or **union(semantic picks, tools actually invoked, always-include)**, improves recall at the cost of **extra tools in context** (distraction vs coverage tradeoff).

### LangGraph mapping

Add annotation fields such as **`requestFrame`**, **`frameTurnsRemaining`**, or **`frameId`**. **`call_model`** builds **`messages` + frame → final list** and applies **`bindTools(frame.tools)`**. This aligns with LangGraph idioms: **state that is not the `messages` reducer** still shapes each model call.

### When to refresh the frame

- New **top-level user intent** (fresh semantic search, new `@ref` / `@rule`, explicit “new topic” if the product adds it).
- **K exhausted** or **approval / prompt episode** boundaries (same spirit as today’s **`promptRequestContext`** freeze across approval turns — that freeze is one instance of “don’t reshuffle context mid-episode”).
- **Model or provider switch** (already a natural reset in the product).

### Caveats

- **Stale frame** if the user changes subject without a signal you treat as a new prompt; mitigations include embedding drift heuristics or UI affordances.
- **Tokens**: re-injecting **full** RAG every turn for **K** turns still costs; consider **shrinking** the frame after the first model round (citations, short summary) while keeping **policy** text tight.
- **Roles**: avoid encoding retrieved text as **`HumanMessage`** so the model is not misled about **provenance** (user vs system vs retrieved).

### Relation to the roadmap

The roadmap’s **`prepare_context` graph node** and “separate system / structured blocks from dialog” item are the implementation home for this pattern. It does **not** require raw blobs to live in **permanent** message history; it does require **explicit** refresh and projection rules.

---

## Built-in providers (`buildChatModel`)

Registered in **`ProviderFactory`** (`packages/agent-api/src/providers/provider-factory.ts`). Use upstream [JavaScript / TypeScript chat integrations](https://docs.langchain.com/oss/javascript/integrations/chat) to confirm class names for the versions you pin.

**Note:** `providerId` **`bedrock`** is the AWS Bedrock integration; there is no separate `aws` id.

| `providerId` | Integration | LangChain class (typical) |
|----------------|-------------|---------------------------|
| `openai` | OpenAI API | `ChatOpenAI` (`@langchain/openai`) |
| `claude` | Anthropic API | `ChatAnthropic` (`@langchain/anthropic`) |
| `gemini` | Google Generative AI | `ChatGoogleGenerativeAI` (`@langchain/google-genai` or current scoped package) |
| `bedrock` | Amazon Bedrock | `ChatBedrockConverse` (`@langchain/aws`) |
| `ollama` | Ollama HTTP API | `ChatOllama` (`@langchain/ollama`) |
| `docker` | [Docker Model Runner](https://docs.docker.com/ai/model-runner/) — OpenAI-compatible **`BASE_URL`** | `ChatOpenAI` with `configuration.baseURL` |
| `test` | In-repo mock | **`FakeListChatModel`** (`@langchain/core/utils/testing`) and scripted **`fixture:*`** **`BaseChatModel`** subclasses for tests |

**Local in-process GGUF** (`providerId` **`local`**) is **removed**; use **`ollama`** or **`docker`** (Docker Model Runner) for local models.

### `test` provider

Useful for **manual / dev** runs without API keys: same **session → graph** path as production with canned **`FakeListChatModel`** lines, or **`fixture:*`** model ids for Jest (`run-langgraph-chat.integration.test.ts`) to exercise tools and approval without network.

---

## Operational notes

- **Pin `@langchain/*`** together; keep imports in **descriptor** and **langgraph** modules to limit churn blast radius.
- **Gemini:** follow current LangChain docs for the recommended Google-scoped package and class name.
- **Docker Model Runner:** tool calling, streaming, and auth follow whatever Model Runner exposes at **`BASE_URL`** — verify against [Docker’s Model Runner documentation](https://docs.docker.com/ai/model-runner/).
- **Checkpointer:** **`MemorySaver`** is **in-memory for the live session** only — no disk-backed checkpoint store and no **post-restart graph restore** in the product today.

---

## Roadmap

Priorities are a product call; this is the technical backlog aligned with the as-built design.

### Near-term improvements

| Item | Intent |
|------|--------|
| **Streaming** | Wire **`graph.stream`** (or the recommended API for the pinned LangGraph version) and map chunks to the UX where it helps. |
| **`prepare_context` graph node** | Move **`buildRequestContext` / `promptRequestContext`**-shaped work into the graph; reduce **synthetic `HumanMessage`** context rows; optional **`contextVersion`** when pins / **`always`** / semantic **`agent`** sets change. See [Request frame (design direction)](#request-frame). |
| **Token / pair-aware window** | Today: **count-only** sliding window (default 100) via **`RemoveMessage`** before **`call_model`** — see [Checkpoint message window](#checkpoint-message-window). Next: **`trimMessages`** (token budget) and **tool-call chain** integrity so trims never break **`AIMessage` ↔ `ToolMessage`** groupings. |
| **Resume / log polish** | LangGraph can re-enter **`apply_tools`** from the top on **`Command.resume`** — logging should not look like a **second** user interrupt when no new prompt was shown. |
| **Integration tests** | Extend coverage as streaming, trim, and edge multi-turn cases land. |
| **Build hygiene** | Run **`packages/agent-api` `npm run build`** before **`apps/desktop`** when using **`file:`** **`@tsagent/core`** so the desktop bundle never picks up a stale build. |

### Out of scope (for now)

- **Persisted checkpointers** (SQLite, Postgres, etc.) and **rehydrating** graph **`messages`** after process or tab restart — needs product decisions on identity, retention, and security.
- **RunnableWithMessageHistory** as the **primary** chat owner — **not** the direction; LangGraph stays the orchestration home.

### Optional later

- Chunked RAG / on-demand “read reference” tools for very large bodies.
- Prompt-cache–friendly **versioned** static system prefixes where providers benefit (e.g. Anthropic).
- Cross-tab or shared graph threads — only if a future feature requires it.
- Desktop / Electron bundling strategy for **`@tsagent/core`** if bundle size becomes a concern.

---

## Related documents

- [PROVIDER_ARCHITECTURE.md](./PROVIDER_ARCHITECTURE.md) — descriptors, factory, `Provider` surface  
- [ARCHITECTURE.md](./ARCHITECTURE.md) — overall platform architecture  
- [WORK_ITEMS.md](./WORK_ITEMS.md) — backlog-style tasks
