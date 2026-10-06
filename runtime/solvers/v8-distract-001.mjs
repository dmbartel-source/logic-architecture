#!/usr/bin/env node
// v8-distract-001.mjs — Triple-supersede invoice (per-task solver).
// Filters voided/superseded/pending, applies corrections, category discounts, tax.
// All money in integer cents, half-up rounding.

function roundHalfUp(x) {
  return Math.floor(x + 0.5 + 1e-9);
}

function main() {
  const C = (d) => Math.round(d * 100);

  // Lines: [code, category, unitPriceCents, qty, include]
  // H4: corrected to $65.75. H6: final memo $95.00.
  const lines = [
    ["H1", "hardware", C(120.00), 2, true],
    ["H2", "hardware", C(85.50), 1, true],
    ["S1", "services", C(200.00), 1, true],
    ["H3", "hardware", C(40.25), 3, false], // voided
    ["H4", "hardware", C(65.75), 2, true], // corrected price
    ["S2", "services", C(150.00), 1, false], // voided
    ["H5", "hardware", C(32.10), 4, true],
    ["S3", "services", C(95.00), 2, true],
    ["H2R", "hardware", C(85.50), 1, false], // superseded by H2
    ["H2R2", "hardware", C(85.50), 1, false], // superseded chain
    ["D1", "digital", C(29.99), 2, true],
    ["S4", "services", C(120.00), 1, false], // pending
    ["H6", "hardware", C(95.00), 1, true], // final memo price
    ["D2", "digital", C(59.99), 1, true],
    ["H1C", "hardware", C(120.00), 2, false], // superseded by H1
    ["H1C2", "hardware", C(120.00), 2, false], // superseded chain
  ];

  const discounts = { hardware: 0.10, services: 0.05, digital: 0.08 };

  let subtotal = 0;
  for (const [, cat, price, qty, include] of lines) {
    if (!include) continue;
    const lineTotal = price * qty;
    const discounted = roundHalfUp(lineTotal * (1 - discounts[cat]));
    subtotal += discounted;
  }

  // Tax: 8% on discounted subtotal.
  const tax = roundHalfUp(subtotal * 0.08);
  const total = subtotal + tax;

  console.log(`USD ${(total / 100).toFixed(2)}`);
}

main();
