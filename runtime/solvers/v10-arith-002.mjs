#!/usr/bin/env node
// solvers/v10-arith-002.mjs — Subtotal + state tax on subtotal, city tax on
// (subtotal + state tax), conditional rebate if pre-rebate total exceeds threshold.
// All money in integer cents, round half-up at each tax step.
// Mode-17: FAIL LOUDLY (FATAL on stderr, exit 1) if prompt structure mismatches.
// Usage: node v10-arith-002.mjs --prompt <prompt.txt>

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v10-arith-002.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

const FATAL = (msg) => { console.error(`FATAL: ${msg}`); process.exit(1); };
const C = (s) => Math.round(parseFloat(String(s).replace(/,/g, "")) * 100);

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");

  const mSub = text.match(/subtotal\s+of\s+\$\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!mSub) FATAL("could not parse subtotal");

  // "State tax: 6% applied to the subtotal."
  const mState = text.match(/State\s+tax:\s*(\d+(?:\.\d+)?)%\s+applied\s+to\s+the\s+subtotal/i);
  if (!mState) FATAL("could not parse state tax");

  // "City tax: 2% applied to (subtotal + state tax)."
  const mCity = text.match(/City\s+tax:\s*(\d+(?:\.\d+)?)%\s+applied\s+to\s*\(\s*subtotal\s*\+\s*state\s+tax\s*\)/i);
  if (!mCity) FATAL("could not parse city tax");

  // "Rebate: $50 off if the total before rebate exceeds $2,100."
  const mRebate = text.match(/Rebate:\s*\$\s*([\d,]+(?:\.\d{1,2})?)\s+off\s+if\s+the\s+total\s+before\s+rebate\s+exceeds\s+\$\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!mRebate) FATAL("could not parse rebate rule");

  const subtotal = C(mSub[1]);
  const stateTax = Math.round(subtotal * parseFloat(mState[1]) / 100);
  const cityTax = Math.round((subtotal + stateTax) * parseFloat(mCity[1]) / 100);
  let total = subtotal + stateTax + cityTax;
  if (total > C(mRebate[2])) total -= C(mRebate[1]);

  console.log(`USD ${(total / 100).toFixed(2)}`);
}

main();
