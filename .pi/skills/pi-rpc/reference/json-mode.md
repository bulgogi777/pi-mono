# `--mode json` (One-shot Event Stream)

The legacy / lighter-weight sibling of `--mode rpc`. One-shot: pi takes the prompt as an argument, runs to completion, emits the full event stream as JSONL on stdout, then exits. **No command channel** — the host cannot send `steer`, `abort`, `compact`, etc. mid-run. All cites against pi-mono at the current pin (`v0.85.1`, `d981de12`). User-facing doc: `packages/coding-agent/docs/json.md`.

## Invocation

```bash
pi --mode json "Your prompt here"
```

`--mode` is parsed at `packages/coding-agent/src/cli/args.ts:76-80`; valid values are `"text" | "json" | "rpc"` (`args.ts:11`). When `json`, `main.ts:114-115` selects the `"json"` app mode, which routes to `print-mode.ts` with `mode: "json"` (`main.ts:124`).

The implementation lives in `packages/coding-agent/src/modes/print-mode.ts` — the same module that also handles `--mode text`. The split is decided by the `mode` field on `PrintModeOptions` (`print-mode.ts:19-20`):

```ts
mode: "text" | "json"
```

So "print mode" is a single one-shot dispatcher; `text` flavors print the final assistant message; `json` flavors stream all events.

## Output shape

`print-mode.ts:103-112` is the event sink:

```ts
unsubscribe = session.subscribe((event) => {
  if (mode === "json") {
    writeRawStdout(`${JSON.stringify(event)}\n`);
  }
});
```

Plus `print-mode.ts:122-128` writes the session header as the first line:

```ts
if (mode === "json") {
  const header = session.sessionManager.getHeader();
  if (header) {
    writeRawStdout(`${JSON.stringify(header)}\n`);
  }
}
```

So the output stream is:

```
{"type":"session","version":3,"id":"<uuid>","timestamp":"...","cwd":"..."}
{"type":"agent_start"}
{"type":"turn_start"}
{"type":"message_start","message":{...}}
{"type":"message_update","message":{...},"assistantMessageEvent":{"type":"text_delta","delta":"Hello",...}}
...
{"type":"message_end","message":{...}}
{"type":"turn_end","message":{...},"toolResults":[...]}
{"type":"agent_end","messages":[...],"willRetry":false}
{"type":"agent_settled"}
```

The events are exactly the `AgentSessionEvent` union (`packages/coding-agent/src/core/agent-session.ts:144-185`):

- `AgentEvent` base: `agent_start`, `agent_end`, `turn_start`, `turn_end`, `message_start`, `message_update`, `message_end`, `tool_execution_start`, `tool_execution_update`, `tool_execution_end`. Note the pi override of `agent_end` adds `willRetry: boolean` (`agent-session.ts:147-150`).
- pi-coding-agent additions: `agent_settled` (**new in 0.80.x** — the true end-of-run signal, emitted after the final `agent_end`), `queue_update`, `compaction_start`, `compaction_end`, `auto_retry_start`, `auto_retry_end`, `entry_appended`, `session_info_changed`, `thinking_level_changed`.

Same set as RPC mode. The wire format per event is identical to RPC's events (which is documented in `reference/protocol.md`).

## What's NOT in `--mode json` that IS in `--mode rpc`

| Feature | `--mode rpc` | `--mode json` |
|---|---|---|
| Command channel (stdin) | ✓ — full `RpcCommand` set | ✗ — stdin ignored |
| Response messages (`type: "response"`) | ✓ | ✗ — no commands, no responses |
| Extension UI bridge (`extension_ui_request`) | ✓ | ✗ — `ctx.hasUI` is `false`; dialogs resolve to defaults |
| `extension_error` events | ✓ — surfaced via `runtime.onError` | ✓ — emitted to stderr (see `print-mode.ts:102-104`) |
| Multi-turn / interactive | ✓ — host can `prompt` repeatedly | ✗ — single prompt then exit |
| Steer / follow-up / abort | ✓ — RPC commands | ✗ — no command channel |
| Session continuation across runs | ✓ via `--continue` / `--session` | ✓ via `--continue` / `--session` (same flags work) |

Pi `--mode json` is best understood as "run pi non-interactively and dump the event stream to stdout for jq-style consumption." It's what you reach for when you want to pipe pi into another tool:

```bash
pi --mode json "List files" 2>/dev/null | jq -c 'select(.type == "message_end")'
```

## Stdin in `--mode json`

Stdin is **not used as a command channel** — but pi still reads it for `@file` argument expansion and other CLI conventions before entering print mode. Once the agent is running, stdin is closed (or left untouched) and not consulted further.

## Session events you do see

Because `print-mode.ts` calls `session.subscribe`, every event the `AgentSession` emits flows through. This includes:

- `compaction_start` / `compaction_end` if the prompt triggers compaction.
- `auto_retry_start` / `auto_retry_end` if the call hits a transient error.
- `extension_error` if any installed extension throws (also stderr-logged).

Hosts consuming `--mode json` should be ready for these auxiliary events and not assume the stream is purely `agent_*` / `message_*`.

## When to use `--mode json` vs `RpcClient`

- **One-shot scripts and pipelines**: `--mode json`. Lighter, simpler — no client library, just `pi --mode json "..." | jq`.
- **Multi-turn integrations**: `RpcClient` (or `--mode rpc` with your own client). Anything that needs steer / abort / compact / dynamic prompts mid-run requires the command channel.
- **Cross-language scripts**: `--mode json` is the lowest-friction starting point. Read stdout, parse JSONL, done.
- **Embedding pi as a long-lived service**: `RpcClient`. Subprocess stays up; you stream commands through it.

## Common gotchas

- **`stderr` is not silenced** by default. The `2>/dev/null` in the example above is essential when piping stdout to `jq`. Pi may print warnings (e.g. the Anthropic subscription-auth warning) to stderr.
- **First line is the session header, not an event.** Hosts that filter for `type === "agent_start"` should still expect the `type === "session"` header line at position 0.
- **No `id` field on any line.** RPC events don't have IDs; responses do, but `--mode json` has no responses. Don't write client code that depends on `id`-correlation.
- **Compaction and auto-retry cross-cut the event stream.** Long prompts that overflow context will produce `compaction_start` → `compaction_end` mid-stream (between `turn_end` and the next `turn_start`). Streaming consumers must tolerate these.
- **`extension_ui_request` events do NOT appear in `--mode json`** because the bridge isn't wired. Extensions calling `ctx.ui.confirm(...)` will see the dialog resolve to the default value (e.g. `false` for `confirm`). See **pi-extensions** `reference/ui-context.md` for default-resolution semantics.

## Cross-references

- Full event-stream catalog (the same events `--mode json` and `--mode rpc` emit): `reference/protocol.md` "Event stream" section.
- The `AgentSessionEvent` union definition: `packages/coding-agent/src/core/agent-session.ts:144-185`.
- The `print-mode.ts` `text` vs `json` split: `packages/coding-agent/src/modes/print-mode.ts:19-20`.
- For the RPC command channel and full bidirectional protocol: `reference/protocol.md`.
- For embedding strategy comparison (in-process vs subprocess): `reference/sdk-embedding.md`.
