#!/usr/bin/env node
// solvers/v10-select-004.mjs — Vendor selection: pick exactly K vendors,
// combined quality >= Q, combined delivery >= D, minimize combined price.
// Tie-break: lexicographically smallest sorted name list.
// PAL-style: exhaustive C(N,K) enumeration, exact.
// Mode-17: FAIL LOUDLY (FATAL on stderr, exit 1) on any unparseable input.
// Usage: node v10-select-004.mjs --prompt <prompt.txt>

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v10-select-004.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

const FATAL = (msg) => { console.error(`FATAL: ${msg}`); process.exit(1); };

function cmpNameLists(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return a.length - b.length;
}

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");

  const vendors = [];
  const re = /(\w+):\s*price=\$(\d+),\s*quality=(\d+),\s*delivery=(\d+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    vendors.push({ name: m[1], price: +m[2], quality: +m[3], delivery: +m[4] });
  }
  if (vendors.length === 0) FATAL("no vendors parsed");

  const mK = text.match(/Select exactly (\d+) vendors/i);
  if (!mK) FATAL("could not parse selection size");
  const K = +mK[1];

  const mC = text.match(/combined quality\s*>=\s*(\d+)\s*,\s*combined delivery\s*>=\s*(\d+)/i);
  if (!mC) FATAL("could not parse quality/delivery thresholds");
  const minQ = +mC[1], minD = +mC[2];

  if (!/Minimize combined price/i.test(text)) FATAL("objective not found");

  const N = vendors.length;
  let bestPrice = Infinity, bestList = null;
  const combo = [];
  const search = (start) => {
    if (combo.length === K) {
      const q = combo.reduce((s, i) => s + vendors[i].quality, 0);
      const d = combo.reduce((s, i) => s + vendors[i].delivery, 0);
      if (q < minQ || d < minD) return;
      const price = combo.reduce((s, i) => s + vendors[i].price, 0);
      const names = combo.map((i) => vendors[i].name).sort();
      if (price < bestPrice || (price === bestPrice && cmpNameLists(names, bestList) < 0)) {
        bestPrice = price; bestList = names;
      }
      return;
    }
    for (let i = start; i < N; i++) { combo.push(i); search(i + 1); combo.pop(); }
  };
  search(0);
  if (bestList === null) FATAL("no feasible vendor pair");
  console.log("PRICE:" + bestList.join(","));
}

main();
