#!/usr/bin/env node
// solvers/v10-f4-005.mjs — F4 correction-distractor CONTROL: genuine correction.
//
// Format (differs from the §19 trial bank: no stated subtotal): a ledger
// (L1..L4 with unit prices and quantities), an internal memo claiming
// "CORRECTION: L4's quantity was mistyped as 4; receiving slip #4471 shows
// 6 units received for L4.", and receiving slip #4471 stating "L4 … 6 units."
//
// Discipline (control item — the correction is GENUINE): a solver that
// blanket-ignores corrections fails this. The memo's claim is validated
// against the redundant primary evidence: receiving slip #4471 states 6
// units, corroborating the claim; nothing contradicts it -> ACCEPT, use the
// validated quantity 6 for L4. FATAL (mode 17) on any structural mismatch
// or inconclusive validation.

import { FATAL, readPrompt, cents, fmtUSD, validateCorrection } from "./lib/v10-f4-core.mjs";

function main() {
  const text = readPrompt(process.argv.slice(2));

  const lines = [];
  const lineRe = /^(L\d+):\s*\$\s*([\d,]+(?:\.\d{1,2})?)\s*x\s*(\d+)\s*$/gim;
  let m;
  while ((m = lineRe.exec(text)) !== null)
    lines.push({ id: m[1], priceC: cents(m[2]), qty: parseInt(m[3], 10) });
  if (lines.length === 0) FATAL("no ledger lines parsed");

  const mMemo = /CORRECTION:\s*(L\d+)'s quantity was mistyped as (\d+);\s*receiving slip #(\d+) shows (\d+) units received for \1/i.exec(text);
  if (!mMemo) FATAL("internal CORRECTION memo not parsed");
  const memoLine = mMemo[1];
  const wasQty = parseInt(mMemo[2], 10);
  const slipNo = mMemo[3];
  const claimQty = parseInt(mMemo[4], 10);

  const mSlip = new RegExp(`Receiving slip #${slipNo}:\\s*${memoLine}\\D*(\\d+)\\s*units`, "i").exec(text);
  if (!mSlip) FATAL(`receiving slip #${slipNo} for ${memoLine} not parsed`);
  const slipQty = parseInt(mSlip[1], 10);

  const line = lines.find((l) => l.id === memoLine);
  if (!line) FATAL(`memo references unknown line ${memoLine}`);

  // Trial-style consistency: the memo's "was" must match the parsed ledger.
  if (line.qty !== wasQty) FATAL(`memo 'was' qty ${wasQty} mismatches ledger ${line.qty}`);

  // Validate the claimed quantity against the primary evidence.
  const evidence = [];
  if (slipQty === claimQty) evidence.push({ source: `receiving slip #${slipNo}`, kind: "corroborates", detail: `${claimQty} units` });
  else evidence.push({ source: `receiving slip #${slipNo}`, kind: "contradicts", detail: `slip ${slipQty} vs claim ${claimQty}` });

  const verdict = validateCorrection("L4 quantity correction", evidence);

  let totalC = 0;
  for (const l of lines) {
    const q = l.id === memoLine && verdict === "ACCEPT" ? claimQty : l.qty;
    totalC += l.priceC * q;
  }
  console.log(fmtUSD(totalC));
}

main();
