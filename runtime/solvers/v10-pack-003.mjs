#!/usr/bin/env node
// solvers/v10-pack-003.mjs — 0/1 knapsack with a fragile rule; maximize total
// value. Fragile rule (per prompt): every selected fragile item must weigh at
// least as much as every selected non-fragile item.
// Tie-break: lexicographically smallest sorted name list.
// Output ONLY like 'VALUE:name1,name2,...' with names sorted alphabetically
// (e.g. '75:P3,P5').
// Method: exhaustive 2^n search (exact); tie-break by element-wise
// lexicographic comparison of sorted name lists. A second reverse-order
// pass must reproduce the same value and name list (determinism check).
// Mode-17: FATAL on any unparseable input.
// Usage: node v10-pack-003.mjs --prompt <prompt.txt>

import { readPrompt, FATAL, diag } from "./lib/v10-util.mjs";

function cmpNameLists(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i >= a.length) return -1;
    if (i >= b.length) return 1;
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

function main() {
  const text = readPrompt(process.argv.slice(2));

  const items = [];
  const ire = /^([A-Za-z0-9]+):\s*value=(\d+),\s*weight=(\d+),\s*fragile=(True|False)\s*$/gm;
  let m;
  while ((m = ire.exec(text)) !== null)
    items.push({ name: m[1], value: parseInt(m[2], 10), weight: parseInt(m[3], 10), fragile: m[4] === "True" });
  if (items.length === 0) FATAL("no items parsed");
  const labelCount = (text.match(/^[A-Za-z0-9]+:\s*value=\d+,\s*weight=\d+,\s*fragile=(True|False)\s*$/gm) || []).length;
  if (labelCount !== items.length)
    FATAL(`parsed ${items.length} items but found ${labelCount} item lines`);

  const capM = /Weight capacity:\s*(\d+)/i.exec(text);
  if (!capM) FATAL("weight capacity not parsed");
  const CAP = parseInt(capM[1], 10);

  if (!/fragile item cannot have any heavier item stacked above it/i.test(text))
    FATAL("fragile rule statement not found");
  if (!/every selected fragile item must weigh at least as much as every selected non-fragile item/i.test(text))
    FATAL("fragile rule definition not found");
  if (!/maximize total value/i.test(text)) FATAL("expected value-maximization directive");
  if (!/lexicographically smallest sorted name list/i.test(text)) FATAL("expected lexicographic tie-break");

  // Fragile rule: min weight over selected fragile >= max weight over
  // selected non-fragile (vacuous if either set is empty).
  function fragileOk(sel) {
    const fr = sel.filter((x) => x.fragile);
    const nf = sel.filter((x) => !x.fragile);
    if (fr.length === 0 || nf.length === 0) return true;
    const minFr = Math.min(...fr.map((x) => x.weight));
    const maxNf = Math.max(...nf.map((x) => x.weight));
    return minFr >= maxNf;
  }

  const n = items.length;
  function search(reverse) {
    let best = null;
    const masks = [];
    for (let mask = 0; mask < (1 << n); mask++) masks.push(mask);
    if (reverse) masks.reverse();
    for (const mask of masks) {
      const sel = items.filter((_, i) => (mask >> i) & 1);
      if (sel.reduce((s, x) => s + x.weight, 0) > CAP) continue;
      if (!fragileOk(sel)) continue;
      const v = sel.reduce((s, x) => s + x.value, 0);
      const names = sel.map((x) => x.name).sort();
      if (!best || v > best.v || (v === best.v && cmpNameLists(names, best.names) < 0))
        best = { v, names };
    }
    return best;
  }

  const primary = search(false);
  if (!primary) FATAL("no feasible selection found (even empty set) — internal bug");
  const check = search(true);
  if (check.v !== primary.v || cmpNameLists(check.names, primary.names) !== 0)
    FATAL(`self-verification mismatch: ${primary.v}:${primary.names.join(",")} vs ${check.v}:${check.names.join(",")}`);

  diag(`optimum value ${primary.v}: ${primary.names.join(",")}`);
  // v10 bank repair (Oct 6 2026): the prompt demands the word-prefix form
  // "Output ONLY like 'VALUE:name1,name2,...'" — the prompt is the contract.
  console.log(`VALUE:${primary.names.join(",")}`);
}

main();
