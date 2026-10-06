#!/usr/bin/env node
// solvers/v10-select-001.mjs — Constrained project selection: maximize total
// value subject to two weight capacities, dependency requirements
// (X requires Y), and a quota (>= k projects with value >= threshold).
// Tie-break: lexicographically smallest sorted name list.
// PAL-style: exhaustive subset enumeration (2^N), exact.
// Mode-17: FAIL LOUDLY (FATAL on stderr, exit 1) on any unparseable input.
// Usage: node v10-select-001.mjs --prompt <prompt.txt>

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v10-select-001.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

const FATAL = (msg) => { console.error(`FATAL: ${msg}`); process.exit(1); };

// Element-wise lexicographic compare of two sorted name arrays.
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

  const items = [];
  const re = /([A-Za-z]+):\s*value=(\d+),\s*weight1=(\d+),\s*weight2=(\d+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    items.push({ name: m[1], value: +m[2], w1: +m[3], w2: +m[4] });
  }
  if (items.length === 0) FATAL("no candidate projects parsed");
  const idx = new Map(items.map((it, i) => [it.name, i]));

  const deps = [];
  const reD = /([A-Za-z]+)\s+requires\s+([A-Za-z]+)/g;
  while ((m = reD.exec(text)) !== null) {
    if (!idx.has(m[1]) || !idx.has(m[2])) FATAL(`dependency on unknown project ${m[1]}/${m[2]}`);
    deps.push([idx.get(m[1]), idx.get(m[2])]);
  }

  const mC = text.match(/weight1\s*<=\s*(\d+)\s*,\s*weight2\s*<=\s*(\d+)/);
  if (!mC) FATAL("could not parse capacities");
  const cap1 = +mC[1], cap2 = +mC[2];

  const mQ = text.match(/at least (\d+) projects with value >= (\d+)/);
  if (!mQ) FATAL("could not parse quota");
  const quotaK = +mQ[1], quotaV = +mQ[2];

  if (!/Maximize total value/i.test(text)) FATAL("objective not found");
  if (!/lexicographically smallest sorted name list/i.test(text)) FATAL("tie-break rule not found");

  const N = items.length;
  let bestVal = -Infinity, bestList = null;
  for (let mask = 0; mask < (1 << N); mask++) {
    const sel = [];
    let v = 0, w1 = 0, w2 = 0, q = 0;
    for (let i = 0; i < N; i++) {
      if (mask & (1 << i)) {
        sel.push(i);
        v += items[i].value; w1 += items[i].w1; w2 += items[i].w2;
        if (items[i].value >= quotaV) q++;
      }
    }
    if (w1 > cap1 || w2 > cap2) continue;
    if (q < quotaK) continue;
    const inSel = new Set(sel);
    if (!deps.every(([a, b]) => !inSel.has(a) || inSel.has(b))) continue;
    const names = sel.map((i) => items[i].name).sort();
    if (v > bestVal || (v === bestVal && cmpNameLists(names, bestList) < 0)) {
      bestVal = v; bestList = names;
    }
  }
  if (bestList === null) FATAL("no feasible selection");
  console.log("VALUE:" + bestList.join(","));
}

main();
