#!/usr/bin/env node
// solvers/v10-sched-004.mjs — 1||max weight of on-time jobs: single machine,
// each job has duration/deadline/weight. Maximize total weight of jobs that
// complete by their deadlines.
// PAL-style: enumerate subsets (2^N); a subset is feasible iff its EDD
// (earliest-deadline-first) schedule has no tardy job (exact for 1||feasibility).
// Mode-17: FAIL LOUDLY (FATAL on stderr, exit 1) on any unparseable input.
// Usage: node v10-sched-004.mjs --prompt <prompt.txt>

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v10-sched-004.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

const FATAL = (msg) => { console.error(`FATAL: ${msg}`); process.exit(1); };

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");

  const jobs = [];
  const re = /(\w+):\s*duration=(\d+),\s*deadline=(\d+),\s*weight=(\d+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    jobs.push({ name: m[1], dur: +m[2], dl: +m[3], w: +m[4] });
  }
  if (jobs.length === 0) FATAL("no jobs parsed");
  if (!/on-time if it completes by its deadline/i.test(text)) FATAL("on-time definition not found");
  if (!/Maximize the total weight of on-time jobs/i.test(text)) FATAL("objective not found");

  const N = jobs.length;
  let best = 0;
  for (let mask = 0; mask < (1 << N); mask++) {
    const sub = jobs.filter((_, i) => mask & (1 << i));
    const edd = [...sub].sort((a, b) => a.dl - b.dl);
    let t = 0, ok = true, wsum = 0;
    for (const j of edd) {
      t += j.dur;
      if (t > j.dl) { ok = false; break; }
      wsum += j.w;
    }
    if (ok && wsum > best) best = wsum;
  }
  console.log(String(best));
}

main();
