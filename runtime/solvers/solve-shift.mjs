#!/usr/bin/env node
// solve-shift.mjs — Shift assignment solver (Phase 5).
// Assign shifts to workers: each worker at most 3 shifts, no two consecutive
// shifts in shift order, maximize total points.
// Tie-break: lexicographically smallest worker sequence in shift order.
//
// Usage: node solve-shift.mjs --prompt <prompt.txt>
//   Output: 'Dawn:Nia,Noon:Pia,...'

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node solve-shift.mjs --prompt <prompt.txt>"); process.exit(2); }
  return args;
}

function parsePrompt(text) {
  // Shifts: "Dawn: Nia(5), Omar(8), Tara(6)"
  const shifts = [];
  const shiftRe = /^([A-Za-z0-9]+):\s*(.+)$/gm;
  let m;
  while ((m = shiftRe.exec(text)) !== null) {
    const name = m[1];
    // Skip non-shift lines (e.g., "Tie-break: ...").
    if (/^(tie|output|rules)$/i.test(name)) continue;
    const options = [];
    const optRe = /([A-Za-z]+)\((\d+)\)/g;
    let om;
    while ((om = optRe.exec(m[2])) !== null) {
      options.push({ worker: om[1], points: +om[2] });
    }
    if (options.length > 0) shifts.push({ name, options });
  }

  // Shift order from tie-break: "(Dawn, Noon, Dusk, ...)"
  const orderRe = /shift order \(([^)]+)\)/i.exec(text);
  let order = null;
  if (orderRe) {
    order = orderRe[1].split(",").map((s) => s.trim());
    // Reorder shifts to match.
    const byName = new Map(shifts.map((s) => [s.name, s]));
    const ordered = [];
    for (const n of order) {
      if (byName.has(n)) ordered.push(byName.get(n));
    }
    // Add any missing (shouldn't happen).
    for (const s of shifts) {
      if (!ordered.includes(s)) ordered.push(s);
    }
    return { shifts: ordered };
  }
  return { shifts };
}

function solve(shifts) {
  const n = shifts.length;
  const maxPerWorker = 3;

  let best = null; // {points, seq[]}

  function isBetter(cand) {
    if (!best) return true;
    if (cand.points !== best.points) return cand.points > best.points;
    // Lexicographically smallest worker sequence.
    for (let i = 0; i < cand.seq.length; i++) {
      if (cand.seq[i] !== best.seq[i]) return cand.seq[i] < best.seq[i];
    }
    return false;
  }

  // Upper bound: sum of max points for remaining shifts.
  const maxSuffix = new Array(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    const mx = Math.max(...shifts[i].options.map((o) => o.points));
    maxSuffix[i] = maxSuffix[i + 1] + mx;
  }

  function dfs(pos, counts, prevWorker, points, seq) {
    if (best && points + maxSuffix[pos] < best.points) return;
    if (pos === n) {
      const cand = { points, seq: [...seq] };
      if (isBetter(cand)) best = cand;
      return;
    }
    const shift = shifts[pos];
    // Try workers in alphabetical order for deterministic tie-break exploration.
    const opts = [...shift.options].sort((a, b) => a.worker < b.worker ? -1 : 1);
    for (const { worker, points: p } of opts) {
      if (worker === prevWorker) continue; // no consecutive
      const c = counts.get(worker) || 0;
      if (c >= maxPerWorker) continue;
      counts.set(worker, c + 1);
      seq.push(worker);
      dfs(pos + 1, counts, worker, points + p, seq);
      seq.pop();
      counts.set(worker, c);
    }
  }

  dfs(0, new Map(), null, 0, []);
  return best;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const text = readFileSync(args.prompt, "utf8");
  const { shifts } = parsePrompt(text);
  if (shifts.length === 0) { console.error("No shifts parsed"); process.exit(1); }
  const best = solve(shifts);
  if (!best) { console.error("No feasible assignment"); process.exit(1); }
  const out = shifts.map((s, i) => `${s.name}:${best.seq[i]}`).join(",");
  console.log(out);
}

main();
