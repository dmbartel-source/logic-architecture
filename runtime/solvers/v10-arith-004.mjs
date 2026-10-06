#!/usr/bin/env node
// solvers/v10-arith-004.mjs — Multi-currency conversion to USD with a tiered
// conversion fee: feePct1 on the first feeTierCap of USD-equivalent, feePct2 on
// the remainder. Each conversion rounded half-up to cents; fee components too.
// Mode-17: FAIL LOUDLY (FATAL on stderr, exit 1) if prompt structure mismatches.
// Usage: node v10-arith-004.mjs --prompt <prompt.txt>

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v10-arith-004.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

const FATAL = (msg) => { console.error(`FATAL: ${msg}`); process.exit(1); };
const N = (s) => parseFloat(String(s).replace(/,/g, ""));

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");

  // Conversions: "5,000 EUR at 1.08 USD/EUR."
  const convRe = /([\d,]+(?:\.\d{1,2})?)\s+([A-Z]{3})\s+at\s+(\d+(?:\.\d+)?)\s+USD\/[A-Z]{3}/gi;
  const convs = [];
  let m;
  while ((m = convRe.exec(text)) !== null) {
    convs.push({ amount: N(m[1]), rate: parseFloat(m[3]), ccy: m[2] });
  }
  if (convs.length === 0) FATAL("no currency conversions parsed");

  // Fee: "1% on the first $5,000 of USD-equivalent, 0.5% on the remainder."
  const mFee = text.match(/(\d+(?:\.\d+)?)%\s+on\s+the\s+first\s+\$\s*([\d,]+(?:\.\d{1,2})?)\s+of\s+USD-equivalent,\s*(\d+(?:\.\d+)?)%\s+on\s+the\s+remainder/i);
  if (!mFee) FATAL("could not parse tiered fee");
  const feePct1 = parseFloat(mFee[1]) / 100;
  const feeCapC = Math.round(N(mFee[2]) * 100);
  const feePct2 = parseFloat(mFee[3]) / 100;

  let totalC = 0;
  for (const c of convs) {
    totalC += Math.round(c.amount * c.rate * 100);
  }
  const firstC = Math.min(totalC, feeCapC);
  const feeC = Math.round(firstC * feePct1) + Math.round((totalC - firstC) * feePct2);
  const netC = totalC - feeC;

  console.log(`USD ${(netC / 100).toFixed(2)}`);
}

main();
