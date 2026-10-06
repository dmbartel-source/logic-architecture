#!/usr/bin/env node
// solvers/v9-arith-004.mjs — Commission overlapping accelerators (v9-arith-004).
// Marginal tiers + overlapping accelerators + clawbacks with simple interest.

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v9-arith-004.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");
  const num = (s) => parseFloat(s.replace(/,/g, "").replace(/^\$/, ""));

  const salesM = /has \$([\d,]+) in sales/.exec(text);
  if (!salesM) { console.error("FATAL: sales not parsed"); process.exit(1); }
  const sales = num(salesM[1]);

  // Tiers: "3% on first $50k; 4% on next $50k; ...; 10% on next $35k; 11% above $385k."
  const tiers = [];
  const tierRe = /(\d+(?:\.\d+)?)% on (first|next) \$([\d]+)k/g;
  let m;
  while ((m = tierRe.exec(text)) !== null) {
    tiers.push({ rate: parseFloat(m[1]) / 100, width: parseFloat(m[3]) * 1000 });
  }
  const topM = /(\d+(?:\.\d+)?)% above \$([\d,]+)/.exec(text);
  if (tiers.length === 0 || !topM) { console.error("FATAL: tiers not parsed"); process.exit(1); }

  // Exact rational arithmetic in basis points to avoid float error, then round at end.
  // commission = sum(take*rate) + sum(accel) - clawbacks. Work in cents as floats;
  // all inputs are whole dollars and rates are x.x% — products are exact to cents
  // except 1.5% of odd dollars (e.g. 85000*0.015=1275 exact). Use integer cents.
  const C = (dollars) => Math.round(dollars * 100); // dollars may be float; inputs are whole
  let commCents = 0;
  let rem = sales;
  for (const t of tiers) {
    const take = Math.min(rem, t.width);
    commCents += take * t.rate * 100;
    rem -= take;
    if (rem <= 0) break;
  }
  if (rem > 0) commCents += rem * (parseFloat(topM[1]) / 100) * 100;

  // Accelerators OVERLAPPING: "+2% on the full amount over $200,000"
  const accRe = /\+(\d+(?:\.\d+)?)% on the full amount over \$([\d,]+)/g;
  let accCount = 0;
  while ((m = accRe.exec(text)) !== null) {
    accCount++;
    const over = Math.max(0, sales - num(m[2]));
    commCents += over * (parseFloat(m[1]) / 100) * 100;
  }
  if (accCount === 0) { console.error("FATAL: accelerators not parsed"); process.exit(1); }

  // Clawbacks: "$8,000 held 3 months" at "1% simple monthly interest"
  const intM = /(\d+(?:\.\d+)?)% simple monthly interest/.exec(text);
  if (!intM) { console.error("FATAL: clawback interest not parsed"); process.exit(1); }
  const clawRe = /\$([\d,]+) held (\d+) months?/g;
  let clawCount = 0;
  while ((m = clawRe.exec(text)) !== null) {
    clawCount++;
    const principal = num(m[1]), months = parseInt(m[2], 10);
    commCents -= principal * (1 + (parseFloat(intM[1]) / 100) * months) * 100;
  }
  if (clawCount === 0) { console.error("FATAL: clawbacks not parsed"); process.exit(1); }

  const total = Math.round(commCents) / 100;
  console.log(`USD ${total.toFixed(2)}`);
}

main();
