# consolidation-log.md — pi-mono-expert

Field-experience consolidations. Each entry records: which transcripts were processed, what was internalized (with dual citations — transcript id + substrate file:line), and what was rejected (with reason).

Never cite a prior entry here as substrate verification — that is a self-citation loop. Always re-verify against actual source at the current pin.

---

## 2026-05-23 — consolidated from 4 transcripts

**Pin at time of consolidation:** `e4163fe9` (matches `sources.md`).

**Transcripts reviewed:**
- `00MP3GNRC159EAD75DB056D89E` — generic smoke-test panel; no pi-mono-territory candidates (anonymous findings about subprocess discipline at the abstract level only).
- `00MP3J9V0K6333F6E8C57D4365` — duplicate-shape smoke-test; same as above.
- `00MPIOUQZCD4A4733BB50FD03D` — substantive panel with `apex-system-effort` on subprocess stdout/stderr discipline; pi-mono-expert articulated the "stdout-as-capability" pattern with direct file:line cites.
- `00MPIU5U051B3CD09B0DEEA9C1` — substantive panel with `apex-system-effort` on persisting panel transcripts; pi-mono-expert contributed the session-JSONL storage-model precedent.

**Candidates extracted (5):**

1. `output-guard.ts:9-34` implements the stdout-as-capability pattern: capture real `process.stdout.write`, replace it with a stderr-routing shim, hand the captured ref to exactly one writer. *(from `00MPIOUQZCD4A4733BB50FD03D`)*
2. `rpc-mode.ts:49` invokes `takeOverStdout()` at RPC startup; `rpc-mode.ts:53-55` wraps `writeRawStdout(serializeJsonLine(...))` as the sole legitimate producer. *(from `00MPIOUQZCD4A4733BB50FD03D`)*
3. `rpc/jsonl.ts:7-12` enforces strict LF-only framing; clients must not use Node `readline` because U+2028/U+2029 are valid inside JSON strings. *(from `00MPIU5U051B3CD09B0DEEA9C1`)*
4. `session-manager.ts:438-462` `loadEntriesFromFile` validates that the first JSONL entry is `type:"session"` with a string `id`; entry types include `session`, `message`, `custom_message`, `branch_summary`, `compaction`. *(from `00MPIU5U051B3CD09B0DEEA9C1`)*
5. **Design principle (transcript-only):** "Prevention-by-construction > prevention-by-convention > recovery-by-framing" as a generalised stdio-protocol discipline. *(from `00MPIOUQZCD4A4733BB50FD03D`)*

**Re-verification gate (Step 3):**

| # | Pin verification | Outcome |
|---|---|---|
| 1 | `output-guard.ts:9-34` at `e4163fe9` confirms `takeOverStdout`: captures `process.stdout.write.bind(process.stdout)` at L14, replaces `process.stdout.write` with a stderr-routing shim at L18-27. **VERIFIED.** | accept |
| 2 | `rpc-mode.ts:22` imports both helpers; `:49` calls `takeOverStdout()`; `:53-55` defines `output(obj) => writeRawStdout(serializeJsonLine(obj))`. Panel said "rpc-mode.ts:22,54" — minor cite drift: 22 is the import, 49 is the engage call, 54 is inside the `output` closure. **VERIFIED with corrected line refs.** | accept |
| 3 | `rpc/jsonl.ts:5-9` comment explicitly states "Framing is LF-only" and warns about U+2028/U+2029; `:10-12` implements `serializeJsonLine`; `:14-20` documents why Node readline is avoided. **Already fully covered in existing kb** (`pi-rpc/SKILL.md:5,27,34`, `pi-rpc/reference/protocol.md:7,11,13`). | accept — but **no new kb edit** (already internalized) |
| 4 | `session-manager.ts:438-463` (panel cited 438-462; off by 1 line) confirms header validation at L456-460. Entry-type union confirmed at L31, 52, 68, 79, 130 and `FileEntry = SessionHeader \| SessionEntry` at L150. **Already fully covered in `pi-sessions/reference/jsonl-format.md:86`**. | accept — but **no new kb edit** (already internalized) |
| 5 | Design principle is *abstracted from* candidates 1+2. The principle as stated is a generalisation; it is grounded in pi-mono's specific implementation but is not itself a code claim. **Internalize as motivational framing alongside candidate 1**, not as a standalone claim. | accept (folded into kb edit for candidate 1) |

**Internalized (1 kb edit):**

- `.pi/skills/pi-rpc/reference/protocol.md` — new section **"Stdout-as-capability (the output-guard discipline)"** after the `Direction:` bullet list. Cites `output-guard.ts:9-34` (capability mechanism, lines 14, 18-27, 49-55), `rpc-mode.ts:49` (engage point), `rpc-mode.ts:53-55` (sole legitimate writer). Dual-cited with transcript `00MPIOUQZCD4A4733BB50FD03D`. Confidence: high. Covers candidates 1, 2, and design-principle 5 in one tight section.

**Not internalized — already in kb (2):**

- Candidate 3 (LF-only JSONL, U+2028 hazard, no Node readline) — `pi-rpc/SKILL.md:5,27,34` and `pi-rpc/reference/protocol.md:7,11,13` already say this with the same cites. No edit needed.
- Candidate 4 (`loadEntriesFromFile` header validation + entry-type union) — `pi-sessions/reference/jsonl-format.md:86` already cites `session-manager.ts:438-462` with the header-validation claim. No edit needed.

**Rejected (0):**

None of the 5 candidates failed the substrate gate at pin `e4163fe9` — but note that 2 of 5 were rejected for kb-edit purposes (already present), and 1 of 5 (the design principle) was folded into the candidate-1 edit rather than standing alone. The honesty check: this run found 4 transcripts; 2 had no extractable content (anonymous-finding-only smoke tests); of the 2 substantive transcripts, only 1 produced a kb edit. That is the correct outcome, not 100% acceptance.

**Files modified:**
- `.pi/skills/pi-rpc/reference/protocol.md` — added "Stdout-as-capability" section
- `.pi/kb/consolidation-log.md` — this file (created)

**Coverage note for next run:** All 4 currently-existing pi-mono-expert panel transcripts processed. Next consolidation should pick up from panels created after `2026-05-23T18:36:03Z` (the dismissal timestamp of `00MPIOUQZCD4A4733BB50FD03D`).
