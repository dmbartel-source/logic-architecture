#!/usr/bin/env node
// solvers/v9-distract-003.mjs — Seven-status schedule (v9-distract-003).
// Include active + reactivated (deferred) jobs; exclude on-hold/cancelled/
// completed/preempted. Single machine, makespan = sum of durations.
// NOTE: the registered format override for v9-distract-003 is
// "^MAKESPAN:[A-Z0-9]+(,[A-Z0-9]+)*$" — the MAKESPAN: prefix is REQUIRED and
// agrees with the prompt's example ('MAKESPAN:J1,J2,J3').

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v9-distract-003.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");

  // Jobs: "J1: duration=3, status=active"
  const jobs = [];
  const jobRe = /^([A-Za-z0-9]+):\s*duration=(\d+),\s*status=([a-z-]+)/gm;
  let m;
  while ((m = jobRe.exec(text)) !== null) {
    jobs.push({ name: m[1], dur: +m[2], status: m[3] });
  }
  if (jobs.length === 0) { console.error("FATAL: no jobs parsed"); process.exit(1); }

  // Status key: parse the explicit exclude list —
  // "on-hold, cancelled, completed, preempted = exclude."
  // Everything not excluded is included (active schedules now; deferred reactivates).
  const exclude = new Set();
  const excM = /([\w\s,-]+?)\s*=\s*exclude/i.exec(text);
  if (!excM) { console.error("FATAL: status key exclude list not parsed"); process.exit(1); }
  for (const s of excM[1].split(",")) {
    const t = s.trim().toLowerCase();
    if (t) exclude.add(t);
  }

  const included = jobs.filter((j) => !exclude.has(j.status.toLowerCase()));
  if (included.length === 0) { console.error("FATAL: no included jobs"); process.exit(1); }
  const names = included.map((j) => j.name).sort();
  const ms = included.reduce((s, j) => s + j.dur, 0);
  console.log(`${ms}:${names.join(",")}`);
}

main();
