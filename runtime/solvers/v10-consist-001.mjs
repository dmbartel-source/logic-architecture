#!/usr/bin/env node
// solvers/v10-consist-001.mjs — Ledger extension check: one extension is
// miscalculated. Find it, correct it, output the true total.
// Format: "L1: $120 x 2 = $240" lines. Output like 'USD 3552.00'.
// Mode-17: FATAL unless every L-line parses and exactly one is wrong.
// Usage: node v10-consist-001.mjs --prompt <prompt.txt>

import { readPrompt, FATAL, diag, moneyToCents, fmtUSD } from "./lib/v10-util.mjs";

function main() {
  const text = readPrompt(process.argv.slice(2));

  const rows = [];
  const re = /^(L\d+):\s*\$([\d,.]+[kK]?)\s*x\s*(\d+)\s*=\s*\$([\d,.]+[kK]?)\s*$/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    rows.push({
      label: m[1],
      unit: moneyToCents(m[2]),
      qty: parseInt(m[3], 10),
      stated: moneyToCents(m[4]),
    });
  }
  if (rows.length === 0) FATAL("no ledger lines parsed");
  const labelCount = (text.match(/^L\d+:/gm) || []).length;
  if (labelCount !== rows.length)
    FATAL(`parsed ${rows.length} ledger lines but found ${labelCount} L-labels (unparseable input)`);

  const bad = rows.filter((r) => r.unit * r.qty !== r.stated);
  if (bad.length !== 1)
    FATAL(`expected exactly 1 miscalculated extension, found ${bad.length}`);

  const total = rows.reduce((s, r) => s + r.unit * r.qty, 0);
  diag(
    `bad line ${bad[0].label}: stated ${fmtUSD(bad[0].stated)}, ` +
    `true ${fmtUSD(bad[0].unit * bad[0].qty)}; corrected total ${fmtUSD(total)}`
  );
  console.log(fmtUSD(total));
}

main();
