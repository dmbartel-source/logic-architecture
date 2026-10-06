#!/usr/bin/env node
// solvers/v10-sched-001.mjs — P|r_j|Cmax: N jobs with release dates on M
// identical machines, minimize makespan.
// PAL-style: enumerate machine assignments (M^N); for each machine enumerate
// job orders and simulate earliest-start scheduling (start = max(release,
// previous finish)). Exact by exhaustive search.
// Mode-17: FAIL LOUDLY (FATAL on stderr, exit 1) on any unparseable input.
// Usage: node v10-sched-001.mjs --prompt <prompt.txt>

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v10-sched-001.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

const FATAL = (msg) => { console.error(`FATAL: ${msg}`); process.exit(1); };

function* permutations(arr) {
  if (arr.length === 0) { yield []; return; }
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) yield [arr[i], ...p];
  }
}

function machineMin(jobs) {
  // Min over orders of max completion time with release dates.
  let best = Infinity;
  for (const perm of permutations(jobs)) {
    let t = 0;
    for (const j of perm) t = Math.max(t, j.rel) + j.dur;
    if (t < best) best = t;
  }
  return best;
}

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");

  const jobs = [];
  const re = /(\w+):\s*duration=(\d+),\s*release=(\d+)/g;
  let m;
  while ((m = re.exec(text)) !== null) jobs.push({ name: m[1], dur: +m[2], rel: +m[3] });
  if (jobs.length === 0) FATAL("no jobs parsed");
  const mM = text.match(/(\d+)\s+jobs?\s+on\s+(\d+)\s+identical machines/i);
  if (!mM) FATAL("could not parse machine count");
  if (+mM[1] !== jobs.length) FATAL("job count mismatch");
  if (!/minimize the makespan/i.test(text)) FATAL("makespan objective not found");
  const M = +mM[2];
  const N = jobs.length;

  let best = Infinity;
  const total = Math.pow(M, N);
  for (let a = 0; a < total; a++) {
    const onMachine = Array.from({ length: M }, () => []);
    let x = a;
    for (let i = 0; i < N; i++) { onMachine[x % M].push(jobs[i]); x = Math.floor(x / M); }
    let cmax = 0;
    for (let mi = 0; mi < M; mi++) {
      if (onMachine[mi].length === 0) continue;
      const c = machineMin(onMachine[mi]);
      if (c > cmax) cmax = c;
      if (cmax >= best) break; // prune
    }
    if (cmax < best) best = cmax;
  }
  if (!Number.isFinite(best)) FATAL("no feasible assignment");
  console.log(String(best));
}

main();
