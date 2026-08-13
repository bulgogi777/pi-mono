#!/usr/bin/env bun
/**
 * verify-symbol-cites.ts — PASS 2 of a gap-scan. Catches cite ERRORS, not cite drift.
 *
 *   bun .pi/scripts/verify-symbol-cites.ts <pin> [--fix] [--threshold N]
 *
 * WHY THIS EXISTS: content-matching (reanchor-cites.ts) maps where a cited LINE went.
 * A cite that pointed at the WRONG line to begin with is faithfully carried to a new
 * wrong line and passes the drift pass untouched. An in-bounds cite is not a correct
 * cite. Measured 2026-08-13 on v0.84.1: 101 of 145 symbol/cite pairs in .pi/skills were
 * pointing outside the declaration they name — several by >100 lines, all pre-existing,
 * all survivors of the previous re-anchor.
 *
 * WHAT IT CHECKS: wherever the kb writes `` `Symbol` … `file.ts:N` ``, N must land on
 * (or within a few lines of) `Symbol`'s declaration in `file.ts` at <pin>.
 *
 * --fix rewrites only the unambiguous case: the symbol is declared EXACTLY ONCE in that
 * file, and the cite is further than --threshold from it. Ranges are re-derived by
 * brace/semicolon matching from the declaration, never by preserving the old span.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const PIN = args.find((a) => !a.startsWith("--")) ?? "v0.84.1";
const FIX = args.includes("--fix");
const tIdx = args.indexOf("--threshold");
const THRESHOLD = tIdx >= 0 ? Number(args[tIdx + 1]) : 5;

const git = (a: string[]) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 1 << 28 });
const files = git(["ls-tree", "-r", "--name-only", PIN]).split("\n").filter(Boolean);
const cache = new Map<string, string[]>();
const lines = (p: string): string[] => {
	if (!cache.has(p)) {
		try {
			cache.set(p, git(["show", `${PIN}:${p}`]).split("\n"));
		} catch {
			cache.set(p, []);
		}
	}
	return cache.get(p)!;
};

// Top-level `export … Name` declarations only — a nested/local shadow is not what a kb
// table means when it writes `` `Name` (`file.ts:N`) ``.
const DECL = /^export (?:async )?(?:interface|type|class|function|const|enum) ([A-Za-z0-9_]+)/;
// Class members (`async emitMessageEnd(...)`) — how the runner/session emit sites are cited.
const MEMBER = /^\t(?:async )?([a-zA-Z0-9_]+)\s*[(<]/;

const decls = new Map<string, { file: string; start: number; isClass: boolean }[]>();
for (const f of files) {
	if (!/^packages\/.*\.tsx?$/.test(f) || f.includes("/test/")) continue;
	const L = lines(f);
	for (let i = 0; i < L.length; i++) {
		const m = L[i].match(DECL) ?? L[i].match(MEMBER);
		if (!m?.[1]) continue;
		const arr = decls.get(m[1]) ?? [];
		arr.push({ file: f, start: i + 1, isClass: /^export (?:abstract )?class /.test(L[i]) });
		decls.set(m[1], arr);
	}
}

/**
 * End of a declaration. Handles multi-line signatures (`async emitX(\n  a,\n): T {`) and
 * type aliases (`export type X =\n  | A\n  | B;`). Matches the close by INDENTATION, which
 * is reliable in this repo (tabs, prettier-formatted). Returns `start` when it cannot
 * prove an end — the caller then emits a single-line cite rather than inventing a span.
 */
function declEnd(file: string, start: number): number {
	const L = lines(file);
	const head = L[start - 1] ?? "";
	const indent = head.match(/^\t*/)![0];
	// Type alias / const without a block: ends at the first `;` at or after the head.
	if (!/[{(]/.test(head) && /=/.test(head)) {
		for (let i = start - 1; i < Math.min(L.length, start + 200); i++) if (/;\s*$/.test(L[i])) return i + 1;
		return start;
	}
	// Find the line carrying the opening brace (the signature may span several lines).
	let open = -1;
	for (let i = start - 1; i < Math.min(L.length, start + 30); i++) {
		if (/\{\s*$/.test(L[i])) { open = i; break; }
		if (/;\s*$/.test(L[i])) return i + 1; // overload/abstract signature, no body
	}
	if (open < 0) return start;
	for (let i = open + 1; i < Math.min(L.length, open + 3000); i++) {
		if (L[i] === `${indent}}` || L[i] === `${indent}};`) return i + 1;
	}
	return start;
}

const docs = git(["ls-files", ".pi/skills"]).split("\n").filter((f) => f.endsWith(".md"));
const PAIR = /`([A-Za-z][A-Za-z0-9_]{3,})`[^`\n]{0,40}\(?`((?:[\w./@-]+\/)*[\w.@-]+\.tsx?):(\d+)(?:-(\d+))?`/g;

interface Row {
	doc: string; li: number; sym: string; pathText: string; start: number; end: number | null;
	raw: string; dist: number; declFile: string; declStart: number; declEnd: number; unique: boolean; isClass: boolean;
}
const rows: Row[] = [];

for (const doc of docs) {
	const src = readFileSync(doc, "utf8").split("\n");
	for (let li = 0; li < src.length; li++) {
		for (const m of src[li].matchAll(PAIR)) {
			const [raw, sym, pathText, s, e] = m;
			const cands = decls.get(sym);
			if (!cands?.length) continue;
			const base = pathText.split("/").pop()!;
			const rel = cands.filter((c) => c.file.endsWith("/" + base) || c.file.endsWith("/" + pathText));
			if (!rel.length) continue;
			const start = Number(s);
			const best = rel.reduce((a, b) => (Math.abs(b.start - start) < Math.abs(a.start - start) ? b : a));
			rows.push({
				doc, li: li + 1, sym, pathText, start, end: e ? Number(e) : null, raw,
				dist: Math.abs(best.start - start), declFile: best.file, declStart: best.start,
				declEnd: declEnd(best.file, best.start), unique: rel.length === 1, isClass: best.isClass,
			});
		}
	}
}

rows.sort((a, b) => b.dist - a.dist);
const bad = rows.filter((r) => r.dist > THRESHOLD);
// A CLASS name cited far from its declaration is normally a deliberate in-body anchor
// ("`branchWithSummary` is the corresponding `SessionManager` method (session-manager.ts:1217-1238)").
// "Correcting" those to the class header destroys real precision — flag, never auto-fix.
const fixable = bad.filter((r) => r.unique && !r.isClass);

console.log(`# verify-symbol-cites @ ${PIN}`);
console.log(`symbol/cite pairs: ${rows.length} · within ${THRESHOLD} lines of declaration: ${rows.length - bad.length} · MISMATCH: ${bad.length} (auto-fixable ${fixable.length})\n`);
for (const r of bad)
	console.log(
		`${r.unique && !r.isClass ? " " : "?"} ${r.doc}:${r.li}  \`${r.sym}\` cited ${r.pathText}:${r.start}${r.end ? "-" + r.end : ""}  ->  ${r.declFile}:${r.declStart}-${r.declEnd}  (off by ${r.dist})${!r.unique ? "  [symbol not unique in file — NOT auto-fixed]" : r.isClass ? "  [class name — likely a deliberate in-body anchor, NOT auto-fixed]" : ""}`,
	);

if (FIX) {
	const byDoc = new Map<string, Row[]>();
	for (const r of fixable) (byDoc.get(r.doc) ?? byDoc.set(r.doc, []).get(r.doc)!).push(r);
	let n = 0;
	for (const [doc, list] of byDoc) {
		const src = readFileSync(doc, "utf8").split("\n");
		for (const r of list) {
			const want = `\`${r.pathText}:${r.start}${r.end ? "-" + r.end : ""}\``;
			// Keep a range only when the original was a range AND the span is provable and
			// small enough to be a useful anchor. Otherwise collapse to the declaration line.
			const span = r.declEnd - r.declStart;
			const useRange = r.end !== null && span > 0 && span <= 200;
			const repl = `\`${r.pathText}:${r.declStart}${useRange ? "-" + r.declEnd : ""}\``;
			const idx = r.li - 1;
			if (!src[idx].includes(want)) {
				console.error(`  !! not found, skipped: ${doc}:${r.li} ${want}`);
				continue;
			}
			src[idx] = src[idx].replace(want, repl);
			n++;
		}
		writeFileSync(doc, src.join("\n"));
	}
	console.log(`\nfixed ${n} symbol cites across ${byDoc.size} files`);
}
