#!/usr/bin/env node
// solvers/v10-distr-002.mjs — Distractor filtering: superseded price history.
// Task: use ONLY the "Current price" line ("Current price (v2): $320"), ignore
// v1 listing, v2 correction history, and the old-email quote; multiply by the
// ordered quantity ("Order: 3 widgets"). All money in integer cents.
// Mode-17: FAIL LOUDLY (FATAL on stderr, exit 1) if the current price or the
// order quantity is unparseable — fail loud, never silently drop requirements.
// Usage: node v10-distr-002.mjs --prompt <prompt.txt>

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v10-distr-002.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

const FATAL = (msg) => { console.error(`FATAL: ${msg}`); process.exit(1); };
const C = (s) => Math.round(parseFloat(String(s).replace(/,/g, "")) * 100);

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");

  // Current price: "Current price (v2): $320" — history lines ("v1 listed ... $300",
  // "old email quotes $280") are distractors and are never parsed as the price.
  const mPrice = /Current price[^:]*:\s*\$\s*([\d,]+(?:\.\d{1,2})?)/i.exec(text);
  if (!mPrice) FATAL("could not parse current price");

  // Order quantity: "Order: 3 widgets".
  const mQty = /Order:\s*(\d+)\s*\w+/i.exec(text);
  if (!mQty) FATAL("could not parse order quantity");

  const totalC = parseInt(mQty[1], 10) * C(mPrice[1]);
  console.log(`USD ${(totalC / 100).toFixed(2)}`);
}

main();
