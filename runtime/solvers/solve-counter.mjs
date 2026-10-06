#!/usr/bin/env node
// solve-counter.mjs — Counterfactual knapsack-margin solver (Phase 3).
// PAL-style: parse the prompt, run deterministic DP, print answer.
//
// Usage: node solve-counter.mjs --prompt <prompt.txt>
//   Prints the margin (optimal value minus second-best value) as an integer.
//
// Handles the v8 counterfactual knapsack format:
//   "Knapsack: 18 items (weight, value): A(8,20), B(7,18), ... Capacity 30."
//   "Rank all feasible subsets by (value desc, then fewer items, then alphabetical)."
//   "Output ONLY the margin: optimal value minus second-best value, as an integer."

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = { mode: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else if (argv[i] === "--mode") args.mode = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node solve-counter.mjs --prompt <prompt.txt> [--mode margin|quadruple]"); process.exit(2); }
  return args;
}

function parsePrompt(text) {
  const items = [];
  const itemRe = /([A-Z]+)\((\d+),\s*(\d+)\)/g;
  let m;
  // Find the "items (weight, value):" section.
  const sec = /items \(weight, value\):\s*([^\.]+)/i.exec(text);
  const src = sec ? sec[1] : text;
  while ((m = itemRe.exec(src)) !== null) {
    items.push({ code: m[1], w: +m[2], val: +m[3] });
  }
  const capRe = /Capacity (\d+)/i.exec(text);
  const capacity = capRe ? +capRe[1] : 0;
  return { items, capacity };
}

function solve(items, capacity) {
  const n = items.length;
  // DP over weight: dp[w] = list of {val, count, key} Pareto-optimal states.
  // For margin we need the best and second-best distinct (val, count, key) triples.
  // Simpler: enumerate with branch-and-bound tracking top-2.

  let best1 = null; // {val, count, key}
  let best2 = null;

  function rankKey(codes) {
    return codes.slice().sort().join("+");
  }

  function consider(codes, val) {
    const count = codes.length;
    const key = rankKey(codes);
    const cand = { val, count, key };
    // Insert into top-2.
    const cmps = [best1, best2, cand].filter(Boolean);
    // Sort by (val desc, count asc, key asc).
    cmps.sort((a, b) => b.val - a.val || a.count - b.count || (a.key < b.key ? -1 : 1));
    // Deduplicate identical triples.
    const uniq = [];
    for (const c of cmps) {
      if (!uniq.some((u) => u.val === c.val && u.count === c.count && u.key === c.key)) {
        uniq.push(c);
      }
    }
    best1 = uniq[0] || null;
    best2 = uniq[1] || null;
  }

  // Branch and bound: order by value density.
  const order = items.map((_, i) => i).sort((a, b) =>
    items[b].val / items[b].w - items[a].val / items[a].w);
  const suffixVal = new Array(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) suffixVal[i] = suffixVal[i + 1] + items[order[i]].val;

  function dfs(pos, chosen, w, val) {
    if (w > capacity) return;
    if (pos === n) {
      consider(chosen.map((i) => items[i].code), val);
      return;
    }
    // Bound: prune if even the optimistic upper can't beat best2's value.
    // (We need top-2, so prune only if upper < best2.val.)
    if (best2 && val + suffixVal[pos] < best2.val) return;
    const i = order[pos];
    // Include
    if (w + items[i].w <= capacity) {
      chosen.push(i);
      dfs(pos + 1, chosen, w + items[i].w, val + items[i].val);
      chosen.pop();
    }
    // Exclude
    dfs(pos + 1, chosen, w, val);
  }

  dfs(0, [], 0, 0);
  return { best1, best2 };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const text = readFileSync(args.prompt, "utf8");
  const { items, capacity } = parsePrompt(text);
  if (items.length === 0) { console.error("No items parsed"); process.exit(1); }

  // Auto-detect quadruple mode from prompt ("removing QUADRUPLES of items"),
  // unless --mode explicitly overrides.
  const wantQuadruple = args.mode === "quadruple" ||
    (args.mode === null && /removing QUADRUPLES/i.test(text));
  if (wantQuadruple) {
    // Phase 5: enumerate 4-combinations; find alphabetically-first quadruple
    // whose joint removal changes the optimal set.
    const result = solveQuadruple(items, capacity);
    console.log(result);
    return;
  }

  const { best1, best2 } = solve(items, capacity);
  if (!best1 || !best2) { console.error("Need at least 2 feasible subsets"); process.exit(1); }
  console.log(String(best1.val - best2.val));
}

// Phase 5: quadruple-removal counterfactual.
// Returns the alphabetically-first 'W+X+Y+Z' whose removal changes the optimal set, or 'NONE'.
function solveQuadruple(items, capacity) {
  // Optimal set ranking: (value desc, fewer items, alphabetical key).
  function optimalSet(pool) {
    const n = pool.length;
    let best = null;
    const order = pool.map((_, i) => i).sort((a, b) =>
      pool[b].val / pool[b].w - pool[a].val / pool[a].w);
    const suffixVal = new Array(n + 1).fill(0);
    for (let i = n - 1; i >= 0; i--) suffixVal[i] = suffixVal[i + 1] + pool[order[i]].val;

    function isBetter(cand) {
      if (!best) return true;
      if (cand.val !== best.val) return cand.val > best.val;
      if (cand.count !== best.count) return cand.count < best.count;
      return cand.key < best.key;
    }

    function dfs(pos, chosen, w, val) {
      if (w > capacity) return;
      if (best && val + suffixVal[pos] < best.val) return;
      if (pos === n) {
        const codes = chosen.map((i) => pool[i].code);
        const cand = { val, count: codes.length, key: codes.slice().sort().join("+") };
        if (isBetter(cand)) best = cand;
        return;
      }
      const i = order[pos];
      if (w + pool[i].w <= capacity) {
        chosen.push(i);
        dfs(pos + 1, chosen, w + pool[i].w, val + pool[i].val);
        chosen.pop();
      }
      dfs(pos + 1, chosen, w, val);
    }
    dfs(0, [], 0, 0);
    return best ? best.key : null;
  }

  const baseline = optimalSet(items);
  const codes = items.map((it) => it.code).sort();

  // Generate all 4-combinations in alphabetical order of their 'W+X+Y+Z' string.
  const quads = [];
  const n = codes.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          quads.push([codes[a], codes[b], codes[c], codes[d]]);
  quads.sort((x, y) => {
    const xs = x.join("+"), ys = y.join("+");
    return xs < ys ? -1 : xs > ys ? 1 : 0;
  });

  for (const q of quads) {
    const qset = new Set(q);
    const pool = items.filter((it) => !qset.has(it.code));
    const opt = optimalSet(pool);
    if (opt !== baseline) {
      return q.join("+");
    }
  }
  return "NONE";
}

main();
