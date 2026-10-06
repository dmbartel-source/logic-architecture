#!/usr/bin/env node
// solvers/v10-consist-002.mjs — Quarterly profit consistency: one quarter's
// profit != revenue - cost. Output the bad quarter like 'Q2'.
// Format: "Q1: rev $500k, cost $300k, profit $200k." + an Annual line.
// The Annual line is sanity-checked (rev/cost sums; annual profit = rev-cost)
// but its profit is NOT required to equal the sum of quarterly profits —
// that mismatch is the planted error's footprint.
// Mode-17: FATAL unless every Q-line parses and exactly one quarter is bad.
// Usage: node v10-consist-002.mjs --prompt <prompt.txt>

import { readPrompt, FATAL, diag, moneyToCents } from "./lib/v10-util.mjs";

function main() {
  const text = readPrompt(process.argv.slice(2));

  const quarters = [];
  const qre = /^(Q\d+):\s*rev\s*\$([\d,.]+[kK]?),\s*cost\s*\$([\d,.]+[kK]?),\s*profit\s*\$([\d,.]+[kK]?)\.?\s*$/gim;
  let m;
  while ((m = qre.exec(text)) !== null) {
    quarters.push({
      q: m[1].toUpperCase(),
      rev: moneyToCents(m[2]),
      cost: moneyToCents(m[3]),
      profit: moneyToCents(m[4]),
    });
  }
  if (quarters.length === 0) FATAL("no quarterly lines parsed");
  const labelCount = (text.match(/^Q\d+:/gim) || []).length;
  if (labelCount !== quarters.length)
    FATAL(`parsed ${quarters.length} quarters but found ${labelCount} Q-labels (unparseable input)`);

  // Annual-line sanity (sums are unaffected by the planted profit error).
  const am = /Annual:\s*rev\s*\$([\d,.]+[kK]?),\s*cost\s*\$([\d,.]+[kK]?),\s*profit\s*\$([\d,.]+[kK]?)\.?/i.exec(text);
  if (!am) FATAL("annual line not parsed");
  const aRev = moneyToCents(am[1]), aCost = moneyToCents(am[2]), aProfit = moneyToCents(am[3]);
  const sRev = quarters.reduce((s, q) => s + q.rev, 0);
  const sCost = quarters.reduce((s, q) => s + q.cost, 0);
  if (sRev !== aRev) FATAL("annual revenue != sum of quarterly revenues");
  if (sCost !== aCost) FATAL("annual cost != sum of quarterly costs");
  if (aProfit !== aRev - aCost) FATAL("annual profit != annual revenue - annual cost");

  const bad = quarters.filter((q) => q.profit !== q.rev - q.cost);
  if (bad.length !== 1)
    FATAL(`expected exactly 1 inconsistent quarter, found ${bad.length}`);

  const b = bad[0];
  diag(`bad quarter ${b.q}: stated profit ${b.profit / 100}, revenue-cost = ${(b.rev - b.cost) / 100}`);
  console.log(b.q);
}

main();
