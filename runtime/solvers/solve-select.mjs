#!/usr/bin/env node
// solve-select.mjs — Constrained selection solver (Phase 3).
// PAL-style: parse the prompt, run deterministic branch-and-bound, print answer.
//
// Usage: node solve-select.mjs --prompt <prompt.txt>
//   Prints the chosen codes like 'A+C+F'.
//
// Handles the v8 constrained-selection format:
//   "Choose a subset of N cargo items (code: weight, volume, hazard-units, toxicity, value, flags):"
//   "A: w=9, vol=8, haz=4, tox=3, val=20, elec,frag"
//   "Constraints: total weight <= 60, ...; at least 5 electronics, ...;
//    not both A and B; C requires D; ..."
//   "Maximize total value; tie-breaks: fewer items, then alphabetically smallest '+'-joined sorted list."
//   "Output ONLY the chosen codes like 'A+C+F'."

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node solve-select.mjs --prompt <prompt.txt>"); process.exit(2); }
  return args;
}

// Flag name normalization: prompt uses elec/frag/per/li (sometimes full words).
const FLAG_ALIASES = {
  elec: "elec", electronic: "elec", electronics: "elec",
  frag: "frag", fragile: "frag",
  per: "per", perishable: "per",
  li: "li", lithium: "li",
};

function normFlag(f) {
  const k = f.trim().toLowerCase();
  return FLAG_ALIASES[k] || k;
}

function parsePrompt(text) {
  const items = [];
  const itemRe = /^([A-Z]+):\s*w=(\d+),\s*vol=(\d+),\s*haz=(\d+),\s*tox=(\d+),\s*val=(\d+),\s*(.+)$/gm;
  let m;
  while ((m = itemRe.exec(text)) !== null) {
    const flags = m[7].trim().toLowerCase() === "none" ? [] : m[7].split(",").map(normFlag);
    items.push({
      code: m[1], w: +m[2], vol: +m[3], haz: +m[4], tox: +m[5], val: +m[6],
      flags: new Set(flags),
    });
  }

  const constraints = {
    caps: {},        // attr -> max  (w, vol, haz, tox)
    minFlags: {},    // flag -> min count
    maxFlags: {},    // flag -> max count
    notBoth: [],     // [a, b]
    requires: [],    // [a, b] : a requires b
    togetherRequires: [], // [[a,b], c] : a and b together require c
  };

  // Caps: "total weight <= 60", "total volume <= 50", "total hazard-units <= 32", "total toxicity <= 28"
  const capRe = /total\s+(weight|volume|hazard-units|toxicity)\s*<=\s*(\d+)/gi;
  const capKey = { weight: "w", volume: "vol", "hazard-units": "haz", toxicity: "tox" };
  while ((m = capRe.exec(text)) !== null) constraints.caps[capKey[m[1].toLowerCase()]] = +m[2];

  // "at least 5 electronics", "at least 1 but at most 3 lithium items"
  // Handle "at least X but at most Y <flag>" first (sets only the max).
  const minMaxRe = /at least (\d+) but at most (\d+) ([a-z]+)/gi;
  while ((m = minMaxRe.exec(text)) !== null) {
    const f = normFlag(m[3]);
    constraints.maxFlags[f] = Math.min(constraints.maxFlags[f] ?? Infinity, +m[2]);
  }
  const textWithoutMinMax = text.replace(minMaxRe, "");
  const minRe = /at least (\d+) ([a-z]+)/gi;
  while ((m = minRe.exec(textWithoutMinMax)) !== null) {
    const f = normFlag(m[2]);
    // Skip non-flag words that might follow "at least".
    if (!["elec", "frag", "per", "li"].includes(f)) continue;
    constraints.minFlags[f] = Math.max(constraints.minFlags[f] || 0, +m[1]);
  }
  const maxRe = /at most (\d+) ([a-z]+)/gi;
  while ((m = maxRe.exec(text)) !== null) {
    const f = normFlag(m[2]);
    constraints.maxFlags[f] = Math.min(constraints.maxFlags[f] ?? Infinity, +m[1]);
  }

  // "not both A and B"
  const nbRe = /not both ([A-Z]+) and ([A-Z]+)/gi;
  while ((m = nbRe.exec(text)) !== null) constraints.notBoth.push([m[1], m[2]]);

  // "C requires D"
  const reqRe = /\b([A-Z]+) requires ([A-Z]+)(?![a-z])/g;
  while ((m = reqRe.exec(text)) !== null) constraints.requires.push([m[1], m[2]]);

  // "M and N together require O"
  const togRe = /\b([A-Z]+) and ([A-Z]+) together require ([A-Z]+)/gi;
  while ((m = togRe.exec(text)) !== null) constraints.togetherRequires.push([[m[1], m[2]], m[3]]);

  return { items, constraints };
}

function solve(items, c) {
  const n = items.length;
  const idx = new Map(items.map((it, i) => [it.code, i]));

  // Order by value density for good incumbent early (does not affect correctness).
  const order = items.map((_, i) => i).sort((a, b) =>
    items[b].val / (items[b].w + items[b].vol + 1) - items[a].val / (items[a].w + items[a].vol + 1));

  // Suffix value sums for upper bound (in search order).
  const suffixVal = new Array(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) suffixVal[i] = suffixVal[i + 1] + items[order[i]].val;

  let best = null; // {val, codes[]}
  let nodes = 0;

  // Partial state for fast constraint checking.
  function checkPartial(chosen /*Set of indices*/, depth) {
    let w = 0, vol = 0, haz = 0, tox = 0;
    for (const i of chosen) {
      w += items[i].w; vol += items[i].vol; haz += items[i].haz; tox += items[i].tox;
    }
    if (c.caps.w !== undefined && w > c.caps.w) return false;
    if (c.caps.vol !== undefined && vol > c.caps.vol) return false;
    if (c.caps.haz !== undefined && haz > c.caps.haz) return false;
    if (c.caps.tox !== undefined && tox > c.caps.tox) return false;
    // notBoth: violated if both chosen
    for (const [a, b] of c.notBoth) {
      if (chosen.has(idx.get(a)) && chosen.has(idx.get(b))) return false;
    }
    // requires: if a chosen but b not chosen AND b is already decided-out → violated.
    // Conservative: only check when all items decided (at leaf). Handled in checkFull.
    // togetherRequires: similar, leaf-only.
    // maxFlags: check now (monotone)
    for (const [f, mx] of Object.entries(c.maxFlags)) {
      let cnt = 0;
      for (const i of chosen) if (items[i].flags.has(f)) cnt++;
      if (cnt > mx) return false;
    }
    return true;
  }

  function checkFull(chosen) {
    // minFlags
    for (const [f, mn] of Object.entries(c.minFlags)) {
      let cnt = 0;
      for (const i of chosen) if (items[i].flags.has(f)) cnt++;
      if (cnt < mn) return false;
    }
    // requires
    for (const [a, b] of c.requires) {
      if (chosen.has(idx.get(a)) && !chosen.has(idx.get(b))) return false;
    }
    // togetherRequires
    for (const [[a, b], req] of c.togetherRequires) {
      if (chosen.has(idx.get(a)) && chosen.has(idx.get(b)) && !chosen.has(idx.get(req))) return false;
    }
    return true;
  }

  function isBetter(codes, val) {
    if (!best) return true;
    if (val !== best.val) return val > best.val;
    if (codes.length !== best.codes.length) return codes.length < best.codes.length;
    return codes.join("+") < best.codes.join("+");
  }

  // Upper bound: current value + all remaining value (weak but correct).
  // Tighter: fractional knapsack on weight only. Use simple suffix sum (correct).
  function dfs(pos, chosen, val) {
    nodes++;
    if (pos === n) {
      if (checkFull(chosen)) {
        const codes = [...chosen].map((i) => items[i].code).sort();
        if (isBetter(codes, val)) best = { val, codes };
      }
      return;
    }
    // Bound: even taking everything remaining can't beat best → prune.
    // For tie-break correctness: prune only if upper < best.val, OR
    // upper == best.val and we can't improve tie-break. Conservative: prune
    // only when suffixVal gives strictly less than best.val.
    if (best && val + suffixVal[pos] < best.val) return;
    // (Also prune when equal but tie-break can't improve: skip for simplicity,
    //  correctness preserved since we only prune strict-less.)

    if (!checkPartial(chosen, pos)) return;

    const i = order[pos];
    // Branch: include
    chosen.add(i);
    if (checkPartial(chosen, pos)) dfs(pos + 1, chosen, val + items[i].val);
    chosen.delete(i);
    // Branch: exclude
    dfs(pos + 1, chosen, val);
  }

  dfs(0, new Set(), 0);
  return { best, nodes };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const text = readFileSync(args.prompt, "utf8");
  const { items, constraints } = parsePrompt(text);
  if (items.length === 0) { console.error("No items parsed"); process.exit(1); }
  const { best } = solve(items, constraints);
  if (!best) { console.error("No feasible subset"); process.exit(1); }
  console.log(best.codes.join("+"));
}

main();
