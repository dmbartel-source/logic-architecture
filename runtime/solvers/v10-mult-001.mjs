#!/usr/bin/env node
// solvers/v10-mult-001.mjs — Multi-optimum knapsack: output ONLY the optimal total
// value (mode 18: multiple optima may exist; the VALUE is unique). Exhaustive search.
// Mode-17: FAIL LOUDLY (FATAL on stderr, exit 1) if prompt structure mismatches.
// Usage: node v10-mult-001.mjs --prompt <prompt.txt>

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v10-mult-001.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

const FATAL = (msg) => { console.error(`FATAL: ${msg}`); process.exit(1); };

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");

  const itemRe = /(\w+):\s*value=(\d+),\s*weight=(\d+)/g;
  const items = [];
  let m;
  while ((m = itemRe.exec(text)) !== null) {
    items.push({ name: m[1], value: parseInt(m[2], 10), weight: parseInt(m[3], 10) });
  }
  if (items.length === 0) FATAL("no items parsed");

  const mCap = text.match(/capacity\s+(\d+)/i);
  if (!mCap) FATAL("could not parse capacity");
  const capacity = parseInt(mCap[1], 10);

  if (!/optimal\s+total\s+value/i.test(text)) FATAL("prompt does not ask for optimal total value");

  let best = 0;
  for (let mask = 0; mask < (1 << items.length); mask++) {
    let w = 0, v = 0;
    for (let i = 0; i < items.length; i++) {
      if (mask & (1 << i)) { w += items[i].weight; v += items[i].value; }
    }
    if (w <= capacity && v > best) best = v;
  }

  console.log(String(best));
}

main();
