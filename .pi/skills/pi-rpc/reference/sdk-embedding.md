# SDK Embedding — `AgentSession` vs `RpcClient`

Two ways to embed pi from a host program: in-process (`AgentSession` / `createAgentSession` from `@mariozechner/pi-coding-agent`) or subprocess (`RpcClient` from the same package, which spawns a `pi --mode rpc` child). All cites against pi-mono at the current pin (`v0.85.1`, `d981de12`). SDK doc: `packages/coding-agent/docs/sdk.md`.

## Decision matrix

| Concern | In-process `AgentSession` | Subprocess `RpcClient` |
|---|---|---|
| Host language | Node.js / Bun / TS only | Any language that can spawn a process and read JSONL |
| Process isolation | None — share host's process | Separate process; pi crashes don't crash host |
| Memory & FD overhead | Minimal | Full Node process per pi instance |
| Latency | Direct function call | Stdio JSONL framing |
| Custom tools / extensions | Pass directly via `customTools` and inline factories | Must live as `.ts` files pi loads at startup; see `pi-extensions/reference/loading.md` |
| Multi-instance | Run multiple `AgentSession` instances in parallel within one process | Multiple subprocesses |
| Hot-reload of pi changes | Re-import or restart host | Restart subprocess |
| Recommended for | Node/TS hosts, embedding pi as a library | Cross-language hosts (Python, Go, Rust, …); process-level fault isolation |

The pi docs say it directly (`docs/rpc.md:5`):

> **Note for Node.js/TypeScript users**: If you're building a Node.js application, consider using `AgentSession` directly from `@mariozechner/pi-coding-agent` instead of spawning a subprocess.

## In-process: `createAgentSession(options)`

Entry point `createAgentSession` at `packages/coding-agent/src/core/sdk.ts:173`. Returns a `CreateAgentSessionResult` (`sdk.ts:91-98`):

```ts
{
  session: AgentSession;
  extensionsResult: LoadExtensionsResult;
  modelFallbackMessage?: string;
}
```

`CreateAgentSessionOptions` (`sdk.ts:39-88`) covers everything pi's CLI parses: `cwd`, `agentDir`, `authStorage`, `modelRegistry`, `model`, `thinkingLevel`, `scopedModels`, `noTools`, `tools`, `customTools`, `resourceLoader`, `sessionManager`, `settingsManager`, `sessionStartEvent`. Defaults are populated when omitted (see the JSDoc examples at `sdk.ts:172-200`).

### Minimal usage

```ts
import { createAgentSession } from "@mariozechner/pi-coding-agent";

const { session } = await createAgentSession();
session.subscribe((event) => console.log(event.type));
await session.prompt("Hello");
await session.waitForIdle();
```

`session` is an `AgentSession` instance (defined in `core/agent-session.ts`). The full method surface — `prompt`, `steer`, `followUp`, `abort`, `compact`, `setModel`, `subscribe`, `waitForIdle`, `bindExtensions`, etc. — is the same code that the RPC dispatcher calls on the receiving end. (In-process `AgentSession.waitForIdle` at `agent-session.ts:1627` waits on the internal `isIdle` promise; the subprocess `RpcClient.waitForIdle` at `rpc-client.ts:464` instead resolves on the `agent_settled` event — **new in 0.80.x**, previously `agent_end`.)

### Custom tools and inline extensions

The big win for in-process embedding: **inline factories**. `customTools: ToolDefinition[]` and inline extension factories pass directly through `CreateAgentSessionOptions` without going through file-system discovery.

```ts
const { session } = await createAgentSession({
  customTools: [myTool],
  // ... and via resourceLoader, inline extension factories
});
```

The subprocess flow can't do this — extensions must be `.ts` files pi loads from disk.

### When to use a custom `resourceLoader`

`DefaultResourceLoader` does the full pi discovery dance (paths, packages, settings.json). For tightly-controlled hosts, supply a hand-rolled `ResourceLoader` (interface in `core/resource-loader.ts:31-…`) that exposes only the resources you want.

### `shouldStopAfterTurn` (lower-level: `@mariozechner/pi-agent-core`)

v0.72.0 added a post-turn stop callback on `AgentLoopConfig` in `packages/agent`. Signature at `packages/agent/src/types.ts:196`:

```ts
shouldStopAfterTurn?: (context: ShouldStopAfterTurnContext) => boolean | Promise<boolean>;
```

`ShouldStopAfterTurnContext` (`packages/agent/src/types.ts:126-135`) carries the just-completed `message`, `toolResults`, current `context`, and the `newMessages` array this loop run will return if it exits now. Returning `true` causes the agent loop to emit `agent_end` and exit **before polling the steering or follow-up queues**, **without starting another LLM call**. The current assistant response and tool executions finish normally first.

Use case: graceful stop after a completed turn, e.g. before context gets too full or when a host has external reason to halt.

**Currently this is a `packages/agent` (pi-agent-core) primitive only.** It is **not** surfaced through `createAgentSession` or `RpcClient` in coding-agent (no occurrences in `packages/coding-agent/src/`). If you need it, either drop down to the lower-level agent loop directly or wire it through your own embedding code. Cite call site: `packages/agent/src/agent-loop.ts:238`.

## Subprocess: `RpcClient`

Class `RpcClient` at `packages/coding-agent/src/modes/rpc/rpc-client.ts:56-601`. Constructor takes `RpcClientOptions` (`:28-41`):

```ts
{
  cliPath?: string;     // path to the CLI entry; default "dist/cli.js"
  cwd?: string;
  env?: Record<string, string>;
  provider?: string;
  model?: string;
  args?: string[];      // additional CLI args appended after --mode rpc
}
```

### Lifecycle

`start()` at `:69-111`:

1. Build argv: `["--mode", "rpc"]` + `--provider` + `--model` + caller-supplied `args`.
2. `spawn("node", [cliPath, ...args], { cwd, env, stdio: ["pipe", "pipe", "pipe"] })` (`:89-93`).
3. Pipe stderr to host's stderr (also collected for debugging via `getStderr()` at `:156`).
4. Attach the **strict** JSONL line reader to stdout via `attachJsonlLineReader` (`rpc/jsonl.ts:21-58`). **Note**: the reader is LF-only and explicitly avoids Node `readline` (which splits on U+2028 / U+2029). See **pi-rpc** `reference/protocol.md` framing section.
5. Wait 100ms for the process to come up; if it has already exited, throw with the collected stderr.

`stop()` at `:115-139`:

1. Detach stdout reader.
2. SIGTERM the process.
3. Wait up to 1s for graceful exit; SIGKILL on timeout.
4. Clear pending requests.

### Command methods

The class wraps each RPC command as a typed method:

- `prompt(message, images?)` (`:168`), `steer(message, images?)` (`:175`), `followUp(message, images?)` (`:182`), `abort()` (`:189`).
- `getState()` (`:206`), `setModel(provider, modelId)` (`:214`), `cycleModel()` (`:222`), `getMessages()` (`:389`).
- `compact(customInstructions?)` (`:279`), `exportHtml(outputPath?)` (`:331`), `switchSession(sessionPath)` (`:340`), `fork(entryId)` (`:349`).

All of these go through the private `send(command)` helper at `:482-511`.

### Request correlation — `send` and `handleLine`

`send(command)` at `:482-511`:

1. Generate a unique `id` (`req_${++this.requestId}`) (`:489`).
2. Store `{ resolve, reject }` in `pendingRequests` map (`:492`).
3. Set a 30-second timeout (`:494-497`); on expiry, reject with stderr included.
4. Write `serializeJsonLine(fullCommand)` to child stdin (`:510`).
5. Return the promise; resolved when matching response arrives.

`handleLine(line)` at `:462-480`:

1. Parse JSON.
2. If `data.type === "response"` AND `data.id` matches a pending request, resolve and remove from map (`:467-472`).
3. Otherwise, treat as event — fan out to `eventListeners` (`:475-477`).
4. Non-JSON lines are silently ignored (`:478`).

### Event listeners — `onEvent`

`onEvent(listener)` at `:142-150`. Returns an unsubscribe function. Every non-response stdout line goes through every registered listener. Use this to drive your host's UI from the agent's events.

```ts
const unsubscribe = client.onEvent((event) => {
  if (event.type === "message_update") { /* render delta */ }
});
```

### Error handling

- **`success: false` responses** become rejected promises (`getData` helper at `:516-522` throws on error responses).
- **Process crash mid-request** leaves pending promises hanging until the 30s timeout; `stop()` clears them.
- **Stderr is always captured** — surface `getStderr()` in error reports.

## When to choose which

- **Building a Node CLI / desktop app / VS Code extension that bundles pi**: `createAgentSession` (in-process). You get full type safety, inline `customTools`, and no IPC overhead.
- **Building a Python service that wants pi as a backend**: `RpcClient` (subprocess). Or implement your own RPC client in Python — the protocol is simple (see `reference/protocol.md`).
- **Testing extensions**: in-process via `loadExtensionFromFactory` (no need for the file-system manifest). See **pi-extensions** `reference/loading.md`.
- **Sandboxing untrusted user code**: subprocess. The in-process path runs everything in the host's address space.

## Common gotchas

- **`cliPath` defaults to `"dist/cli.js"`** — relative to the caller's cwd. If you're embedding from outside the pi-mono dev tree, supply an absolute path.
- **`stdio: ["pipe", "pipe", "pipe"]`** means pi's stderr never reaches the user's terminal directly — it's collected by the client. Surface it on errors.
- **The 30s RPC command-response timeout is hard-coded** (`rpc-client.ts:575`). Long compactions or slow LLMs can exceed it. No exposed override yet. (Distinct from `waitForIdle` / `promptAndWait`, which default to a 60s `timeout` **parameter** — `rpc-client.ts:464`, `:498` — and are overridable.)
- **Concurrent `prompt` commands fail** with "agent already streaming" unless `streamingBehavior` is set. The client's typed `prompt(message, images?)` does NOT pass `streamingBehavior`; for steering, call `steer()` or use the lower-level command directly.
- **Inline factory loading is in-process only.** You cannot pipe a factory function to a subprocess; extensions must be `.ts` files pi reads from disk.

## Cross-references

- The wire protocol the subprocess uses: `reference/protocol.md`.
- The `extension_ui_request` / `extension_ui_response` sub-protocol that bridges `ctx.ui` calls to host UI: `reference/extension-ui-bridge.md`.
- Why not Node `readline` for stdout parsing: the U+2028/U+2029 hazard documented in `reference/protocol.md` "Framing" section.
- The legacy one-shot `--mode json` variant (no command channel, just events): `reference/json-mode.md`.
- Where extensions are loaded from in subprocess mode: **pi-extensions** `reference/loading.md`.
