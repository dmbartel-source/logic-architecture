#!/usr/bin/env node
// solvers/v9-arith-005.mjs — Late fee prorated tiers (v9-arith-005).
// Daily fee on opening balance (after that day's payment), tiered daily rates.

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v9-arith-005.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");

  const invM = /A \$([\d,]+) invoice is (\d+) days overdue/.exec(text);
  if (!invM) { console.error("FATAL: invoice not parsed"); process.exit(1); }
  const totalDays = parseInt(invM[2], 10);
  let balance = parseFloat(invM[1].replace(/,/g, ""));

  // Tiers: "days 1-30: 0.08%/day; ..."
  const tiers = [];
  const tierRe = /days (\d+)-(\d+): ([\d.]+)%\/day/g;
  let m;
  while ((m = tierRe.exec(text)) !== null) {
    tiers.push({ from: +m[1], to: +m[2], rate: parseFloat(m[3]) / 100 });
  }
  const beyondM = /beyond: ([\d.]+)%\/day/.exec(text);
  if (tiers.length === 0) { console.error("FATAL: tiers not parsed"); process.exit(1); }
  const rateFor = (day) => {
    for (const t of tiers) if (day >= t.from && day <= t.to) return t.rate;
    return beyondM ? parseFloat(beyondM[1]) / 100 : 0;
  };

  // Payments: "day 20: $5,000" applied at start of the day.
  const pays = {};
  const payRe = /day (\d+): \$([\d,]+)/g;
  while ((m = payRe.exec(text)) !== null) {
    pays[+m[1]] = (pays[+m[1]] || 0) + parseFloat(m[2].replace(/,/g, ""));
  }

  let fee = 0;
  for (let day = 1; day <= totalDays; day++) {
    if (pays[day]) balance -= pays[day];
    fee += balance * rateFor(day);
  }
  fee = Math.round(fee * 100) / 100;
  console.log(`USD ${fee.toFixed(2)}`);
}

main();
