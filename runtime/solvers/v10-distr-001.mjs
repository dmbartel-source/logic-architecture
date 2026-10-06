#!/usr/bin/env node
// solvers/v10-distr-001.mjs — Distractor filtering: background memo is irrelevant.
// Task: parse ONLY the "Order:" line ("4 units at $150 each, 2 units at $75 each")
// and compute sum(qty * price). All money in integer cents.
// Mode-17: FAIL LOUDLY (FATAL on stderr, exit 1) if the Order line or its
// line items are unparseable — fail loud, never silently drop requirements.
// Usage: node v10-distr-001.mjs --prompt <prompt.txt>

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v10-distr-001.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

const FATAL = (msg) => { console.error(`FATAL: ${msg}`); process.exit(1); };
const C = (s) => Math.round(parseFloat(String(s).replace(/,/g, "")) * 100);

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");

  // The order lives on the "Order:" line; the MEMO block above is a distractor.
  const mOrder = /Order:\s*(.+)/.exec(text);
  if (!mOrder) FATAL("no Order: line found");
  const orderLine = mOrder[1];

  // Line items: "4 units at $150 each", "2 units at $75 each".
  const itemRe = /(\d+)\s*units?\s+at\s*\$\s*([\d,]+(?:\.\d{1,2})?)\s*each/gi;
  let m;
  let totalC = 0;
  let count = 0;
  while ((m = itemRe.exec(orderLine)) !== null) {
    totalC += parseInt(m[1], 10) * C(m[2]);
    count++;
  }
  if (count === 0) FATAL("no order line items parsed from Order line");

  console.log(`USD ${(totalC / 100).toFixed(2)}`);
}

main();
