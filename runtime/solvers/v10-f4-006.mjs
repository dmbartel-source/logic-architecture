#!/usr/bin/env node
// solvers/v10-f4-006.mjs — F4 correction-distractor: genuine but PARTIAL correction.
//
// Format (differs from the §19 trial bank: no stated subtotal): a ledger
// (L1..L4 with unit prices and quantities), an authoritative price list, and
// an internal memo claiming "CORRECTION: L2's unit price is $45 (see price
// list), not $54."
//
// Discipline: the memo is genuine — the price list corroborates $45 — but
// PARTIAL: the price list ALSO shows L4 at $80 vs the ledger's $70, a typo
// the memo does not cover. The trial's jointness finding transfers here:
// validate EVERY ledger line against the primary (authoritative) source,
// not only the memo-covered line. The authoritative price list rules all
// lines. -> ACCEPT the memo's $45 for L2, and also correct L4 to $80 from
// the price list. FATAL (mode 17) on any structural mismatch or if any
// ledger line lacks a price-list entry.

import { FATAL, readPrompt, cents, fmtUSD, validateCorrection } from "./lib/v10-f4-core.mjs";

function main() {
  const text = readPrompt(process.argv.slice(2));

  // Ledger lines carry "x": "L2: $54 x 2".
  const lines = [];
  const lineRe = /^(L\d+):\s*\$\s*([\d,]+(?:\.\d{1,2})?)\s*x\s*(\d+)\s*$/gim;
  let m;
  while ((m = lineRe.exec(text)) !== null)
    lines.push({ id: m[1], priceC: cents(m[2]), qty: parseInt(m[3], 10) });
  if (lines.length === 0) FATAL("no ledger lines parsed");

  // Price list block: "Price list (authoritative):" followed by "L1: $50" lines.
  const plIdx = text.indexOf("Price list (authoritative):");
  if (plIdx < 0) FATAL("authoritative price list header not found");
  const plBlock = text.slice(plIdx);
  const prices = new Map();
  const plRe = /^(L\d+):\s*\$\s*([\d,]+(?:\.\d{1,2})?)\s*$/gim;
  while ((m = plRe.exec(plBlock)) !== null) prices.set(m[1], cents(m[2]));
  if (prices.size === 0) FATAL("no price list entries parsed");

  const mMemo = /CORRECTION:\s*(L\d+)'s unit price is \$([\d,]+(?:\.\d{1,2})?)\s*\(see price list\),\s*not \$([\d,]+(?:\.\d{1,2})?)/i.exec(text);
  if (!mMemo) FATAL("internal CORRECTION memo not parsed");
  const memoLine = mMemo[1];
  const claimC = cents(mMemo[2]);
  const wasC = cents(mMemo[3]);

  const line = lines.find((l) => l.id === memoLine);
  if (!line) FATAL(`memo references unknown line ${memoLine}`);
  if (!prices.has(memoLine)) FATAL(`memo line ${memoLine} missing from price list`);

  // Trial-style consistency: the memo's "was" must match the parsed ledger.
  if (line.priceC !== wasC) FATAL(`memo 'was' price mismatches ledger (${wasC / 100} vs ${line.priceC / 100})`);

  // Validate the memo's claim against the authoritative price list.
  const evidence = [];
  if (prices.get(memoLine) === claimC) evidence.push({ source: "authoritative price list", kind: "corroborates", detail: `${claimC / 100}` });
  else evidence.push({ source: "authoritative price list", kind: "contradicts", detail: `list ${prices.get(memoLine) / 100} vs claim ${claimC / 100}` });

  const verdict = validateCorrection("L2 unit price correction", evidence);
  if (verdict !== "ACCEPT") FATAL("genuine correction rejected — evidence state unexpected");

  // Joint validation: the primary price list rules ALL ledger lines, not
  // just the memo-covered one. Fail loud on any uncovered line.
  let totalC = 0;
  for (const l of lines) {
    if (!prices.has(l.id)) FATAL(`ledger line ${l.id} has no price-list entry — refusing to guess`);
    totalC += prices.get(l.id) * l.qty;
  }
  console.log(fmtUSD(totalC));
}

main();
