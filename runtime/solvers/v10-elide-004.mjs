#!/usr/bin/env node
// solvers/v10-elide-004.mjs — Elision-probe scheduling: N work days starting on a
// given weekday, skipping holidays (the holiday sentence is the probe — eliding it
// gives the wrong finish day) AND weekends ("work days" = Monday–Friday).
// Walk the 7-day week; holidays and weekends consume no work.
// Mode-17: FAIL LOUDLY (FATAL on stderr, exit 1) if prompt structure mismatches.
// Usage: node v10-elide-004.mjs --prompt <prompt.txt>

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v10-elide-004.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

const FATAL = (msg) => { console.error(`FATAL: ${msg}`); process.exit(1); };

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");

  // "A task needs 5 work days, starting Monday."
  const mNeed = text.match(/needs?\s+(\d+)\s+work\s+days?/i);
  if (!mNeed) FATAL("could not parse required work days");
  const need = parseInt(mNeed[1], 10);

  const mStart = text.match(/starting\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i);
  if (!mStart) FATAL("could not parse start day");
  const startIdx = DAYS.findIndex((d) => d.toLowerCase() === mStart[1].toLowerCase());

  // Holidays: "Wednesday is a holiday" (supports parenthesized forms). The probe.
  const holidays = new Set();
  const holRe = /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+is\s+(?:a\s+)?holiday/gi;
  let m;
  while ((m = holRe.exec(text)) !== null) {
    holidays.add(m[1].toLowerCase());
  }

  let done = 0, idx = startIdx;
  const WEEKEND = new Set(["saturday", "sunday"]);
  for (let guard = 0; guard < 1000 && done < need; guard++) {
    const day = DAYS[idx % 7];
    // "work days": weekends never count; holidays consume no work.
    if (!holidays.has(day.toLowerCase()) && !WEEKEND.has(day.toLowerCase())) done++;
    if (done === need) { console.log(day); return; }
    idx++;
  }
  FATAL("could not schedule required work days");
}

main();
