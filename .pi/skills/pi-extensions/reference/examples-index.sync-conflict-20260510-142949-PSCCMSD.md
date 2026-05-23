# Examples Index

Survey of `packages/coding-agent/examples/extensions/` (~75 examples). Use this file to pick the right example to copy-paste-and-modify, rather than opening every file. Each row: filename, one-sentence purpose, which `register*` / hook the example demonstrates, and a grep target if you need to jump straight to the relevant section.

For ground truth on the API surface, cross-check against `reference/extension-api.md` and `reference/hook-events.md`.

## Tool registration (registerTool)

| Example | Purpose | Grep target |
|---|---|---|
| `hello.ts` | Minimal `pi.registerTool` example. Single `hello` tool. Best starting point. | `pi.registerTool` |
| `tools.ts` | `/tools` slash command to enable/disable tools interactively. Demonstrates `getActiveTools` / `setActiveTools`. | `setActiveTools` |
| `dynamic-tools.ts` | Registers tools after session init (late registration). | `pi.registerTool` inside a hook |
| `tool-override.ts` | Overrides a built-in tool (`bash`) by registering with the same name. | `name: "bash"` |
| `truncated-tool.ts` | Output-truncation pattern for custom tools. | `truncate` |
| `structured-output.ts` | Tool that returns structured payload alongside text. | `details` field |
| `tic-tac-toe.ts` | Demonstrates `executionMode: "sequential"` on tools. | `executionMode` |
| `question.ts` | Custom-rendered tool with full overlay UI (options + inline editor). | `renderCall` |
| `questionnaire.ts` | Unified single/multi-question tool. | `renderResult` |
| `built-in-tool-renderer.ts` | Custom rendering hooks for built-in tools (read/edit/write). | `renderResult` |

## Slash commands (registerCommand)

| Example | Purpose | Grep target |
|---|---|---|
| `commands.ts` | `/commands` listing — demonstrates `pi.getCommands()`. | `pi.getCommands` |
| `shutdown-command.ts` | `/quit` — clean shutdown via `ctx.shutdown()`. | `ctx.shutdown` |
| `preset.ts` | Named presets that configure model + thinking + tools in one command. | `pi.setModel` |
| `summarize.ts` | `/summarize` command with custom compaction-style instructions. | `ctx.compact` |
| `bookmark.ts` | Bookmark/label commands (`setLabel`) — also demonstrates `registerShortcut`. | `pi.setLabel` |

## Keyboard shortcuts (registerShortcut)

| Example | Purpose | Grep target |
|---|---|---|
| `bookmark.ts` | Ctrl-key bindings for label set/clear. | `pi.registerShortcut` |
| `interactive-shell.ts` | Shortcut-driven interactive shell session. | `pi.registerShortcut` |

## CLI flags (registerFlag)

| Example | Purpose | Grep target |
|---|---|---|
| Search `pi.registerFlag` | Pi has fewer canonical examples for `registerFlag`; grep across examples and runtime tests. | `pi.registerFlag` |

## Custom message rendering (registerMessageRenderer)

| Example | Purpose | Grep target |
|---|---|---|
| `message-renderer.ts` | Canonical example. Renders custom-typed messages with custom layout. | `pi.registerMessageRenderer` |
| `todo.ts` | State persistence via `appendEntry` + custom rendering of state. | `customType` |

## Custom providers (registerProvider)

| Example | Purpose | Grep target |
|---|---|---|
| `custom-provider-anthropic/index.ts` | Full custom transport: custom API, custom `streamSimple`, OAuth + API-key. | `pi.registerProvider` |
| `custom-provider-gitlab-duo/index.ts` | Delegating wrapper using pi-ai's built-in `streamSimpleAnthropic` / `streamSimpleOpenAIResponses`. | `streamSimpleAnthropic` |
| `provider-payload.ts` | Inspect / log the outgoing provider payload via `before_provider_request`. | `before_provider_request` |

## Hook handlers — by event

### Session lifecycle (`session_*`)

| Example | Hooks | Purpose |
|---|---|---|
| `auto-commit-on-exit.ts` | `session_shutdown` | Auto-commit changes when pi exits. |
| `dirty-repo-guard.ts` | `session_before_switch`, `session_before_fork` | Block session changes when the repo is dirty. |
| `git-checkpoint.ts` | `session_start`, `session_shutdown` | Git-stash checkpoints at session boundaries. |
| `confirm-destructive.ts` | `session_before_switch`, `session_before_fork`, `session_before_compact` | Confirm before destructive session actions. |
| `custom-compaction.ts` | `session_before_compact` | Replace default compaction with full-context summary. |
| `trigger-compact.ts` | (action) | Programmatically trigger compaction. |
| `handoff.ts` | `session_before_compact` | "Handoff" pattern: extract context to a focused new session instead of compacting. |
| `session-name.ts` | (action) | `pi.setSessionName` / `getSessionName` for friendly names. |

### Agent / turn / message lifecycle

| Example | Hooks | Purpose |
|---|---|---|
| `pirate.ts` | `before_agent_start` | Modify the system prompt per-turn (returns `{systemPrompt}`). |
| `system-prompt-header.ts` | (read-only) | Status widget showing system prompt length via `ctx.getSystemPrompt()`. |
| `prompt-customizer.ts` | `before_agent_start` | Inject custom guidance into the system prompt. |
| `claude-rules.ts` | `context` or `before_agent_start` | Inject Claude-style CLAUDE.md rules. |
| `model-status.ts` | `model_select` | Status bar updates on model change. |
| `notify.ts` | `agent_end` | Native terminal notification when agent is done. |
| `titlebar-spinner.ts` | `agent_start`, `agent_end` | Spinner in titlebar during streaming. |
| `working-indicator.ts` | (UI) | Customize the inline working indicator (`ctx.ui.setWorkingIndicator`). |
| `working-message-test.ts` | (UI) | Test working-message persistence across turns. |
| `hidden-thinking-label.ts` | (UI) | Custom label for hidden thinking blocks. |

### Tool call interception (`tool_call`, `user_bash`)

| Example | Hooks | Purpose |
|---|---|---|
| `permission-gate.ts` | `tool_call` | Confirmation prompt before dangerous bash commands. |
| `protected-paths.ts` | `tool_call` | Block `write` / `edit` to protected paths. |
| `bash-spawn-hook.ts` | `tool_call`, `user_bash` | Rewrite command, cwd, and env before bash execution. |
| `inline-bash.ts` | `input` | Expand inline bash commands in user prompts. |
| `sandbox/` | `tool_call` | Sandboxed command execution with policy enforcement. |
| `ssh.ts` | `tool_call` | Route bash commands to a remote host over SSH. |

### Input interception (`input` event)

| Example | Hooks | Purpose |
|---|---|---|
| `input-transform.ts` | `input` | Demonstrates `{action: "transform"}` to rewrite user input. |
| `qna.ts` | `input` and `message_end` | Q&A extraction pattern from assistant responses. |
| `file-trigger.ts` | (file watch) | Watch a trigger file and inject contents on change. |
| `github-issue-autocomplete.ts` | (autocomplete) | Autocomplete provider for GitHub issue numbers. |

## UI / TUI customization

| Example | Purpose | Grep target |
|---|---|---|
| `custom-footer.ts` | `ctx.ui.setFooter` with `FooterDataProvider` access. | `setFooter` |
| `custom-header.ts` | `ctx.ui.setHeader`. | `setHeader` |
| `status-line.ts` | `ctx.ui.setStatus` for footer status text. | `setStatus` |
| `border-status-editor.ts` | Status integrated with editor border. | `setStatus` |
| `widget-placement.ts` | `ctx.ui.setWidget` with `placement: "aboveEditor" \| "belowEditor"`. | `setWidget` |
| `mac-system-theme.ts` | Sync pi theme with macOS dark/light mode. | `ctx.ui.setTheme` |
| `minimal-mode.ts` | Minimal-display mode for tools. | `setStatus` |
| `modal-editor.ts` | Vim-like modal editing — replaces editor via `setEditorComponent`. | `CustomEditor` |
| `rainbow-editor.ts` | Highlights "ultrathink" with animated shine effect. | `setEditorComponent` |
| `timed-confirm.ts` | Timed dialogs with live countdown via `opts.timeout`. | `opts.timeout` |
| `overlay-test.ts` / `overlay-qa-tests.ts` / `doom-overlay/` | Overlay positioning and edge cases. | `ctx.ui.custom` |
| `snake.ts` / `space-invaders.ts` / `tic-tac-toe.ts` | Full-screen TUI games using `ctx.ui.custom` overlays. | `ctx.ui.custom` |

## Action methods (sendMessage, sendUserMessage, etc.)

| Example | Purpose | Grep target |
|---|---|---|
| `send-user-message.ts` | `pi.sendUserMessage` for synthetic user input. | `pi.sendUserMessage` |
| `subagent/` | Sub-agent pattern: spawn a focused session for a subtask. | `newSession` |
| `plan-mode/` | Plan-mode workflow with `pi.sendMessage` and tool gating. | `pi.sendMessage` |

## RPC and integration

| Example | Purpose | Grep target |
|---|---|---|
| `rpc-demo.ts` | Exercises every RPC-supported `ctx.ui` method — useful smoke test for RPC bridges. | `ctx.ui` |
| `event-bus.ts` | Inter-extension pub/sub via `pi.events`. | `pi.events` |
| `reload-runtime.ts` | `ctx.reload()` to re-discover extensions/skills/themes. | `ctx.reload` |

## Resources (skills, prompts, themes from extensions)

| Example | Purpose | Grep target |
|---|---|---|
| `dynamic-resources/` | Extension contributing skills via `resources_discover` hook. | `resources_discover` |
| `with-deps/` | Extension with npm dependencies. | `package.json` |

## Cross-references

- API surface per example: `reference/extension-api.md`.
- Hook events per example: `reference/hook-events.md`.
- The README in the examples directory: `packages/coding-agent/examples/extensions/README.md`.
