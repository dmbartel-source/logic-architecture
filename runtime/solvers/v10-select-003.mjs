#!/usr/bin/env node
// solvers/v10-select-003.mjs — Budget allocation with diminishing returns:
// each initiative takes 0..maxU $10k units; unit returns given as marginal
// lists. Budget = U units. Optional floor constraint on one initiative.
// Maximize total return ($k). Tie-break: lexicographically smallest allocation.
// PAL-style: exhaustive allocation enumeration ((maxU+1)^N), exact.
// Mode-17: FAIL LOUDLY (FATAL on stderr, exit 1) on any unparseable input.
// Usage: node v10-select-003.mjs --prompt <prompt.txt>

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v10-select-003.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

const FATAL = (msg) => { console.error(`FATAL: ${msg}`); process.exit(1); };

function cmpAlloc(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");

  const inits = [];
  const re = /([A-Z]):\s*unit returns\s*\[([\d,\s]+)\]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const marginals = m[2].split(",").map((s) => +s.trim());
    if (marginals.some((x) => !Number.isFinite(x))) FATAL(`bad marginal list for ${m[1]}`);
    inits.push({ name: m[1], marginals });
  }
  if (inits.length === 0) FATAL("no initiatives parsed");

  // Mode-18 canonicalization (DTC trial 2026-10-06): the tie-break "lexicographically
  // smallest allocation" and the output must be in NAME order, not prompt parse order.
  // Sorting here makes cmpAlloc's positional comparison name-ordered by construction.
  inits.sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));

  const mB = text.match(/\$(\d+)k\s*\((\d+)\s*units?\)/i);
  if (!mB) FATAL("could not parse budget");
  const budget = +mB[2];

  const mU = text.match(/Each initiative takes 0-(\d+) units/i);
  if (!mU) FATAL("could not parse per-initiative unit cap");
  const maxU = +mU[1];

  let floorName = null, floorMin = 0;
  const mF = text.match(/initiative\s+([A-Z])\s+must receive at least (\d+)\s*units?/i);
  if (mF) { floorName = mF[1]; floorMin = +mF[2]; }
  if (floorName && !inits.some((x) => x.name === floorName)) FATAL(`floor on unknown initiative ${floorName}`);

  if (!/Maximize total return/i.test(text)) FATAL("objective not found");

  for (const x of inits) {
    if (x.marginals.length < maxU) FATAL(`initiative ${x.name}: only ${x.marginals.length} marginals for maxU=${maxU}`);
  }

  const N = inits.length;
  let bestRet = -Infinity, bestAlloc = null;
  const alloc = new Array(N).fill(0);
  const search = (i, used) => {
    if (i === N) {
      if (used > budget) return;
      let ret = 0;
      for (let j = 0; j < N; j++) {
        for (let u = 0; u < alloc[j]; u++) ret += inits[j].marginals[u];
      }
      if (ret > bestRet || (ret === bestRet && cmpAlloc(alloc, bestAlloc) < 0)) {
        bestRet = ret; bestAlloc = [...alloc];
      }
      return;
    }
    const lo = inits[i].name === floorName ? floorMin : 0;
    for (let u = lo; u <= maxU; u++) {
      if (used + u > budget) break;
      alloc[i] = u;
      search(i + 1, used + u);
    }
    alloc[i] = 0;
  };
  search(0, 0);
  if (bestAlloc === null) FATAL("no feasible allocation");
  console.log("RETURN:" + inits.map((x, i) => `${x.name}=${bestAlloc[i]}`).join(","));
}

main();
