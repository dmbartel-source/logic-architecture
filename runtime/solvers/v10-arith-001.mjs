#!/usr/bin/env node
// solvers/v10-arith-001.mjs — Tiered commission with cap and highest-tier clawback.
// PAL-style: parse the prompt, build tier structure, waterfall the clawback off the
// highest tier reached, apply cap. All money in integer cents.
// Mode-17: FAIL LOUDLY (FATAL on stderr, exit 1) if the prompt doesn't match the
// expected three-tier structure.
// Usage: node v10-arith-001.mjs --prompt <prompt.txt>

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v10-arith-001.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

const FATAL = (msg) => { console.error(`FATAL: ${msg}`); process.exit(1); };
const C = (s) => Math.round(parseFloat(String(s).replace(/,/g, "")) * 100);

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");

  // Sales amount: "closes $180,000 in sales"
  const mSales = text.match(/\$\s*([\d,]+(?:\.\d{1,2})?)\s+in sales/);
  if (!mSales) FATAL("could not parse sales amount");

  // Tier 1: "5% on the first $50,000"
  const mT1 = text.match(/(\d+(?:\.\d+)?)%\s+on\s+the\s+first\s+\$\s*([\d,]+)/i);
  // Tier 2: "8% on the next $100,000"
  const mT2 = text.match(/(\d+(?:\.\d+)?)%\s+on\s+the\s+next\s+\$\s*([\d,]+)/i);
  // Tier 3: "12% on amounts above $150,000"
  const mT3 = text.match(/(\d+(?:\.\d+)?)%\s+on\s+amounts\s+above\s+\$\s*([\d,]+)/i);
  if (!mT1 || !mT2 || !mT3) FATAL("could not parse all three commission tiers");

  // Cap: "cannot exceed $15,000"
  const mCap = text.match(/cannot\s+exceed\s+\$\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!mCap) FATAL("could not parse commission cap");

  // Clawback: "One $2,000 deal is clawed back" + "clawbacks reduce the highest tier"
  const mClaw = text.match(/\$\s*([\d,]+(?:\.\d{1,2})?)[^.]*clawed back/i);
  if (!mClaw || !/highest\s+tier/i.test(text)) FATAL("could not parse clawback rule");

  const sales = C(mSales[1]);
  const tiers = [
    { rate: parseFloat(mT1[1]), width: C(mT1[2]) },   // on first L1
    { rate: parseFloat(mT2[1]), width: C(mT2[2]) },   // on next L2
    { rate: parseFloat(mT3[1]), width: Infinity },    // on amounts above
  ];
  // Sanity: tier-3 threshold must equal tier1 width + tier2 width.
  if (C(mT3[2]) !== tiers[0].width + tiers[1].width) FATAL("tier boundaries inconsistent");
  const cap = C(mCap[1]);
  const claw = C(mClaw[1]);

  // Allocate sales into tiers.
  let remaining = sales;
  const alloc = tiers.map((t) => {
    const take = Math.min(remaining, t.width);
    remaining -= take;
    return take;
  });

  // Clawback reduces the highest tier reached (waterfall from top).
  let clawLeft = claw;
  for (let i = alloc.length - 1; i >= 0 && clawLeft > 0; i--) {
    const take = Math.min(alloc[i], clawLeft);
    alloc[i] -= take;
    clawLeft -= take;
  }
  if (clawLeft > 0) FATAL("clawback exceeds allocated sales");

  let comm = 0;
  for (let i = 0; i < tiers.length; i++) {
    comm += Math.round(alloc[i] * tiers[i].rate / 100);
  }
  const net = Math.min(comm, cap);
  console.log(`USD ${(net / 100).toFixed(2)}`);
}

main();
