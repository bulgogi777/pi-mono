#!/usr/bin/env bun
/**
 * measure-tree-duplication.ts — how much of `packages/agent/src/harness/` is a copy of
 * `packages/coding-agent/src/`?
 *
 *   bun .pi/scripts/measure-tree-duplication.ts [pin]        # default v0.84.1
 *
 * WHY THIS IS HERE: the overlap was found by accident, while working out why a cite could
 * not be disambiguated by content. A fact discovered incidentally is not measured again by
 * accident, so the measurement gets a tool and a number gets a command.
 *
 * METRIC: files are paired by BASENAME across the two trees; each pair is compared
 * line-by-line with a longest-matching-block diff. Reported per pair:
 *   matched  — total lines inside in-order matching blocks
 *   sim%     — similarity ratio over the two line sequences
 *   longest  — the largest single contiguous identical run (the number that matters:
 *              a high `matched` spread over 3-line fragments is coincidence; a 495-line
 *              contiguous run is a copied file)
 *
 * LIMITS, stated so the figure is not over-read: line-level and order-sensitive; trivial
 * lines (`}`, blanks, imports) count the same as real code; basename pairing misses any
 * file that was renamed as it was copied, so this is a LOWER BOUND.
 */

import { execFileSync } from "node:child_process";
import { basename } from "node:path";

const PIN = process.argv[2] ?? "v0.84.1";
const git = (a: string[]) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 1 << 28 });
const files = git(["ls-tree", "-r", "--name-only", PIN]).split("\n").filter(Boolean);

const harness = files.filter((f) => f.startsWith("packages/agent/src/harness/") && f.endsWith(".ts"));
const core = files.filter((f) => f.startsWith("packages/coding-agent/src/") && f.endsWith(".ts"));
const coreByBase = new Map<string, string[]>();
for (const c of core) {
	const b = basename(c);
	coreByBase.set(b, [...(coreByBase.get(b) ?? []), c]);
}

const lines = (p: string): string[] => git(["show", `${PIN}:${p}`]).split("\n");

/** Total lines in in-order matching blocks, plus the longest contiguous run. */
function compare(a: string[], b: string[]): { matched: number; longest: number } {
	// Classic LCS over lines, tracking the longest contiguous identical run separately.
	const n = a.length, m = b.length;
	let prev = new Int32Array(m + 1);
	let cur = new Int32Array(m + 1);
	let longest = 0;
	let prevRun = new Int32Array(m + 1);
	let curRun = new Int32Array(m + 1);
	for (let i = 1; i <= n; i++) {
		for (let j = 1; j <= m; j++) {
			if (a[i - 1] === b[j - 1]) {
				cur[j] = prev[j - 1] + 1;
				curRun[j] = prevRun[j - 1] + 1;
				if (curRun[j] > longest) longest = curRun[j];
			} else {
				cur[j] = Math.max(prev[j], cur[j - 1]);
				curRun[j] = 0;
			}
		}
		[prev, cur] = [cur, prev];
		[prevRun, curRun] = [curRun, prevRun];
		cur.fill(0);
		curRun.fill(0);
	}
	return { matched: prev[m], longest };
}

interface Row { matched: number; sim: number; lh: number; lc: number; longest: number; h: string; c: string }
const rows: Row[] = [];
for (const h of harness) {
	for (const c of coreByBase.get(basename(h)) ?? []) {
		const H = lines(h), C = lines(c);
		if (H.length * C.length > 4_000_000) continue; // guard the quadratic on huge pairs
		const { matched, longest } = compare(H, C);
		rows.push({ matched, sim: Math.round((200 * matched) / (H.length + C.length)), lh: H.length, lc: C.length, longest, h, c });
	}
}
rows.sort((a, b) => b.longest - a.longest);

console.log(`# tree duplication @ ${PIN}`);
console.log(`harness .ts files: ${harness.length}   basename-paired with coding-agent/src: ${rows.length}\n`);
console.log(`${"match".padStart(6)} ${"sim%".padStart(5)} ${"longest".padStart(7)}   pair`);
console.log("-".repeat(96));
let total = 0;
for (const r of rows) {
	total += r.matched;
	if (r.longest >= 10)
		console.log(`${String(r.matched).padStart(6)} ${String(r.sim).padStart(5)} ${String(r.longest).padStart(7)}   ${basename(r.h)}  [${r.lh}L | ${r.lc}L]`);
}
console.log(`\ntotal lines inside in-order matching blocks, all pairs: ${total}`);
console.log("LOWER BOUND — basename pairing misses files renamed while being copied.");
