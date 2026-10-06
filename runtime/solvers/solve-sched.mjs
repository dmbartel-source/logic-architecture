#!/usr/bin/env node
// solve-sched.mjs — Scheduling solver (Phase 3).
// PAL-style: parse the prompt, run deterministic branch-and-bound, print answer.
//
// Usage: node solve-sched.mjs --prompt <prompt.txt>
//   Prints the schedule like 'A@0-4@M1,B@3-7@M2,...' ordered by start then name.
//
// Handles v8 scheduling makespan variants:
//   - Multi-machine with eligibility: "Six machines M1-M6. Jobs (duration, eligible machines, release): A(4,['M1','M2'],0), ..."
//   - Single machine: "Single machine. Jobs (duration, release): A(3,0), ..."
//   - With job caps: "Four machines M1-M4 with job caps: M1 at most 3 jobs, ..."
//   - With deadlines: "Jobs (duration, release, deadline): A(4,0,9), ..."
//   - With maintenance: "Maintenance: M2 during [5,8); ..." (no job may overlap)
//   Precedence: "A<D, B<F, ..." (X<Y means X finishes before Y starts)
//   Objective: minimize makespan.
//   Tie-break: lexicographically smallest (start, name) sequence, then machine sequence.

import { readFileSync } from "node:fs";
import { assertInterval } from "./validate-input.mjs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node solve-sched.mjs --prompt <prompt.txt>"); process.exit(2); }
  return args;
}

function parsePrompt(text) {
  const jobs = new Map(); // name -> {dur, eligible[], release, deadline}
  let machines = [];
  let singleMachine = false;

  // Machine list: "Six machines M1-M6." or "Four machines M1-M4 with job caps: ..."
  // or "Three machines M1-M3." or "Single machine."
  if (/Single machine\./i.test(text)) {
    singleMachine = true;
    machines = ["M1"];
  } else {
    const mRe = /(\w+) machines? (M\d+(?:-M\d+)?)/i;
    const mm = mRe.exec(text);
    if (mm) {
      const range = mm[2];
      const rm = /M(\d+)-M(\d+)/.exec(range);
      if (rm) {
        for (let i = +rm[1]; i <= +rm[2]; i++) machines.push(`M${i}`);
      } else {
        machines = [range];
      }
    }
  }

  // Job caps: "M1 at most 3 jobs"
  const jobCaps = {};
  const capRe = /\b(M\d+) at most (\d+) jobs?/gi;
  let m;
  while ((m = capRe.exec(text)) !== null) jobCaps[m[1]] = +m[2];

  // Maintenance: "M2 during [5,8)"
  const maintenance = []; // {machine, start, end}
  const maintRe = /\b(M\d+) during \[(\d+),(\d+)\)/g;
  while ((m = maintRe.exec(text)) !== null) {
    maintenance.push({ machine: m[1], start: +m[2], end: +m[3] });
  }
  // E6-7: domain invariant — maintenance windows require start < end (T11).
  // An inverted window is silently inert, not "no maintenance".
  for (const w of maintenance) assertInterval(w.start, w.end, `maintenance window on ${w.machine}`);

  // Jobs with eligibility: "A(4,['M1', 'M2'],0)"
  const jobReElig = /([A-Z]+)\((\d+),\s*\[([^\]]*)\],\s*(\d+)(?:,\s*(\d+))?\)/g;
  while ((m = jobReElig.exec(text)) !== null) {
    const elig = m[3].split(",").map((s) => s.trim().replace(/['"]/g, "")).filter(Boolean);
    jobs.set(m[1], {
      dur: +m[2], eligible: elig.length ? elig : [...machines],
      release: +m[4], deadline: m[5] !== undefined ? +m[5] : Infinity,
    });
  }
  // Jobs with status: "A(3,M1,M2,0,active)" — Phase 5 (distractor tasks).
  // Statuses: active (include); completed, preempted, cancelled, on-hold, deferred (exclude).
  if (jobs.size === 0) {
    const jobReStatus = /([A-Z]+)\((\d+),((?:M\d+,?)+),(\d+),([a-z-]+)\)/g;
    let found = false;
    while ((m = jobReStatus.exec(text)) !== null) {
      found = true;
      const status = m[5].toLowerCase();
      if (status !== "active") continue; // exclude non-active
      const elig = m[3].split(",").map((s) => s.trim()).filter(Boolean);
      jobs.set(m[1], {
        dur: +m[2], eligible: elig.length ? elig : [...machines],
        release: +m[4], deadline: Infinity,
      });
    }
    if (found) {
      // Precedence may reference excluded jobs; filter them out below.
    }
  }
  // Jobs without eligibility: "A(3,0)" or "A(4,0,9)" (duration, release[, deadline])
  // Only parse if no eligibility-style jobs were found.
  if (jobs.size === 0) {
    const jobReSimple = /([A-Z]+)\((\d+),\s*(\d+)(?:,\s*(\d+))?\)/g;
    while ((m = jobReSimple.exec(text)) !== null) {
      // Avoid matching the eligibility form (already handled).
      jobs.set(m[1], {
        dur: +m[2], eligible: [...machines],
        release: +m[3], deadline: m[4] !== undefined ? +m[4] : Infinity,
      });
    }
  }

  // Precedence: "A<D" pairs. The text says "Precedence (X<Y means X finishes before Y starts): A<D, B<F, ..."
  const prec = [];
  const precSection = /Precedence[^:]*:\s*([^\.]+)/i.exec(text);
  if (precSection) {
    const pairRe = /([A-Z]+)<([A-Z]+)/g;
    while ((m = pairRe.exec(precSection[1])) !== null) {
      // Phase 5: skip pairs referencing excluded (non-active) jobs.
      if (!jobs.has(m[1]) || !jobs.has(m[2])) continue;
      prec.push([m[1], m[2]]);
    }
  }

  // Objective: "minimize makespan" or "Minimize the maximum lateness"
  let objective = "makespan";
  if (/minimize the maximum lateness/i.test(text)) objective = "max_lateness";

  return { jobs, machines, jobCaps, maintenance, prec, singleMachine, objective };
}

function solve(prob) {
  const { jobs, machines, jobCaps, maintenance, prec, objective } = prob;
  const jobNames = [...jobs.keys()];

  // Predecessors map.
  const preds = new Map(jobNames.map((j) => [j, new Set()]));
  const succs = new Map(jobNames.map((j) => [j, new Set()]));
  for (const [a, b] of prec) {
    if (preds.has(a) && preds.has(b)) {
      preds.get(b).add(a);
      succs.get(a).add(b);
    }
  }

  // Machine availability: list of busy intervals per machine.
  // Maintenance windows are pre-blocked.

  let best = null; // {makespan, schedule: Map(name -> {start, end, machine})}
  let nodes = 0;

  // Check if [s, e) on machine overlaps maintenance or is otherwise blocked.
  function machineFree(machine, s, e, busy) {
    for (const mt of maintenance) {
      if (mt.machine === machine && s < mt.end && e > mt.start) return false;
    }
    for (const [bs, be] of busy.get(machine) || []) {
      if (s < be && e > bs) return false;
    }
    return true;
  }

  // Find earliest start >= earliest such that [s, s+dur) is free on machine.
  function earliestStart(machine, earliest, dur, busy) {
    let s = earliest;
    // Simple: advance past conflicts. Since durations are integers and
    // release times are integers, integer start times suffice.
    for (let iter = 0; iter < 1000; iter++) {
      const e = s + dur;
      if (machineFree(machine, s, e, busy)) return s;
      // Find the next candidate: 1 past the end of the earliest overlapping interval.
      let next = s + 1;
      for (const mt of maintenance) {
        if (mt.machine === machine && s < mt.end && e > mt.start) {
          next = Math.max(next, mt.end);
        }
      }
      for (const [bs, be] of busy.get(machine) || []) {
        if (s < be && e > bs) next = Math.max(next, be);
      }
      if (next <= s) next = s + 1; // safety
      s = next;
    }
    return Infinity; // shouldn't happen
  }

  function scheduleKey(sched) {
    // (start, name, machine) triples ordered by start then name.
    // For two-stage tie-break: stage 1 compares (start,name) pairs;
    // stage 2 (only if stage 1 ties) compares machine sequence.
    const pairs = [...sched.entries()].map(([name, s]) => [s.start, name, s.machine]);
    pairs.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1));
    return pairs;
  }

  function isBetter(sched, objVal) {
    if (!best) return true;
    if (objVal !== best.objVal) return objVal < best.objVal;
    const a = scheduleKey(sched);
    const b = scheduleKey(best.schedule);
    // Stage 1: lexicographically smallest (start, name) sequence.
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (i >= a.length) return true;
      if (i >= b.length) return false;
      if (a[i][0] !== b[i][0]) return a[i][0] < b[i][0];
      if (a[i][1] !== b[i][1]) return a[i][1] < b[i][1];
      // NOTE: do NOT compare machines here — that's stage 2.
    }
    // Stage 2: lexicographically smallest machine sequence (same order).
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (i >= a.length) return true;
      if (i >= b.length) return false;
      if (a[i][2] !== b[i][2]) return a[i][2] < b[i][2];
    }
    return false;
  }

  // Machine job counts for caps.
  // objVal: makespan OR max lateness, depending on objective.
  function dfs(scheduled, busy, machineCounts, objVal) {
    nodes++;
    if (scheduled.size === jobNames.length) {
      if (isBetter(scheduled, objVal)) {
        best = { objVal, schedule: new Map(scheduled) };
      }
      return;
    }
    // Prune on objective (strictly worse only, to preserve tie-break exploration).
    if (best && objVal > best.objVal) return;

    // Find schedulable jobs (all preds scheduled).
    const ready = jobNames.filter((j) =>
      !scheduled.has(j) && [...preds.get(j)].every((p) => scheduled.has(p)));
    // Order for determinism (does not affect correctness).
    ready.sort();

    for (const job of ready) {
      const jb = jobs.get(job);
      // Earliest start from predecessors and release.
      let earliest = jb.release;
      for (const p of preds.get(job)) {
        earliest = Math.max(earliest, scheduled.get(p).end);
      }
      for (const mc of jb.eligible) {
        // Job cap check.
        if (jobCaps[mc] !== undefined && (machineCounts.get(mc) || 0) >= jobCaps[mc]) continue;
        const s = earliestStart(mc, earliest, jb.dur, busy);
        if (s === Infinity) continue;
        const e = s + jb.dur;
        // For makespan: deadline is a hard constraint. For max_lateness:
        // deadlines are soft (lateness is the objective), so don't filter.
        if (objective === "makespan" && e > jb.deadline) continue;
        const jobLateness = Math.max(0, e - jb.deadline);
        const newObjVal = objective === "makespan"
          ? Math.max(objVal, e)
          : Math.max(objVal, jobLateness);
        // Prune: if newObjVal already exceeds best, skip (tie-break needs equal).
        if (best && newObjVal > best.objVal) continue;

        // Place.
        if (!busy.has(mc)) busy.set(mc, []);
        busy.get(mc).push([s, e]);
        scheduled.set(job, { start: s, end: e, machine: mc });
        machineCounts.set(mc, (machineCounts.get(mc) || 0) + 1);
        dfs(scheduled, busy, machineCounts, newObjVal);
        // Undo.
        busy.get(mc).pop();
        scheduled.delete(job);
        machineCounts.set(mc, machineCounts.get(mc) - 1);
      }
    }
  }

  dfs(new Map(), new Map(), new Map(), 0);
  return { best, nodes };
}

function formatAnswer(best, prob) {
  const pairs = [...best.schedule.entries()].map(([name, s]) => ({
    name, start: s.start, end: s.end, machine: s.machine,
  }));
  pairs.sort((a, b) => a.start - b.start || (a.name < b.name ? -1 : 1));
  // Single-machine tasks omit the machine: 'A@0-4,B@4-7,...'
  // Multi-machine: 'A@0-4@M1,...'
  if (prob.singleMachine) {
    return pairs.map((p) => `${p.name}@${p.start}-${p.end}`).join(",");
  }
  return pairs.map((p) => `${p.name}@${p.start}-${p.end}@${p.machine}`).join(",");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const text = readFileSync(args.prompt, "utf8");
  const prob = parsePrompt(text);
  if (prob.jobs.size === 0) { console.error("No jobs parsed"); process.exit(1); }
  const { best } = solve(prob);
  if (!best) { console.error("No feasible schedule"); process.exit(1); }
  console.log(formatAnswer(best, prob));
}

main();
