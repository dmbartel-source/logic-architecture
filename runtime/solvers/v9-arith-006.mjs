#!/usr/bin/env node
// solvers/v9-arith-006.mjs — Balloon loan six rates (v9-arith-006).
// Fixed 30-year amortizing payment at year-1 rate; monthly simulation with
// rate changes, extra principal payments, prepayment penalties, balloon.

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v9-arith-006.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

const r2 = (x) => Math.round(x * 100) / 100;

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");

  const loanM = /A \$([\d,]+) loan has a (\d+)-year balloon \(remaining balance due at month (\d+)\)/.exec(text);
  if (!loanM) { console.error("FATAL: loan terms not parsed"); process.exit(1); }
  const principal0 = parseFloat(loanM[1].replace(/,/g, ""));
  const balloonMonth = parseInt(loanM[3], 10);

  // Annual rates: "year 1: 4.50%; ..."
  const annual = {};
  const rateRe = /year (\d+): ([\d.]+)%/g;
  let m;
  while ((m = rateRe.exec(text)) !== null) annual[+m[1]] = parseFloat(m[2]) / 100;
  if (Object.keys(annual).length === 0) { console.error("FATAL: rates not parsed"); process.exit(1); }

  // Payment: "computed as the 30-year amortizing payment at the year-1 rate (round to cents)"
  const termM = /computed as the (\d+)-year amortizing payment at the year-1 rate/.exec(text);
  if (!termM) { console.error("FATAL: amortizing term not parsed"); process.exit(1); }
  const nPay = parseInt(termM[1], 10) * 12;
  const r1 = annual[1] / 12;
  const payment = r2(principal0 * r1 / (1 - Math.pow(1 + r1, -nPay)));

  // Extras: "months 6,12: $5,000; months 18,24: $8,000; ..."
  const extras = {};
  const exRe = /months ([\d,]+): \$([\d,]+)/g;
  while ((m = exRe.exec(text)) !== null) {
    const amt = parseFloat(m[2].replace(/,/g, ""));
    for (const mo of m[1].split(",")) extras[+mo.trim()] = (extras[+mo.trim()] || 0) + amt;
  }
  if (Object.keys(extras).length === 0) { console.error("FATAL: extras not parsed"); process.exit(1); }

  // Penalty: "A 1% prepayment penalty applies to extra payments made in the first 24 months."
  const penM = /A ([\d.]+)% prepayment penalty applies to extra payments made in the first (\d+) months/.exec(text);
  if (!penM) { console.error("FATAL: penalty not parsed"); process.exit(1); }
  const penRate = parseFloat(penM[1]) / 100, penMonths = parseInt(penM[2], 10);

  let balance = principal0;
  let totalExtras = 0, totalPenalties = 0;
  for (let mo = 1; mo <= balloonMonth; mo++) {
    const year = Math.ceil(mo / 12);
    const mr = (annual[year] ?? annual[Math.max(...Object.keys(annual).map(Number))]) / 12;
    const interest = r2(balance * mr);
    const princ = payment - interest;
    const extra = extras[mo] || 0;
    balance = r2(balance - princ - extra);
    totalExtras += extra;
    if (extra > 0 && mo <= penMonths) totalPenalties = r2(totalPenalties + extra * penRate);
  }
  const balloon = Math.max(0, balance);
  const total = r2(balloonMonth * payment + totalExtras + totalPenalties + balloon);
  console.log(`USD ${total.toFixed(2)}`);
}

main();
