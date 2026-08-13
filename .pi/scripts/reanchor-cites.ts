#!/usr/bin/env bun
/**
 * reanchor-cites.ts — map `file:line` citations in .pi/ docs across a pin bump.
 *
 *   bun .pi/scripts/reanchor-cites.ts <old-pin> <new-pin> [--apply] [--json out.json] [--only <substr>]
 *
 * METHOD (do not change this without reading .pi/kb/sources.md § re-anchor rule):
 * for each cite, take the EXACT TEXT of the cited line from the OLD tree and locate
 * that text in the NEW tree. The new line number is the answer. NEVER map line
 * numbers by arithmetic over `git diff -U0` hunk offsets — that is silently wrong
 * across pure-insertion hunks (297 of 451 were wrong that way on the 0.82.1 pass).
 *
 * Three buckets, kept separate:
 *   MATCHED    — exactly one occurrence of the old text in the new file. Safe to rewrite.
 *   AMBIGUOUS  — path unresolvable, or the old text occurs 0 times in a moved file /
 *                more than once in the new file. FLAG, never guess.
 *   NOTFOUND   — the old text exists nowhere in the new tree ⇒ THE MECHANISM CHANGED.
 *                Re-derive the claim; do not re-point the number.
 *
 * --apply rewrites MATCHED cites in place. Historical logs (version-log.md,
 * consolidation-log.md) are scan-only: their cites are pinned to the pin of their
 * own entry, and rewriting them would falsify the record.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { basename } from "node:path";

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const oldPin = positional[0];
const newPin = positional[1];
const apply = args.includes("--apply");
const jsonIdx = args.indexOf("--json");
const jsonOut = jsonIdx >= 0 ? args[jsonIdx + 1] : null;
const onlyIdx = args.indexOf("--only");
const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

if (!oldPin || !newPin) {
	console.error("usage: reanchor-cites.ts <old-pin> <new-pin> [--apply] [--json out.json] [--only <substr>]");
	process.exit(2);
}

const git = (a: string[]): string => execFileSync("git", a, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

// ---------------------------------------------------------------- tree indexes

function treeFiles(pin: string): string[] {
	return git(["ls-tree", "-r", "--name-only", pin]).split("\n").filter(Boolean);
}

const oldFiles = treeFiles(oldPin);
const newFiles = treeFiles(newPin);
const oldSet = new Set(oldFiles);
const newSet = new Set(newFiles);

function byBasename(files: string[]): Map<string, string[]> {
	const m = new Map<string, string[]>();
	for (const f of files) {
		const b = basename(f);
		const cur = m.get(b);
		if (cur) cur.push(f);
		else m.set(b, [f]);
	}
	return m;
}
const oldByBase = byBasename(oldFiles);
const newByBase = byBasename(newFiles);

/*
 * NO BASENAME HINT TABLE, DELIBERATELY.
 *
 * An earlier revision of this script carried a reviewed `basename -> path` map so bare
 * cites like `types.ts:1069` would resolve. That is plausibility wearing a lab coat: it
 * picks the likeliest file and THEN content-matches, so the anchor looks verified while
 * the path was assumed. Measured 2026-08-13: of 100 hint-resolved cites only 57 were
 * independently unique across the full candidate set — the table carried the other 43.
 *
 * And content can never settle some of them. `packages/agent/src/harness/` holds
 * near-duplicates of `packages/coding-agent/src/core/` — 354 identical lines between the
 * two `compaction.ts` files at v0.84.1 — so the rival candidates contain the SAME text.
 * No matcher can discriminate; only the doc can, by saying which file it means.
 *
 * So the fix lives upstream of this tool: `qualify-cites.ts` rewrote every under-specified
 * cite to its minimal unique path suffix. Verified by deleting this table and re-running:
 * 1177 matched / 0 ambiguous, unchanged. Do not add it back. An ambiguous cite is a
 * finding to fix in the document, not a lookup to satisfy here.
 */

const blobCache = new Map<string, string[] | null>();
function blobLines(pin: string, path: string): string[] | null {
	const key = `${pin}:${path}`;
	if (blobCache.has(key)) return blobCache.get(key)!;
	let lines: string[] | null = null;
	try {
		lines = git(["show", key]).split("\n");
	} catch {
		lines = null;
	}
	blobCache.set(key, lines);
	return lines;
}

// ------------------------------------------------------------------ doc corpus

const docs = git(["ls-files", ".pi/skills", ".pi/kb"])
	.split("\n")
	.filter((f) => f.endsWith(".md"))
	.filter((f) => (only ? f.includes(only) : true))
	.sort();

// `.pi/kb/` is PIN-ANNOTATED PROSE, not a live reference surface, so it is scanned and
// reported but never mechanically rewritten:
//   - version-log.md / consolidation-log.md: each entry cites the pin it was written at.
//   - sources.md: the "Current pin" paragraph is already written against the NEW pin,
//     the "Prior pin" paragraphs deliberately cite OLD pins, and the method notes quote
//     historical cite failures verbatim as worked examples.
// Blind-rewriting any of these falsifies the record. Fix them by hand, per paragraph.
const HISTORICAL = /^\.pi\/kb\//;
// Paths that are not upstream repo files (our own tooling, the runtime dist, homedirs).
const NON_REPO = /^(\.pi\/|efforts\/|~|\/home\/|dist\/|node_modules\/|package\/dist\/)/;

// A cite is either `some/path.ts:12` / `base.ts:12-34`, or a bare `` `:12` `` that
// inherits the most recent file mentioned earlier in the same document.
const CITE_RE =
	/((?:[\w.@+-]+\/)*[\w.@+-]+\.(?:ts|tsx|js|mjs|cjs|md|json))?:(\d+)(?:\s*[-–]\s*(\d+))?/g;
// Any fully-qualified path mention (used to learn per-document path context).
const PATH_RE = /((?:[\w.@+-]+\/)+[\w.@+-]+\.(?:ts|tsx|js|mjs|cjs|md|json))/g;

type Status = "MATCHED" | "AMBIGUOUS" | "NOTFOUND" | "SKIP";
interface Cite {
	doc: string;
	docLine: number;
	raw: string;
	col: number;
	pathText: string | null;
	resolved: string | null;
	oldStart: number;
	oldEnd: number | null;
	newStart: number | null;
	newEnd: number | null;
	oldText: string | null;
	status: Status;
	reason: string;
	historical: boolean;
}

function resolvePath(
	pathText: string | null,
	ctxStack: string[],
	ctxMentions: string[],
	ctxBase: Map<string, string>,
	line: number,
): { path: string | null; reason: string } {
	if (!pathText) {
		// A bare `:N` means "same file as the last thing I cited a line in". Prose that
		// merely NAMES a file does not move this context. Where the top of the stack
		// cannot contain the line at all, fall back down the stack to the most recent
		// cited file that can — and SAY SO, so the fallback can be audited by hand.
		for (let i = 0; i < ctxStack.length; i++) {
			const cand = ctxStack[i];
			const len = blobLines(oldPin, cand)?.length ?? 0;
			if (line <= len)
				return {
					path: cand,
					reason: i === 0 ? "inherited from preceding cite" : `inherited from cite ${i} back in document (top-of-stack ${ctxStack[0]} is too short) — AUDIT`,
				};
		}
		// No preceding CITE can hold it — fall back to files merely NAMED earlier in the
		// document (weaker signal, so always flagged for audit).
		for (const cand of ctxMentions) {
			const len = blobLines(oldPin, cand)?.length ?? 0;
			if (line <= len) return { path: cand, reason: `inherited from a prose MENTION of ${cand}, not a cite — AUDIT` };
		}
		if (ctxStack.length) return { path: ctxStack[0], reason: "inherited from preceding cite (line out of range everywhere in stack)" };
		return { path: null, reason: "bare :N cite with no preceding cite in document" };
	}
	if (NON_REPO.test(pathText)) return { path: null, reason: "not an upstream repo path" };
	if (oldSet.has(pathText)) return { path: pathText, reason: "exact path" };
	// partial qualification, e.g. `core/resource-loader.ts`
	if (pathText.includes("/")) {
		const suffix = oldFiles.filter((f) => f.endsWith("/" + pathText));
		if (suffix.length === 1) return { path: suffix[0], reason: "unique suffix match" };
		if (suffix.length > 1) return { path: null, reason: `suffix matches ${suffix.length} files — UNDER-SPECIFIED CITE, qualify it` };
		return { path: null, reason: "path absent from old tree" };
	}
	// bare basename: prefer the document's own context, then repo-wide uniqueness
	const b = pathText;
	const ctx = ctxBase.get(b);
	if (ctx) return { path: ctx, reason: "basename resolved via document path context" };
	const cands = oldByBase.get(b) ?? [];
	if (cands.length === 1) return { path: cands[0], reason: "basename unique in old tree" };
	if (cands.length === 0) return { path: null, reason: "basename absent from old tree" };
	return { path: null, reason: `basename ambiguous (${cands.length} candidates in old tree) — UNDER-SPECIFIED CITE, qualify it` };
}

/**
 * Content-match one old line number into the new file.
 *
 * A single line is often not unique (`\t}`, `});`, a blank line, a repeated field
 * declaration). When it isn't, widen a CONTEXT WINDOW around it — compare
 * old[line-k .. line+k] against new[hit-k .. hit+k] for each candidate — until one
 * candidate survives. This is still pure content matching: every surviving answer is
 * verifiable by reading both trees. It is NOT positional arithmetic.
 */
function mapLine(
	path: string,
	line: number,
	oldLines: string[],
	newLines: string[] | null,
): { newLine: number | null; status: Status; reason: string; text: string | null } {
	if (line < 1 || line > oldLines.length)
		return {
			newLine: null,
			status: "NOTFOUND",
			reason: `CITE WAS ALREADY WRONG: line ${line} is past EOF in old ${path} (${oldLines.length} lines)`,
			text: null,
		};
	const text = oldLines[line - 1];
	if (!newLines) {
		const moved = newByBase.get(basename(path)) ?? [];
		return {
			newLine: null,
			status: "NOTFOUND",
			reason: moved.length ? `file deleted at new pin; basename now at: ${moved.join(", ")}` : "file deleted at new pin",
			text,
		};
	}

	let hits: number[] = [];
	if (text.trim() !== "") {
		for (let i = 0; i < newLines.length; i++) if (newLines[i] === text) hits.push(i + 1);
		if (hits.length === 0)
			return { newLine: null, status: "NOTFOUND", reason: "old line text absent from new file — mechanism changed", text };
		if (hits.length === 1) return { newLine: hits[0], status: "MATCHED", reason: "unique content match", text };
	} else {
		// Blank cited line: every blank line in the new file is a candidate.
		for (let i = 0; i < newLines.length; i++) if (newLines[i].trim() === "") hits.push(i + 1);
		if (hits.length === 0)
			return { newLine: null, status: "NOTFOUND", reason: "cited line is blank and new file has no blank lines", text };
	}

	const window = (arr: string[], center: number, k: number): string =>
		arr.slice(Math.max(0, center - 1 - k), Math.min(arr.length, center + k)).join("\n");

	for (const k of [1, 2, 3, 5, 8, 12, 20, 30]) {
		const want = window(oldLines, line, k);
		const survivors = hits.filter((h) => window(newLines, h, k) === want);
		if (survivors.length === 1)
			return { newLine: survivors[0], status: "MATCHED", reason: `content match, disambiguated with ±${k} lines of context`, text };
		if (survivors.length === 0) break;
		hits = survivors;
	}
	return {
		newLine: null,
		status: "AMBIGUOUS",
		reason: `${text.trim() === "" ? "blank cited line; " : ""}old text still matches ${hits.length} places in new file after context widening (${hits.slice(0, 6).join(",")}${hits.length > 6 ? ",…" : ""})`,
		text,
	};
}

// ------------------------------------------------------------------ scan pass

const cites: Cite[] = [];

for (const doc of docs) {
	const historical = HISTORICAL.test(doc);
	const lines = readFileSync(doc, "utf8").split("\n");
	let ctxStack: string[] = [];
	let ctxMentions: string[] = [];
	const ctxBase = new Map<string, string>();

	for (let li = 0; li < lines.length; li++) {
		const line = lines[li];

		// Path context is maintained in READING ORDER across the line: a qualified path
		// mention and a resolved basename cite both update it, so a later bare `:N`
		// inherits the file actually named most recently — not merely the last file that
		// happened to be written out in full.
		const events: { col: number; path: string }[] = [];
		for (const m of line.matchAll(PATH_RE)) {
			const p = m[1];
			if (NON_REPO.test(p)) continue;
			let resolved: string | null = null;
			if (oldSet.has(p)) resolved = p;
			else {
				const suffix = oldFiles.filter((f) => f.endsWith("/" + p));
				if (suffix.length === 1) resolved = suffix[0];
			}
			if (resolved) events.push({ col: m.index ?? 0, path: resolved });
		}
		let evIdx = 0;
		// A qualified path MENTION teaches the basename map (so a later `types.ts:12`
		// resolves) but deliberately does NOT become the bare-`:N` context.
		const drainEventsBefore = (col: number) => {
			while (evIdx < events.length && events[evIdx].col <= col) {
				ctxBase.set(basename(events[evIdx].path), events[evIdx].path);
				ctxMentions = [events[evIdx].path, ...ctxMentions.filter((p) => p !== events[evIdx].path)];
				evIdx++;
			}
		};

		for (const m of line.matchAll(CITE_RE)) {
			drainEventsBefore(m.index ?? 0);
			const pathText = m[1] ?? null;
			const col = m.index ?? 0;
			// Guard the bare `:N` form: only honour it inside backticks, else `12:30`
			// timestamps and `foo: 3` prose become phantom cites.
			if (!pathText) {
				const before = line[col - 1];
				if (before !== "`" && before !== "(") continue;
			}
			const oldStart = Number(m[2]);
			const oldEnd = m[3] ? Number(m[3]) : null;
			const rec: Cite = {
				doc,
				docLine: li + 1,
				raw: m[0],
				col,
				pathText,
				resolved: null,
				oldStart,
				oldEnd,
				newStart: null,
				newEnd: null,
				oldText: null,
				status: "SKIP",
				reason: "",
				historical,
			};

			const r = resolvePath(pathText, ctxStack, ctxMentions, ctxBase, oldStart);
			rec.resolved = r.path;
			if (r.path) {
				if (pathText) {
					// Only an EXPLICIT cite moves the bare-`:N` context.
					ctxStack = [r.path, ...ctxStack.filter((p) => p !== r.path)];
					ctxBase.set(basename(r.path), r.path);
				}
			}

			if (!r.path) {
				rec.status = pathText && NON_REPO.test(pathText) ? "SKIP" : "AMBIGUOUS";
				rec.reason = r.reason;
				cites.push(rec);
				continue;
			}

			const oldLines = blobLines(oldPin, r.path);
			if (!oldLines) {
				rec.status = "AMBIGUOUS";
				rec.reason = `cannot read ${r.path} at old pin`;
				cites.push(rec);
				continue;
			}
			// Path may itself have moved between pins — follow by basename if unique.
			let newPath = r.path;
			if (!newSet.has(newPath)) {
				const cands = newByBase.get(basename(newPath)) ?? [];
				if (cands.length === 1) newPath = cands[0];
			}
			const newLines = newSet.has(newPath) ? blobLines(newPin, newPath) : null;

			const s = mapLine(r.path, oldStart, oldLines, newLines);
			rec.oldText = s.text;
			rec.newStart = s.newLine;
			rec.status = s.status;
			rec.reason = s.reason;
			if (newPath !== r.path) rec.reason += ` [file moved: ${r.path} → ${newPath}]`;

			if (r.reason.endsWith("AUDIT")) rec.reason = `[${r.reason}] ` + rec.reason;
			if (oldEnd !== null) {
				let e = mapLine(r.path, oldEnd, oldLines, newLines);
				// A range END is very often a structurally trivial line (`}`, `*/`, a blank)
				// that matches everywhere. When the START anchored uniquely, check whether the
				// WHOLE cited block is byte-identical at the new location. If it is, the end is
				// proven by that block equality — this is verification, not offset arithmetic.
				if (e.status !== "MATCHED" && rec.status === "MATCHED" && rec.newStart && newLines && oldEnd >= oldStart && oldEnd <= oldLines.length) {
					const span = oldEnd - oldStart;
					const oldBlock = oldLines.slice(oldStart - 1, oldEnd).join("\n");
					const newBlock = newLines.slice(rec.newStart - 1, rec.newStart - 1 + span + 1).join("\n");
					if (oldBlock === newBlock)
						e = { newLine: rec.newStart + span, status: "MATCHED", reason: "cited block byte-identical at new location", text: oldLines[oldEnd - 1] };
				}
				rec.newEnd = e.newLine;
				if (rec.status === "MATCHED" && e.status !== "MATCHED") {
					rec.status = e.status;
					rec.reason = `range end: ${e.reason}`;
				} else if (rec.status === "MATCHED" && e.newLine !== null && e.newLine < (rec.newStart ?? 0)) {
					rec.status = "AMBIGUOUS";
					rec.reason = `range inverted after mapping (${rec.newStart} > ${e.newLine})`;
				}
			}
			cites.push(rec);
		}
		drainEventsBefore(Number.MAX_SAFE_INTEGER);
	}
}

// ------------------------------------------------------------------- reporting

const live = cites.filter((c) => !c.historical && c.status !== "SKIP");
const hist = cites.filter((c) => c.historical && c.status !== "SKIP");
const count = (arr: Cite[], s: Status) => arr.filter((c) => c.status === s).length;

const unchanged = live.filter((c) => c.status === "MATCHED" && c.newStart === c.oldStart && (c.oldEnd === null || c.newEnd === c.oldEnd));
const rewrites = live.filter((c) => c.status === "MATCHED").filter((c) => !unchanged.includes(c));

console.log(`# reanchor ${oldPin} → ${newPin}`);
console.log(`docs scanned: ${docs.length}   cites found: ${cites.length}   (live ${live.length} · historical ${hist.length} · skipped ${cites.length - live.length - hist.length})`);
console.log("");
console.log(`LIVE  MATCHED   ${count(live, "MATCHED")}   (unchanged ${unchanged.length} · needs rewrite ${rewrites.length})`);
console.log(`LIVE  AMBIGUOUS ${count(live, "AMBIGUOUS")}`);
console.log(`LIVE  NOTFOUND  ${count(live, "NOTFOUND")}`);
console.log(`HIST  MATCHED ${count(hist, "MATCHED")} · AMBIGUOUS ${count(hist, "AMBIGUOUS")} · NOTFOUND ${count(hist, "NOTFOUND")}  (scan-only, never rewritten)`);
console.log("");

for (const bucket of ["NOTFOUND", "AMBIGUOUS"] as Status[]) {
	const rows = live.filter((c) => c.status === bucket);
	if (!rows.length) continue;
	console.log(`## ${bucket} (${rows.length})`);
	for (const c of rows) {
		console.log(`  ${c.doc}:${c.docLine}  «${c.raw}»  → ${c.resolved ?? "?"}  — ${c.reason}`);
		if (c.oldText) console.log(`      old text: ${c.oldText.trim().slice(0, 110)}`);
	}
	console.log("");
}

if (rewrites.length) {
	console.log(`## REWRITES (${rewrites.length})`);
	for (const c of rewrites) {
		const to = c.newEnd !== null ? `${c.newStart}-${c.newEnd}` : `${c.newStart}`;
		const from = c.oldEnd !== null ? `${c.oldStart}-${c.oldEnd}` : `${c.oldStart}`;
		console.log(`  ${c.doc}:${c.docLine}  ${c.resolved}  ${from} → ${to}`);
	}
	console.log("");
}

if (jsonOut) {
	writeFileSync(jsonOut, JSON.stringify(cites, null, 2));
	console.log(`wrote ${jsonOut}`);
}

// --------------------------------------------------------------------- apply

if (apply) {
	const byDoc = new Map<string, Cite[]>();
	for (const c of rewrites) {
		const cur = byDoc.get(c.doc);
		if (cur) cur.push(c);
		else byDoc.set(c.doc, [c]);
	}
	let changed = 0;
	for (const [doc, list] of byDoc) {
		if (!existsSync(doc)) continue;
		const lines = readFileSync(doc, "utf8").split("\n");
		// Right-to-left within a line so earlier column offsets stay valid.
		list.sort((a, b) => b.docLine - a.docLine || b.col - a.col);
		for (const c of list) {
			const idx = c.docLine - 1;
			const line = lines[idx];
			const oldFrag = c.raw;
			const newFrag =
				(c.pathText ?? "") + ":" + c.newStart + (c.newEnd !== null ? oldFrag.match(/[-–]/)![0].padStart(1) + c.newEnd : "");
			// Rebuild preserving the original separator style for ranges.
			const sep = oldFrag.match(/\d\s*([-–])\s*\d/);
			const rebuilt =
				(c.pathText ?? "") + ":" + c.newStart + (c.newEnd !== null ? (sep ? sep[1] : "-") + c.newEnd : "");
			if (line.slice(c.col, c.col + oldFrag.length) !== oldFrag) {
				console.error(`  !! offset drift, skipped: ${doc}:${c.docLine} «${oldFrag}»`);
				continue;
			}
			lines[idx] = line.slice(0, c.col) + rebuilt + line.slice(c.col + oldFrag.length);
			changed++;
			void newFrag;
		}
		writeFileSync(doc, lines.join("\n"));
	}
	console.log(`applied ${changed} rewrites across ${byDoc.size} files`);
}
