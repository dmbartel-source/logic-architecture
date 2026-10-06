#!/usr/bin/env node
// solvers/v10-sched-003.mjs — Shift staffing: S shifts, W workers with
// skilled flags and max-shift caps. Each shift needs >= minW workers including
// >= minSkilled skilled. Minimize total worker-shift assignments.
// PAL-style: enumerate per-shift feasible teams (2^W subsets), then the
// product over shifts with a DFS + incumbent prune. Exact.
// Mode-17: FAIL LOUDLY (FATAL on stderr, exit 1) on any unparseable input.
// Usage: node v10-sched-003.mjs --prompt <prompt.txt>

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v10-sched-003.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

const FATAL = (msg) => { console.error(`FATAL: ${msg}`); process.exit(1); };

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");

  const mS = text.match(/(\d+)\s+shifts?,\s*(\d+)\s+workers/i);
  if (!mS) FATAL("could not parse shift/worker counts");
  const S = +mS[1], W = +mS[2];

  const workers = [];
  const re = /(\w+):\s*skilled=(True|False),\s*max_shifts=(\d+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    workers.push({ name: m[1], skilled: m[2] === "True", max: +m[3] });
  }
  if (workers.length !== W) FATAL(`parsed ${workers.length} workers, expected ${W}`);

  const mR = text.match(/at least (\d+) workers including at least (\d+) skilled/i);
  if (!mR) FATAL("could not parse per-shift staffing requirement");
  const minW = +mR[1], minS = +mR[2];
  if (!/Minimize the total number of worker-shift assignments/i.test(text)) FATAL("objective not found");

  // Feasible teams per shift: subsets meeting the staffing requirement.
  const teams = [];
  for (let mask = 1; mask < (1 << W); mask++) {
    const members = [];
    let skilled = 0;
    for (let i = 0; i < W; i++) {
      if (mask & (1 << i)) { members.push(i); if (workers[i].skilled) skilled++; }
    }
    if (members.length >= minW && skilled >= minS) teams.push(members);
  }
  if (teams.length === 0) FATAL("no feasible shift team");

  let best = Infinity;
  const counts = new Array(W).fill(0);
  const dfs = (shift, total) => {
    if (total >= best) return; // prune
    if (shift === S) { best = total; return; }
    for (const team of teams) {
      let ok = true;
      for (const i of team) if (counts[i] + 1 > workers[i].max) { ok = false; break; }
      if (!ok) continue;
      for (const i of team) counts[i]++;
      dfs(shift + 1, total + team.length);
      for (const i of team) counts[i]--;
    }
  };
  dfs(0, 0);
  if (!Number.isFinite(best)) FATAL("no feasible staffing plan");
  console.log(String(best));
}

main();
