#!/usr/bin/env node
// solvers/v10-mult-002.mjs — Multi-optimum makespan: partition N jobs over M
// identical machines, output ONLY the optimal makespan. Exhaustive assignment.
// Mode-17: FAIL LOUDLY (FATAL on stderr, exit 1) if prompt structure mismatches.
// Usage: node v10-mult-002.mjs --prompt <prompt.txt>

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v10-mult-002.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

const FATAL = (msg) => { console.error(`FATAL: ${msg}`); process.exit(1); };

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");

  // "4 jobs with durations 3, 3, 2, 2 on 2 identical machines."
  const mJobs = text.match(/(\d+)\s+jobs\s+with\s+durations\s+([\d\s,]+)\s+on\s+(\d+)\s+identical\s+machines/i);
  if (!mJobs) FATAL("could not parse jobs/machines");
  const durations = mJobs[2].split(",").map((s) => parseInt(s.trim(), 10));
  if (durations.length !== parseInt(mJobs[1], 10) || durations.some(isNaN))
    FATAL("duration count mismatch");
  const machines = parseInt(mJobs[3], 10);
  if (!/optimal\s+makespan/i.test(text)) FATAL("prompt does not ask for optimal makespan");

  const n = durations.length;
  let best = Infinity;
  const loads = new Array(machines).fill(0);
  function dfs(i) {
    if (i === n) {
      const mk = Math.max(...loads);
      if (mk < best) best = mk;
      return;
    }
    for (let j = 0; j < machines; j++) {
      // Symmetry prune: skip machines with identical current load to an earlier one.
      if (j > 0 && loads[j] === loads[j - 1]) continue;
      loads[j] += durations[i];
      if (Math.max(...loads) < best) dfs(i + 1);
      loads[j] -= durations[i];
    }
  }
  dfs(0);

  console.log(String(best));
}

main();
