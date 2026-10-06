#!/usr/bin/env node
// solvers/v10-counter-001.mjs — Price/discount counterfactual.
// Base: N items with prices and a discount; the stated total is recomputed as
// a parse sanity check. Counterfactual: one item repriced + new discount.
// Output (counterfactual total minus base total) like 'USD 20.00'
// (negative: 'USD -12.34'). All money in integer cents.
// Format: "Base scenario: 3 items priced $100, $200, $150 with a 10% discount.
// Total: $405.00." / "Counterfactual: the $200 item is repriced to $250, and
// the discount increases to 15%."
// Mode-17: FATAL on any unparseable input or base-total mismatch.
// Usage: node v10-counter-001.mjs --prompt <prompt.txt>

import { readPrompt, FATAL, diag, moneyToCents, fmtUSD } from "./lib/v10-util.mjs";

function main() {
  const text = readPrompt(process.argv.slice(2));

  const bM = /(\d+)\s+items priced\s+((?:\$[\d,.]+\s*,?\s*)+?)\s*with a\s+([\d.]+)%\s+discount\.\s*Total:\s*\$([\d,.]+)\./i.exec(text);
  if (!bM) FATAL("base scenario not parsed");
  const prices = [...bM[2].matchAll(/\$([\d,.]+)/g)].map((x) => moneyToCents(x[1]));
  if (prices.length !== parseInt(bM[1], 10))
    FATAL(`stated ${bM[1]} items but parsed ${prices.length} prices`);
  const disc = parseFloat(bM[3]);
  if (!(disc >= 0 && disc <= 100)) FATAL(`implausible base discount ${bM[3]}%`);
  const statedTotal = moneyToCents(bM[4]);
  const baseTotal = Math.round(prices.reduce((s, p) => s + p, 0) * (100 - disc) / 100);
  if (baseTotal !== statedTotal)
    FATAL(`base total recompute ${fmtUSD(baseTotal)} != stated ${fmtUSD(statedTotal)}`);

  const rM = /the\s+\$([\d,.]+)\s+item is repriced to\s+\$([\d,.]+)/i.exec(text);
  if (!rM) FATAL("repricing not parsed");
  const oldP = moneyToCents(rM[1]), newP = moneyToCents(rM[2]);
  const hits = prices.filter((p) => p === oldP).length;
  if (hits === 0) FATAL(`repriced item $${rM[1]} not found among base prices`);
  if (hits > 1) FATAL(`repriced item $${rM[1]} is ambiguous (${hits} matches)`);
  const idx = prices.findIndex((p) => p === oldP);

  const dM = /discount\s+(?:increases|decreases|changes)\s+to\s+([\d.]+)%/i.exec(text);
  if (!dM) FATAL("counterfactual discount not parsed");
  const newDisc = parseFloat(dM[1]);
  if (!(newDisc >= 0 && newDisc <= 100)) FATAL(`implausible counterfactual discount ${dM[1]}%`);

  if (!/by how much does the total change\s*\(counterfactual minus base\)/i.test(text))
    FATAL("expected 'counterfactual minus base' question");

  const cfPrices = [...prices];
  cfPrices[idx] = newP;
  const cfTotal = Math.round(cfPrices.reduce((s, p) => s + p, 0) * (100 - newDisc) / 100);
  const delta = cfTotal - baseTotal;

  diag(`base ${fmtUSD(baseTotal)} -> counterfactual ${fmtUSD(cfTotal)}; delta ${fmtUSD(delta)}`);
  console.log(fmtUSD(delta));
}

main();
