#!/usr/bin/env node
// solvers/v10-distr-003.mjs — Distractor filtering: an explicitly-wrong total.
// Task: recompute from the invoice line ("12 boxes at $25/box"), ignoring the
// handwritten note's wrong total ("total $280") which the prompt flags as wrong.
// All money in integer cents.
// Mode-17: FAIL LOUDLY (FATAL on stderr, exit 1) if the invoice line's
// quantity/unit price is unparseable — fail loud, never silently drop
// requirements.
// Usage: node v10-distr-003.mjs --prompt <prompt.txt>

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v10-distr-003.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

const FATAL = (msg) => { console.error(`FATAL: ${msg}`); process.exit(1); };
const C = (s) => Math.round(parseFloat(String(s).replace(/,/g, "")) * 100);

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");

  // Invoice line: "12 boxes at $25/box". The note's wrong total is never parsed
  // as an input — the prompt says the note is wrong and to recompute.
  const mLine = /Invoice line:\s*(\d+)\s*\w+\s+at\s*\$\s*([\d,]+(?:\.\d{1,2})?)\s*\/\s*box/i.exec(text);
  if (!mLine) FATAL("could not parse invoice line (quantity/boxes @ $/box)");

  const totalC = parseInt(mLine[1], 10) * C(mLine[2]);
  console.log(`USD ${(totalC / 100).toFixed(2)}`);
}

main();
