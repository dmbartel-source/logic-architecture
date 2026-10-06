#!/usr/bin/env node
// solvers/v10-sched-002.mjs — 1|prec|sum(w_j C_j): single machine, precedence
// constraints, minimize weighted sum of completion times.
// PAL-style: enumerate all permutations (exact), filter by precedence,
// evaluate sum w*C.
// Mode-17: FAIL LOUDLY (FATAL on stderr, exit 1) on any unparseable input.
// Usage: node v10-sched-002.mjs --prompt <prompt.txt>

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v10-sched-002.mjs --prompt <prompt.txt>"); process.exit(1); }
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

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");

  const jobs = [];
  const re = /(\w+):\s*duration=(\d+),\s*weight=(\d+)/g;
  let m;
  while ((m = re.exec(text)) !== null) jobs.push({ name: m[1], dur: +m[2], w: +m[3] });
  if (jobs.length === 0) FATAL("no jobs parsed");
  if (!/single machine/i.test(text)) FATAL("single-machine setting not found");
  if (!/weighted sum of completion times/i.test(text)) FATAL("objective not found");

  const prec = [];
  const mP = text.match(/Precedence:\s*([^\n]+)/i);
  if (mP) {
    const reP = /(\w+)\s+before\s+(\w+)/g;
    let q;
    while ((q = reP.exec(mP[1])) !== null) prec.push([q[1], q[2]]);
  }
  const names = new Set(jobs.map((j) => j.name));
  for (const [a, b] of prec) {
    if (!names.has(a) || !names.has(b)) FATAL(`precedence on unknown job ${a}/${b}`);
  }

  let best = Infinity, found = false;
  for (const perm of permutations(jobs)) {
    const pos = new Map(perm.map((j, i) => [j.name, i]));
    if (!prec.every(([a, b]) => pos.get(a) < pos.get(b))) continue;
    found = true;
    let t = 0, obj = 0;
    for (const j of perm) { t += j.dur; obj += j.w * t; }
    if (obj < best) best = obj;
  }
  if (!found) FATAL("no precedence-feasible order");
  console.log(String(best));
}

main();
