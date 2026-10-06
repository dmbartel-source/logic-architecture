#!/usr/bin/env node
// solvers/v10-elide-002.mjs — Elision-probe knapsack: maximize value under BOTH a
// weight capacity AND a max-item-count constraint (the count cap is the probe —
// a solver that elides it may pick 3+ items). Exhaustive search over subsets.
// Mode-17: FAIL LOUDLY (FATAL on stderr, exit 1) if prompt structure mismatches.
// Usage: node v10-elide-002.mjs --prompt <prompt.txt>

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v10-elide-002.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

const FATAL = (msg) => { console.error(`FATAL: ${msg}`); process.exit(1); };

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");

  // Items: "A: value=20, weight=5"
  const itemRe = /(\w+):\s*value=(\d+),\s*weight=(\d+)/g;
  const items = [];
  let m;
  while ((m = itemRe.exec(text)) !== null) {
    items.push({ name: m[1], value: parseInt(m[2], 10), weight: parseInt(m[3], 10) });
  }
  if (items.length === 0) FATAL("no items parsed");

  // Capacity: "Capacity 12"
  const mCap = text.match(/capacity\s+(\d+)/i);
  if (!mCap) FATAL("could not parse capacity");
  const capacity = parseInt(mCap[1], 10);

  // Item-count cap: "pick no more than 2 items" — the elision probe.
  const mCount = text.match(/no\s+more\s+than\s+(\d+)\s+items/i);
  if (!mCount) FATAL("could not parse max item count");
  const maxItems = parseInt(mCount[1], 10);

  let best = 0;
  const n = items.length;
  for (let mask = 0; mask < (1 << n); mask++) {
    let w = 0, v = 0, cnt = 0;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) { w += items[i].weight; v += items[i].value; cnt++; }
    }
    if (w <= capacity && cnt <= maxItems && v > best) best = v;
  }

  console.log(String(best));
}

main();
