#!/usr/bin/env bun
/**
 * qualify-cites.ts — expand under-specified `file.ts:N` cites to the MINIMAL UNIQUE
 * path suffix, so no future re-anchor has to guess which file was meant.
 *
 *   bun .pi/scripts/qualify-cites.ts <pin> [--apply]
 *
 * WHY: a cite whose basename admits several files in the tree is not a puzzle to be
 * solved by plausibility — it is an under-specified cite. Resolving it by "the likeliest
 * file" manufactures a confident-wrong anchor that the next pass faithfully preserves.
 *
 * And it cannot always be solved by content either: `packages/agent/src/harness/` carries
 * near-duplicates of `packages/coding-agent/src/core/` (measured at v0.84.1: 582 lines match
 * in order between the two `compaction.ts` files; `tools/edit-diff.ts` is a 496-of-501-line
 * contiguous copy). For those, NO amount of content matching discriminates, because the
 * content is the same. The only durable fix is to write the
 * path down.
 *
 * Minimal unique suffix, not the full path: `extensions/loader.ts` already separates
 * `core/extensions/loader.ts` from `tui/src/components/loader.ts`, and stays readable in
 * a table. The re-anchor tool resolves unique suffixes natively, with no hint table.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const args = process.argv.slice(2);
const PIN = args.find((a) => !a.startsWith("--")) ?? "v0.84.1";
const APPLY = args.includes("--apply");

const git = (a: string[]) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 1 << 28 });
const files = git(["ls-tree", "-r", "--name-only", PIN]).split("\n").filter(Boolean);
const fileSet = new Set(files);

/** Shortest trailing path segment run that identifies `path` uniquely in the tree. */
function minimalUniqueSuffix(path: string): string {
	const parts = path.split("/");
	for (let k = 1; k <= parts.length; k++) {
		const suffix = parts.slice(parts.length - k).join("/");
		const hits = files.filter((f) => f === suffix || f.endsWith("/" + suffix));
		if (hits.length === 1) return suffix;
	}
	return path;
}

/** Which file does this cite currently mean? Resolved WITHOUT plausibility. */
function currentTarget(pathText: string, docPath: string): { path: string | null; why: string } {
	if (fileSet.has(pathText)) return { path: pathText, why: "already fully qualified" };
	if (pathText.includes("/")) {
		const hits = files.filter((f) => f.endsWith("/" + pathText));
		if (hits.length === 1) return { path: hits[0], why: "already unique suffix" };
		if (hits.length === 0) return { path: null, why: "absent from tree" };
		// Ambiguous even as a suffix: prefer the package this skill documents.
		const ca = hits.filter((h) => h.startsWith("packages/coding-agent/src/"));
		if (ca.length === 1) return { path: ca[0], why: "TERRITORY: pi-mono-expert documents the coding-agent package" };
		return { path: null, why: `suffix ambiguous (${hits.length})` };
	}
	const cands = files.filter((f) => basename(f) === pathText && !f.includes("/test/"));
	if (cands.length === 1) return { path: cands[0], why: "basename unique in tree" };
	if (cands.length === 0) return { path: null, why: "absent from tree" };
	const ca = cands.filter((c) => c.startsWith("packages/coding-agent/src/"));
	if (ca.length === 1) return { path: ca[0], why: "TERRITORY: pi-mono-expert documents the coding-agent package" };
	return { path: null, why: `basename ambiguous (${cands.length}) and no single coding-agent/src candidate` };
}

const docs = git(["ls-files", ".pi/skills"]).split("\n").filter((f) => f.endsWith(".md"));
const CITE = /((?:[\w.@+-]+\/)*[\w.@+-]+\.(?:ts|tsx)):(\d+)/g;

let already = 0;
const rewrites: { doc: string; li: number; from: string; to: string; why: string }[] = [];
const unresolved: string[] = [];

for (const doc of docs) {
	const src = readFileSync(doc, "utf8").split("\n");
	for (let i = 0; i < src.length; i++) {
		for (const m of src[i].matchAll(CITE)) {
			const pathText = m[1];
			if (/^(\.pi|efforts|dist|node_modules|package)\//.test(pathText)) continue;
			const t = currentTarget(pathText, doc);
			if (!t.path) {
				if (!/absent from tree/.test(t.why)) unresolved.push(`${doc}:${i + 1}  ${pathText}  — ${t.why}`);
				continue;
			}
			// LENGTHEN ONLY. A cite that is already unambiguous is left exactly as written —
			// shortening a fully-qualified path to its minimal suffix would destroy
			// information for a human reader to buy nothing for the tools.
			if (!t.why.startsWith("TERRITORY")) { already++; continue; }
			const min = minimalUniqueSuffix(t.path);
			if (min === pathText) { already++; continue; }
			rewrites.push({ doc, li: i + 1, from: pathText, to: min, why: t.why });
		}
	}
}

console.log(`# qualify-cites @ ${PIN}`);
console.log(`cites already minimally unique: ${already}`);
console.log(`cites to qualify:               ${rewrites.length}`);
console.log(`cites still unresolvable:       ${unresolved.length}\n`);

const byPair = new Map<string, number>();
for (const r of rewrites) byPair.set(`${r.from} -> ${r.to}   [${r.why}]`, (byPair.get(`${r.from} -> ${r.to}   [${r.why}]`) ?? 0) + 1);
for (const [k, v] of [...byPair].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}x  ${k}`);
if (unresolved.length) { console.log("\nUNRESOLVABLE (report, do not guess):"); for (const u of unresolved) console.log("  " + u); }

if (APPLY) {
	const byDoc = new Map<string, typeof rewrites>();
	for (const r of rewrites) (byDoc.get(r.doc) ?? byDoc.set(r.doc, []).get(r.doc)!).push(r);
	let n = 0;
	for (const [doc, list] of byDoc) {
		let src = readFileSync(doc, "utf8").split("\n");
		for (const r of list.sort((a, b) => b.li - a.li)) {
			const i = r.li - 1;
			// Replace only the path portion immediately preceding `:<digits>`.
			const re = new RegExp(`(?<![\\w./-])${r.from.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}(?=:\\d)`, "g");
			const before = src[i];
			src[i] = src[i].replace(re, r.to);
			if (src[i] !== before) n++;
		}
		writeFileSync(doc, src.join("\n"));
	}
	console.log(`\napplied ${n} qualifications across ${byDoc.size} files`);
}
