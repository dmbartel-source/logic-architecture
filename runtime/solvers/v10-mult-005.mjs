#!/usr/bin/env node
// solvers/v10-mult-005.mjs — Multi-optimum pair selection: select K people to
// maximize total skill; enumerate ALL optimal subsets, output ONE canonical
// choice — alphabetically-first sorted-name-list, comma-joined (mode 18; never
// input order). Exhaustive search.
// Mode-17: FAIL LOUDLY (FATAL on stderr, exit 1) if prompt structure mismatches.
// Usage: node v10-mult-005.mjs --prompt <prompt.txt>

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v10-mult-005.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

const FATAL = (msg) => { console.error(`FATAL: ${msg}`); process.exit(1); };

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");

  // "Select 2 people to maximize total skill. Candidates: P1: skill=50; ..."
  const mK = text.match(/Select\s+(\d+)\s+people?\s+to\s+maximize\s+total\s+skill/i);
  if (!mK) FATAL("could not parse selection count");
  const k = parseInt(mK[1], 10);

  const candRe = /(\w+):\s*skill=(\d+)/g;
  const cands = [];
  let m;
  while ((m = candRe.exec(text)) !== null) {
    cands.push({ name: m[1], skill: parseInt(m[2], 10) });
  }
  if (cands.length === 0) FATAL("no candidates parsed");
  if (k > cands.length) FATAL("selection count exceeds candidates");

  if (!/output\s+one\s+optimal\s+pair/i.test(text) && !/more\s+than\s+one\s+pair/i.test(text))
    FATAL("prompt does not describe a multi-optimum pair selection");
  if (!/sorted\s+alphabetically/i.test(text))
    FATAL("prompt does not require alphabetical sorting");

  function* combos(arr, kk, start = 0, prefix = []) {
    if (prefix.length === kk) { yield prefix; return; }
    for (let i = start; i < arr.length; i++) yield* combos(arr, kk, i + 1, [...prefix, arr[i]]);
  }

  let best = -Infinity;
  const optLists = [];
  for (const combo of combos(cands, k)) {
    const total = combo.reduce((a, c) => a + c.skill, 0);
    if (total > best) { best = total; optLists.length = 0; }
    if (total === best) optLists.push(combo.map((c) => c.name).sort());
  }
  if (optLists.length === 0) FATAL("no optimal pair found");

  // Canonical tie-break: alphabetically-first sorted name list.
  optLists.sort((a, b) => (a.join(",") < b.join(",") ? -1 : a.join(",") > b.join(",") ? 1 : 0));
  console.log(optLists[0].join(","));
}

main();
