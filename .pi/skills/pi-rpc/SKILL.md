---
name: pi-rpc
description: >-
  Pi-mono RPC mode protocol. USE WHEN asked about --mode rpc, --mode
  json, strict JSONL framing (LF-only, U+2028/U+2029 hazards in Node
  readline), the RpcCommand catalog (prompt,
  steer, follow_up, abort, clear_queue, new_session, set_model, compact, bash, fork,
  clone, get_state in rpc-types.ts), the event stream (agent_*,
  turn_*, message_*, tool_execution_*, queue_update, compaction_*,
  auto_retry_*, extension_error), assistantMessageEvent deltas
  (text_delta, toolcall_*, done) and the wire-vs-SDK `partial` split,
  message_update's top-level usage, streamingBehavior steer vs followUp, the extension_ui_request / extension_ui_response
  sub-protocol (select / confirm / input / editor dialogs vs notify /
  setStatus / setWidget / setTitle / set_editor_text), or RpcClient.
  Also USE WHEN debugging stuck commands, hung extension
  dialogs, framing corruption, "agent already streaming" errors, an abort that
  no longer returns immediately, or a queued steering/follow-up message you need
  to cancel and hand back to the user. Do
  NOT use for hook events / ExtensionAPI (pi-extensions), session JSONL
  format (pi-sessions), system prompt (pi-prompt-assembly), path discovery
  (pi-architecture), provider / auth (pi-providers), or non-pi topics.
---

# pi-rpc

Pi RPC mode reference: protocol shape, command catalog, event stream, and the extension UI sub-protocol. Each `reference/*.md` is a focused deep-dive with file:line cites — read the matching one rather than reconstructing from memory.

## Reference index

- `reference/protocol.md` — strict JSONL framing rules (LF-only, U+2028/U+2029 hazards), full RpcCommand catalog with arg/return shapes and source-line cites, full event catalog including `assistantMessageEvent` delta types. Cites `rpc-types.ts`, `rpc-mode.ts`, `jsonl.ts`, and the canonical doc at `packages/coding-agent/docs/rpc.md`.
- `reference/extension-ui-bridge.md` — the request/response sub-protocol for extension UI in RPC mode. Tabulates each method (`select`, `confirm`, `input`, `editor`, `notify`, `setStatus`, `setWidget`, `setTitle`, `set_editor_text`) by dialog-vs-fire-and-forget, response shape, and timeout-resolves-to-default semantics. The canonical "why does my extension hang in RPC?" reference.
- `reference/sdk-embedding.md` — in-process `createAgentSession` / `AgentSession` (`sdk.ts:39-88, 193-...`) vs subprocess `RpcClient` (`rpc-client.ts:55-533`): decision matrix, lifecycle (`start` / `stop` / `send` / `handleLine`), 30-second request timeout, request-id correlation via `pendingRequests`, when to pick which.
- `reference/json-mode.md` — the one-shot `pi --mode json "<prompt>"` variant. Same `AgentSessionEvent` stream as RPC (header line first, then events) but no command channel and no extension UI bridge. Implemented in `print-mode.ts:103-118` alongside `--mode text`.

## Quick start when asked

- "How do I frame messages on the wire?" → `reference/protocol.md`. LF-only, strip optional trailing `\r`. Do **not** use Node `readline` — it splits on U+2028/U+2029 which are valid inside JSON strings (`rpc/jsonl.ts:13-21`, `rpc.md:29-40`). Use `attachJsonlLineReader` from `jsonl.ts` or replicate its loop.
- "What command does X?" / "What does the response for Y look like?" → `reference/protocol.md` (command table). Source-of-truth wire types: `packages/coding-agent/src/modes/rpc/rpc-types.ts` (297 lines at v0.85.1, the entire schema in one file) — **but for the `message_update` payload specifically, `rpc-types.ts` is NOT sufficient**; the shape is produced by `modes/json-event.ts`. See the warning in `reference/protocol.md` § delta types.
- "How do I cancel queued input without losing what the user typed?" → `clear_queue` (new in 0.84.4). It returns the queued `steering` / `followUp` strings so you can restore them in the editor. For Esc-key behavior send `clear_queue` **before** `abort` — `abort` alone continues messages still queued.
- "What events fire during a prompt?" → `reference/protocol.md` (event table). Order: `agent_start` → (per turn: `turn_start` → `message_start` → many `message_update` → `message_end` → optional `tool_execution_*` → `turn_end`) → `agent_end` (carries `willRetry`; not terminal if `true`) → `agent_settled` (**new in 0.80.x** — the true end-of-run signal that `waitForIdle` resolves on). Plus `queue_update`, `compaction_*`, `auto_retry_*`, `extension_error` cross-cutting.
- "Why does my extension hang in RPC mode?" → `reference/extension-ui-bridge.md`. Awaited `ctx.ui` methods (select / confirm / input / editor) emit `extension_ui_request` and **wait** for an `extension_ui_response` with matching `id`. If the host doesn't reply, only `signal` or `timeout` (resolves to default) unblocks them.
- "Subprocess or in-process?" → If the host is Node/TS, prefer in-process `AgentSession` (`packages/coding-agent/docs/sdk.md`). Use `RpcClient` (`rpc-client.ts`) when you need process isolation or you're shelling out from a non-Node host.
- "What's the difference between `--mode rpc` and `--mode json`?" → `--mode json` is one-shot (a single prompt argument, no stdin command channel) but emits the same event stream. `--mode rpc` is bidirectional (commands on stdin, responses + events on stdout).
- "How big will the context be after compaction?" → since 0.79.8, `compact` response and `compaction_end` event carry `estimatedTokensAfter` alongside the existing `tokensBefore`. It's a heuristic estimate over the rebuilt message context immediately after compaction, **not a provider-exact token count**. Source: `CompactionResult.estimatedTokensAfter` at `core/compaction/compaction.ts:133`; documented at `docs/rpc.md` (`compact` response and `compaction_end` event sections).
- "How do I know whether the host needs to handle project trust?" → you don't, if you set `defaultProjectTrust: "always"` in `~/.pi/agent/settings.json` or install a global `project_trust` extension. Otherwise, headless RPC in untrusted cwds drops project-local `.pi/` resources silently. See **pi-architecture** “Project trust gating (0.79.x)”.

## Citation discipline

Always cite `path:line` from pi-mono source. Reference files hold the canonical citations — copy from there rather than reconstructing from memory.
