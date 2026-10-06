#!/usr/bin/env node
// solvers/v10-select-002.mjs — Team selection: pick exactly K people covering
// required roles, honoring pairwise conflicts, maximizing total cost
// (skill proxy). Tie-break: lexicographically smallest sorted name list.
// PAL-style: exhaustive C(N,K) enumeration, exact.
// Mode-17: FAIL LOUDLY (FATAL on stderr, exit 1) on any unparseable input.
// Usage: node v10-select-002.mjs --prompt <prompt.txt>

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v10-select-002.mjs --prompt <prompt.txt>"); process.exit(1); }
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

  const people = [];
  const re = /([A-Za-z]+):\s*([a-z]+),\s*cost=(\d+)/g;
  let m;
  while ((m = re.exec(text)) !== null) people.push({ name: m[1], role: m[2], cost: +m[3] });
  if (people.length === 0) FATAL("no candidates parsed");
  const idx = new Map(people.map((p, i) => [p.name, i]));

  const conflicts = [];
  const reC = /([A-Za-z]+)\s+conflicts with\s+([A-Za-z]+)/g;
  while ((m = reC.exec(text)) !== null) {
    if (!idx.has(m[1]) || !idx.has(m[2])) FATAL(`conflict on unknown person ${m[1]}/${m[2]}`);
    conflicts.push([idx.get(m[1]), idx.get(m[2])]);
  }

  const mK = text.match(/Select exactly (\d+) people covering roles ([^.]+?)\./i);
  if (!mK) FATAL("could not parse selection size / required roles");
  const K = +mK[1];
  const required = mK[2].replace(/\s*\(.*?\)/g, "").replace(/\band\b/gi, ",").split(",").map((s) => s.trim()).filter(Boolean);
  if (required.length === 0) FATAL("no required roles parsed");
  if (!/Maximize total cost/i.test(text)) FATAL("objective not found");

  const N = people.length;
  let bestCost = -Infinity, bestList = null;
  const combo = [];
  const search = (start) => {
    if (combo.length === K) {
      const inSel = new Set(combo);
      if (conflicts.some(([a, b]) => inSel.has(a) && inSel.has(b))) return;
      const roles = new Set(combo.map((i) => people[i].role));
      if (!required.every((r) => roles.has(r))) return;
      const cost = combo.reduce((s, i) => s + people[i].cost, 0);
      const names = combo.map((i) => people[i].name).sort();
      if (cost > bestCost || (cost === bestCost && cmpNameLists(names, bestList) < 0)) {
        bestCost = cost; bestList = names;
      }
      return;
    }
    for (let i = start; i < N; i++) { combo.push(i); search(i + 1); combo.pop(); }
  };
  search(0);
  if (bestList === null) FATAL("no feasible team");
  console.log("TOTAL:" + bestList.join(","));
}

main();
