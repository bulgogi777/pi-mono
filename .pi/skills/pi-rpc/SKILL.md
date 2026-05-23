---
name: pi-rpc
description: >-
  Pi-mono RPC mode protocol. USE WHEN asked about --mode rpc, --mode
  json, strict JSONL framing (LF-only, U+2028/U+2029 hazards in Node
  readline), the RpcCommand catalog (prompt,
  steer, follow_up, abort, new_session, set_model, compact, bash, fork,
  clone, get_state in rpc-types.ts), the event stream (agent_*,
  turn_*, message_*, tool_execution_*, queue_update, compaction_*,
  auto_retry_*, extension_error), assistantMessageEvent deltas
  (text_delta, toolcall_*, done), streamingBehavior steer vs followUp, the extension_ui_request / extension_ui_response
  sub-protocol (select / confirm / input / editor dialogs vs notify /
  setStatus / setWidget / setTitle / set_editor_text), or RpcClient.
  Also USE WHEN debugging stuck commands, hung extension
  dialogs, framing corruption, or "agent already streaming" errors. Do
  NOT use for hook events / ExtensionAPI (pi-extensions), session JSONL
  format (pi-sessions), system prompt (pi-prompt-assembly), path discovery
  (pi-architecture), provider / auth (pi-providers), or non-pi topics.
---

# pi-rpc

Pi RPC mode reference: protocol shape, command catalog, event stream, and the extension UI sub-protocol. Each `reference/*.md` is a focused deep-dive with file:line cites — read the matching one rather than reconstructing from memory.

## Reference index

- `reference/protocol.md` — strict JSONL framing rules (LF-only, U+2028/U+2029 hazards), full RpcCommand catalog with arg/return shapes and source-line cites, full event catalog including `assistantMessageEvent` delta types. Cites `rpc-types.ts`, `rpc-mode.ts`, `jsonl.ts`, and the canonical doc at `packages/coding-agent/docs/rpc.md`.
- `reference/extension-ui-bridge.md` — the request/response sub-protocol for extension UI in RPC mode. Tabulates each method (`select`, `confirm`, `input`, `editor`, `notify`, `setStatus`, `setWidget`, `setTitle`, `set_editor_text`) by dialog-vs-fire-and-forget, response shape, and timeout-resolves-to-default semantics. The canonical "why does my extension hang in RPC?" reference.
- `reference/sdk-embedding.md` — in-process `createAgentSession` / `AgentSession` (`sdk.ts:33-90, 193-...`) vs subprocess `RpcClient` (`rpc-client.ts:54-515`): decision matrix, lifecycle (`start` / `stop` / `send` / `handleLine`), 30-second request timeout, request-id correlation via `pendingRequests`, when to pick which.
- `reference/json-mode.md` — the one-shot `pi --mode json "<prompt>"` variant. Same `AgentSessionEvent` stream as RPC (header line first, then events) but no command channel and no extension UI bridge. Implemented in `print-mode.ts:103-118` alongside `--mode text`.

## Quick start when asked

- "How do I frame messages on the wire?" → `reference/protocol.md`. LF-only, strip optional trailing `\r`. Do **not** use Node `readline` — it splits on U+2028/U+2029 which are valid inside JSON strings (`jsonl.ts:13-21`, `rpc.md:29-40`). Use `attachJsonlLineReader` from `jsonl.ts` or replicate its loop.
- "What command does X?" / "What does the response for Y look like?" → `reference/protocol.md` (command table). Source-of-truth wire types: `packages/coding-agent/src/modes/rpc/rpc-types.ts` (264 lines, the entire schema in one file).
- "What events fire during a prompt?" → `reference/protocol.md` (event table). Order: `agent_start` → (per turn: `turn_start` → `message_start` → many `message_update` → `message_end` → optional `tool_execution_*` → `turn_end`) → `agent_end`. Plus `queue_update`, `compaction_*`, `auto_retry_*`, `extension_error` cross-cutting.
- "Why does my extension hang in RPC mode?" → `reference/extension-ui-bridge.md`. Awaited `ctx.ui` methods (select / confirm / input / editor) emit `extension_ui_request` and **wait** for an `extension_ui_response` with matching `id`. If the host doesn't reply, only `signal` or `timeout` (resolves to default) unblocks them.
- "Subprocess or in-process?" → If the host is Node/TS, prefer in-process `AgentSession` (`packages/coding-agent/docs/sdk.md`). Use `RpcClient` (`rpc-client.ts`) when you need process isolation or you're shelling out from a non-Node host.
- "What's the difference between `--mode rpc` and `--mode json`?" → `--mode json` is one-shot (a single prompt argument, no stdin command channel) but emits the same event stream. `--mode rpc` is bidirectional (commands on stdin, responses + events on stdout).

## Citation discipline

Always cite `path:line` from pi-mono source. Reference files hold the canonical citations — copy from there rather than reconstructing from memory.
