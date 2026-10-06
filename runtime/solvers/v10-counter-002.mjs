#!/usr/bin/env node
// solvers/v10-counter-002.mjs — EDF scheduling counterfactual.
// Jobs (name: duration, deadline); base schedule is earliest-deadline-first.
// Counterfactual changes one job's duration (deadline unchanged). Under EDF,
// list the jobs that finish late (completion > deadline), alphabetical,
// like 'A,C', or 'none'.
// Format: "4 jobs on a single machine (name: duration, deadline):" followed by
// "A: 2, 5; B: 3, 8; C: 1, 4; D: 4, 12." / "Counterfactual: B's duration
// doubles to 6 (deadline unchanged)."
// Mode-17: FATAL on any unparseable input.
// Usage: node v10-counter-002.mjs --prompt <prompt.txt>

import { readPrompt, FATAL, diag } from "./lib/v10-util.mjs";

function main() {
  const text = readPrompt(process.argv.slice(2));

  const lines = text.split("\n");
  const hdrIdx = lines.findIndex((l) => /name:\s*duration,\s*deadline/i.test(l));
  if (hdrIdx === -1 || hdrIdx + 1 >= lines.length) FATAL("jobs header/line not found");
  const jobLine = lines[hdrIdx + 1];
  const jobs = [];
  const jre = /([A-Za-z0-9]+):\s*(\d+),\s*(\d+)/g;
  let m;
  while ((m = jre.exec(jobLine)) !== null)
    jobs.push({ name: m[1], dur: parseInt(m[2], 10), dl: parseInt(m[3], 10) });
  if (jobs.length === 0) FATAL("no jobs parsed");
  const stripped = jobLine
    .replace(/([A-Za-z0-9]+):\s*(\d+),\s*(\d+)/g, "")
    .replace(/[;\s.]/g, "");
  if (stripped !== "") FATAL(`unparsed job text: "${stripped}"`);

  const cM = /([A-Za-z0-9]+)'s duration\s+(doubles|halves|becomes|changes)\s+to\s+(\d+)/i.exec(text);
  if (!cM) FATAL("counterfactual duration change not parsed");
  const job = jobs.find((j) => j.name === cM[1]);
  if (!job) FATAL(`counterfactual references unknown job ${cM[1]}`);
  const verb = cM[2].toLowerCase(), newDur = parseInt(cM[3], 10);
  if (verb === "doubles" && newDur !== 2 * job.dur)
    FATAL(`"doubles" inconsistent: ${job.dur} -> ${newDur}`);
  if (verb === "halves" && newDur * 2 !== job.dur)
    FATAL(`"halves" inconsistent: ${job.dur} -> ${newDur}`);
  job.dur = newDur;
  if (!/\(deadline unchanged\)/i.test(text)) FATAL("expected '(deadline unchanged)'");

  if (!/earliest-deadline-first/i.test(text)) FATAL("expected earliest-deadline-first scheduling");

  // EDF: sort by deadline, name as deterministic secondary key.
  const order = [...jobs].sort((a, b) => a.dl - b.dl || (a.name < b.name ? -1 : 1));
  let t = 0;
  const late = [];
  for (const j of order) {
    t += j.dur;
    if (t > j.dl) late.push(j.name);
  }
  late.sort();
  diag(`EDF order ${order.map((j) => j.name).join(",")} (durations ${order.map((j) => j.dur).join(",")}); late: ${late.join(",") || "none"}`);
  console.log(late.length ? late.join(",") : "none");
}

main();
