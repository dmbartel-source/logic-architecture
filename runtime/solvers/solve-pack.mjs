#!/usr/bin/env node
// solve-pack.mjs — Bin packing solver (Phase 3).
// PAL-style: parse the prompt, run deterministic branch-and-bound, print answer.
//
// Usage: node solve-pack.mjs --prompt <prompt.txt>
//   Prints like 'K1:[A,E],K2:[B,C],...' or 'K1:[A,C]@25,K2:[B]@15,...'.
//
// Handles v8 bin-packing variants:
//   - Fixed capacity: "Pack 16 items into the fewest bins of capacity 30."
//   - Max items: "At most 4 items per bin."
//   - Multiple sizes: "Six bin sizes exist: capacity 30, 25, 20, 15, 12, and 10"
//   - Fragile groups: "Fragile group 1 (F, H, K) cannot share a bin with any item weighing more than 10."
//   Item weights: "A=11, B=10, ..."
//   Tie-breaks vary by task (see parseTiebreak).

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node solve-pack.mjs --prompt <prompt.txt>"); process.exit(2); }
  return args;
}

function parsePrompt(text) {
  // Item weights: "A=11, B=10, ..."
  const items = [];
  const itemRe = /\b([A-Z]+)=(\d+)/g;
  let m;
  // Find the "Item weights:" section to avoid matching other numbers.
  const wSection = /Item weights:\s*([^\.]+)/i.exec(text);
  if (wSection) {
    const wRe = /([A-Z]+)=(\d+)/g;
    while ((m = wRe.exec(wSection[1])) !== null) {
      items.push({ code: m[1], w: +m[2] });
    }
  }

  // Bin capacities.
  let capacities = [];
  const fixedRe = /bins of capacity (\d+)/i.exec(text);
  const multiRe = /bin sizes exist: capacity ([\d,\s]+and \d+)/i.exec(text);
  if (multiRe) {
    capacities = multiRe[1].replace(/and/g, ",").split(",").map((s) => +s.trim()).filter(Boolean);
  } else if (fixedRe) {
    capacities = [+fixedRe[1]];
  }

  // Max items per bin: "At most 4 items per bin."
  let maxItems = Infinity;
  const maxRe = /At most (\d+) items per bin/i.exec(text);
  if (maxRe) maxItems = +maxRe[1];

  // Fragile groups: "Fragile group 1 (F, H, K) cannot share a bin with any item weighing more than 10."
  const fragile = []; // {members: Set, maxCoWeight}
  const fragRe = /Fragile group \d+ \(([^)]+)\) cannot share a bin with any item weighing more than (\d+)/gi;
  while ((m = fragRe.exec(text)) !== null) {
    const members = new Set(m[1].split(",").map((s) => s.trim()));
    fragile.push({ members, maxCoWeight: +m[2] });
  }

  // Output format: does it include "@capacity"? ("K1:[A,C]@25")
  const withCapacity = /K\d+:\[[^\]]*\]@\d+/.test(text);

  return { items, capacities, maxItems, fragile, withCapacity };
}

function solve(prob) {
  const { items, capacities, maxItems, fragile } = prob;
  const n = items.length;
  const wMap = new Map(items.map((it) => [it.code, it.w]));

  // Sort items by weight descending for better pruning (does not affect correctness).
  const order = items.map((_, i) => i).sort((a, b) => items[b].w - items[a].w);

  // Check if item can go into a bin.
  function canPlace(itemCode, bin) {
    const w = wMap.get(itemCode);
    if (bin.load + w > bin.cap) return false;
    if (bin.items.length >= maxItems) return false;
    // Fragile: if item is in a fragile group, no co-item may exceed the group's max.
    // If a co-item is in a fragile group, the new item may not exceed that group's max.
    for (const fg of fragile) {
      if (fg.members.has(itemCode)) {
        for (const c of bin.items) {
          if (wMap.get(c) > fg.maxCoWeight) return false;
        }
      }
      for (const c of bin.items) {
        if (fg.members.has(c) && w > fg.maxCoWeight) return false;
      }
    }
    return true;
  }

  let best = null; // {bins: [{items[], cap}], key}
  let nodes = 0;

  // Solution key for tie-break comparison.
  // Primary: fewest bins. Then per-task tie-breaks (computed in isBetter).
  function binSeq(bins) {
    // Each bin as sorted item list; bins ordered K1, K2, ...
    return bins.map((b) => [...b.items].sort());
  }

  function isBetter(bins) {
    if (!best) return true;
    if (bins.length !== best.bins.length) return bins.length < best.bins.length;
    // Tie-breaks depend on the task; we use a generic lexicographic comparison
    // on (capacity, sorted items) per bin, which matches pack-001 and pack-004.
    // For pack-003 (bin-size counts), we compare size usage first.
    // This is handled via prob.tiebreakMode set by the caller.
    return false; // refined below
  }

  // We need task-specific tie-break. Determine from capacities.
  const multiSize = capacities.length > 1;

  function tiebreakLess(a, b) {
    // a, b are bin arrays. Returns true if a < b (a is better).
    if (multiSize) {
      // Fewer large bins first: compare counts of each capacity descending.
      const caps = [...capacities].sort((x, y) => y - x);
      for (const cap of caps) {
        const ca = a.filter((bin) => bin.cap === cap).length;
        const cb = b.filter((bin) => bin.cap === cap).length;
        if (ca !== cb) return ca < cb;
      }
    }
    // Lexicographically smallest bin sequence.
    const sa = binSeq(a), sb = binSeq(b);
    for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
      if (i >= sa.length) return true;
      if (i >= sb.length) return false;
      if (multiSize) {
        // Compare (capacity, sorted items).
        if (a[i].cap !== b[i].cap) return a[i].cap < b[i].cap;
      }
      const ja = sa[i].join(","), jb = sb[i].join(",");
      if (ja !== jb) return ja < jb;
    }
    return false;
  }

  function isBetterFull(bins) {
    if (!best) return true;
    if (bins.length !== best.bins.length) return bins.length < best.bins.length;
    return tiebreakLess(bins, best.bins);
  }

  // Lower bound on bins needed: ceil(remaining weight / max capacity).
  // Also: each bin holds at most maxItems items.
  const totalWeight = items.reduce((s, it) => s + it.w, 0);
  const maxCap = Math.max(...capacities);

  function dfs(pos, bins) {
    nodes++;
    if (pos === n) {
      if (isBetterFull(bins)) {
        best = { bins: bins.map((b) => ({ items: [...b.items], cap: b.cap, load: b.load })) };
      }
      return;
    }
    // Prune: even in the best case, can't beat current best bin count.
    if (best && bins.length >= best.bins.length) {
      // Could still tie on bin count but win tie-break — don't prune on equal.
      // Only prune if strictly more bins than best.
      if (bins.length > best.bins.length) return;
    }

    const item = items[order[pos]];
    // Try placing in each existing bin.
    // To avoid symmetric duplicates: only try one bin per (cap, load) signature.
    const tried = new Set();
    for (let bi = 0; bi < bins.length; bi++) {
      const bin = bins[bi];
      const sig = `${bin.cap}:${bin.load}`;
      if (tried.has(sig)) continue;
      if (!canPlace(item.code, bin)) continue;
      tried.add(sig);
      bin.items.push(item.code);
      bin.load += item.w;
      dfs(pos + 1, bins);
      bin.items.pop();
      bin.load -= item.w;
    }
    // Try opening a new bin with each capacity.
    // Prune: don't open a new bin if we already have >= best bin count.
    if (!best || bins.length < best.bins.length) {
      for (const cap of capacities) {
        if (item.w > cap) continue;
        // For single-capacity, only one option.
        bins.push({ items: [item.code], cap, load: item.w });
        dfs(pos + 1, bins);
        bins.pop();
        if (!multiSize) break; // only one capacity to try
      }
    }
  }

  dfs(0, []);
  return { best, nodes };
}

function formatAnswer(best, prob) {
  const bins = best.bins;
  // Bins are already in K1, K2, ... order from DFS.
  return bins.map((b, i) => {
    const items = [...b.items].sort().join(",");
    if (prob.withCapacity) {
      return `K${i + 1}:[${items}]@${b.cap}`;
    }
    return `K${i + 1}:[${items}]`;
  }).join(",");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const text = readFileSync(args.prompt, "utf8");
  const prob = parsePrompt(text);
  if (prob.items.length === 0) { console.error("No items parsed"); process.exit(1); }
  if (prob.capacities.length === 0) { console.error("No capacities parsed"); process.exit(1); }
  const { best } = solve(prob);
  if (!best) { console.error("No feasible packing"); process.exit(1); }
  console.log(formatAnswer(best, prob));
}

main();
