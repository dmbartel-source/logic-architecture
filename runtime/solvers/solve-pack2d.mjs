#!/usr/bin/env node
// solve-pack2d.mjs — 2D grid packing solver (Phase 5).
// Place rectangles on a WxH grid (integer coords, origin top-left, no rotation,
// no overlap, fully inside) to maximize total value.
// Tie-breaks: more crates placed, then lexicographically smallest placement
// list in crate order.
//
// Usage: node solve-pack2d.mjs --prompt <prompt.txt>
//   Output: 'R@0,0;S@3,0;...' (placed crates only, in crate order)

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node solve-pack2d.mjs --prompt <prompt.txt>"); process.exit(2); }
  return args;
}

function parsePrompt(text) {
  // Grid: "9-wide x 6-tall grid"
  const gridRe = /(\d+)-wide x (\d+)-tall grid/i.exec(text);
  if (!gridRe) { console.error("No grid size found"); process.exit(1); }
  const W = +gridRe[1], H = +gridRe[2];

  // Crates: "R:3x2,v=14"
  const crates = [];
  const crateRe = /([A-Z]+):(\d+)x(\d+),v=(\d+)/g;
  let m;
  while ((m = crateRe.exec(text)) !== null) {
    crates.push({ code: m[1], w: +m[2], h: +m[3], v: +m[4] });
  }
  if (crates.length === 0) { console.error("No crates parsed"); process.exit(1); }
  return { W, H, crates };
}

function solve(W, H, crates) {
  const n = crates.length;
  // Sort by value density for search order, but track original index for tie-break.
  const order = crates.map((_, i) => i).sort((a, b) =>
    crates[b].v / (crates[b].w * crates[b].h) - crates[a].v / (crates[a].w * crates[a].h));

  // Occupancy grid.
  const grid = Array.from({ length: H }, () => new Array(W).fill(null));

  let best = null; // {value, count, placements: Map(code -> [x, y])}

  function canPlace(crate, x, y) {
    if (x + crate.w > W || y + crate.h > H) return false;
    for (let dy = 0; dy < crate.h; dy++) {
      for (let dx = 0; dx < crate.w; dx++) {
        if (grid[y + dy][x + dx] !== null) return false;
      }
    }
    return true;
  }

  function doPlace(crate, x, y, code) {
    for (let dy = 0; dy < crate.h; dy++) {
      for (let dx = 0; dx < crate.w; dx++) {
        grid[y + dy][x + dx] = code;
      }
    }
  }

  function doRemove(crate, x, y) {
    for (let dy = 0; dy < crate.h; dy++) {
      for (let dx = 0; dx < crate.w; dx++) {
        grid[y + dy][x + dx] = null;
      }
    }
  }

  // Upper bound: current value + sum of remaining values.
  const suffixVal = new Array(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) suffixVal[i] = suffixVal[i + 1] + crates[order[i]].v;

  // Phase 6 performance note: a fractional-knapsack bound on free area and a
  // greedy incumbent were tried. The bound's per-node overhead exceeded its
  // pruning benefit on this problem size (2m23s vs 105s baseline) because
  // geometry — not area — is the binding constraint, so the LP relaxation
  // is too loose to prune. Memoization was also tried and OOM'd (state space
  // too fine-grained). Reverted to the simple suffix bound, which is correct
  // if slow. Future: cell-branching DFS (branch on empty cells, not crates).

  function placementKey(placements) {
    // Lexicographically smallest placement list in crate order.
    const parts = [];
    for (const c of crates) {
      if (placements.has(c.code)) {
        const [x, y] = placements.get(c.code);
        parts.push(`${c.code}@${x},${y}`);
      }
    }
    return parts.join(";");
  }

  function isBetter(cand) {
    if (!best) return true;
    if (cand.value !== best.value) return cand.value > best.value;
    if (cand.count !== best.count) return cand.count > best.count;
    return placementKey(cand.placements) < placementKey(best.placements);
  }

  function dfs(pos, value, placements) {
    // Bound: prune if can't beat best value.
    if (best && value + suffixVal[pos] < best.value) return;
    if (pos === n) {
      const cand = { value, count: placements.size, placements: new Map(placements) };
      if (isBetter(cand)) best = cand;
      return;
    }
    const ci = order[pos];
    const crate = crates[ci];

    // Try placing at each valid position (row-major for determinism).
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (canPlace(crate, x, y)) {
          doPlace(crate, x, y, crate.code);
          placements.set(crate.code, [x, y]);
          dfs(pos + 1, value + crate.v, placements);
          placements.delete(crate.code);
          doRemove(crate, x, y);
        }
      }
    }
    // Try not placing this crate.
    dfs(pos + 1, value, placements);
  }

  dfs(0, 0, new Map());
  return best;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const text = readFileSync(args.prompt, "utf8");
  const { W, H, crates } = parsePrompt(text);
  const best = solve(W, H, crates);
  if (!best) { console.error("No placement found"); process.exit(1); }
  const parts = [];
  for (const c of crates) {
    if (best.placements.has(c.code)) {
      const [x, y] = best.placements.get(c.code);
      parts.push(`${c.code}@${x},${y}`);
    }
  }
  console.log(parts.join(";"));
}

main();
