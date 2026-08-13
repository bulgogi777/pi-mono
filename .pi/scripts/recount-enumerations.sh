#!/usr/bin/env bash
# recount-enumerations.sh — re-derive every "N of these" number the kb asserts.
#
#   .pi/scripts/recount-enumerations.sh [pin]        # default: v0.84.1
#
# WHY: enumerations rot silently and no cite check catches them — a count stays
# grammatical while the thing it counts grows. Asserting the number in the kb is not
# enough; the number has to be re-derivable by someone who was not in the room. Each
# row below prints its own command so the figure can be checked, not trusted.
set -uo pipefail
PIN="${1:-v0.84.1}"
cd "$(git rev-parse --show-toplevel)"

row() { printf '%-42s %6s   %s\n' "$1" "$2" "$3"; }

echo "# enumerations @ ${PIN}"
echo
printf '%-42s %6s   %s\n' "CLAIM" "VALUE" "HOW"
printf '%s\n' "-------------------------------------------------------------------------------"

row "KnownProvider union members" \
  "$(git show "$PIN":packages/ai/src/types.ts | sed -n '/^export type KnownProvider/,/;$/p' | grep -c '^\s*|')" \
  "sed the union in packages/ai/src/types.ts, count '| \"x\"' lines"

row "ExtensionAPI.on() overloads" \
  "$(git show "$PIN":packages/coding-agent/src/core/extensions/types.ts | grep -c '^	on(event: "')" \
  "grep -c '^<tab>on(event: \"' in extensions/types.ts"

row "ExtensionEvent union members" \
  "$(git show "$PIN":packages/coding-agent/src/core/extensions/types.ts | sed -n '/^export type ExtensionEvent/,/;$/p' | grep -c '^\s*|')" \
  "sed the union, count member lines (fewer than overloads: ToolCall/ToolResult are unions)"

row "SessionEntry entry types" \
  "$(git show "$PIN":packages/coding-agent/src/core/session-manager.ts | sed -n '/^export type SessionEntry/,/;$/p' | grep -c '^\s*|')" \
  "sed the union in session-manager.ts"

for f in packages/ai/src/providers/anthropic.ts \
         packages/coding-agent/src/modes/rpc/rpc-types.ts \
         packages/coding-agent/src/modes/rpc/rpc-mode.ts \
         packages/coding-agent/src/modes/rpc/jsonl.ts; do
  row "lines: ${f##*/}" "$(git show "$PIN":"$f" | wc -l | tr -d ' ')" "git show $PIN:$f | wc -l"
done

echo
echo "cite-surface health (must be re-derivable too):"
bun .pi/scripts/reanchor-cites.ts "$PIN" "$PIN" 2>/dev/null | sed -n '2p;4,6p' | sed 's/^/  /'
echo "  (a same-pin run is the positive control: 0 rewrites means the checker is comparing,"
echo "   not rubber-stamping; inject a descending range to see it fail)"
