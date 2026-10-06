#!/usr/bin/env node
// solvers/v10-arith-003.mjs — Loan balance with monthly compounding and payments
// that first cover accrued interest, then principal. Simulate month by month,
// payments applied at END of the named month after that month's interest accrues.
//
// ROUNDING (per the prompt's explicit rounding rule, v10 bank repair Oct 2026):
// no intermediate rounding — the balance is carried as an EXACT rational
// (BigInt numerator/denominator) through the whole schedule, and only the final
// balance is rounded half-up to cents. This matches the bank's held value
// (USD 3783.15); monthly half-up rounding would give a different answer.
// Mode-17: FAIL LOUDLY (FATAL on stderr, exit 1) if the prompt does not state
// the exact-arithmetic rounding rule, or if prompt structure mismatches.
// Usage: node v10-arith-003.mjs --prompt <prompt.txt>

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v10-arith-003.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

const FATAL = (msg) => { console.error(`FATAL: ${msg}`); process.exit(1); };
const C = (s) => Math.round(parseFloat(String(s).replace(/,/g, "")) * 100);

// Parse a percent string like "1" or "1.5" into an exact BigInt fraction rn/rd.
function parsePercent(s) {
  const parts = s.split(".");
  const decimals = parts.length > 1 ? parts[1].length : 0;
  const rn = BigInt(parts.join(""));
  const rd = BigInt(100 * 10 ** decimals); // percent -> fraction of 1
  return [rn, rd];
}

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");

  // The solver's arithmetic model is exact-throughout; it must only run when
  // the prompt mandates that convention.
  if (!/do not round (any )?intermediate/i.test(text))
    FATAL("prompt does not state the exact-arithmetic (no intermediate rounding) rule; refusing to guess the rounding convention");

  const mPrin = text.match(/principal\s+\$\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!mPrin) FATAL("could not parse principal");

  // "12% annual interest, compounding monthly (1% per month)"
  const mRate = text.match(/\((\d+(?:\.\d+)?)%\s+per\s+month\)/i);
  if (!mRate) FATAL("could not parse monthly rate");
  const [rn, rd] = parsePercent(mRate[1]);
  const gNum = rd + rn, gDen = rd; // monthly growth factor = (rd+rn)/rd

  // Payments: "$3,000 at the end of month 3"
  const payRe = /\$\s*([\d,]+(?:\.\d{1,2})?)\s+at\s+the\s+end\s+of\s+month\s+(\d+)/gi;
  const payments = {};
  let m;
  while ((m = payRe.exec(text)) !== null) {
    const mo = parseInt(m[2], 10);
    if (payments[mo] !== undefined) FATAL(`duplicate payment for month ${mo}`);
    payments[mo] = BigInt(C(m[1])); // cents
  }
  if (Object.keys(payments).length === 0) FATAL("no payments parsed");

  // "Compute the balance at the end of month 12."
  const mEnd = text.match(/balance\s+at\s+the\s+end\s+of\s+month\s+(\d+)/i);
  if (!mEnd) FATAL("could not parse target month");
  const endMonth = parseInt(mEnd[1], 10);

  if (!/each\s+payment\s+first\s+covers\s+accrued\s+interest/i.test(text))
    FATAL("expected interest-first payment ordering language");

  // Exact rational balance in dollars: num/den (BigInt). Start: P cents / 100.
  // den stays a multiple of 100 (rd is a multiple of 100 for percent rates),
  // so cent-denominated payments subtract exactly.
  let num = BigInt(C(mPrin[1]));
  let den = 100n;
  for (let mo = 1; mo <= endMonth; mo++) {
    num = num * gNum;
    den = den * gDen;
    if (payments[mo] !== undefined) {
      // Interest-first is moot for the balance when payment <= balance; guard anyway.
      if (num * 100n < payments[mo] * den)
        FATAL(`payment exceeds balance in month ${mo}`);
      num = num - (payments[mo] * den) / 100n;
    }
  }

  // Round ONLY the final balance half-up to cents.
  const cents = (2n * num * 100n + den) / (2n * den);
  const sign = cents < 0n ? "-" : "";
  const abs = cents < 0n ? -cents : cents;
  console.log(`USD ${sign}${(abs / 100n).toString()}.${(abs % 100n).toString().padStart(2, "0")}`);
}

main();
