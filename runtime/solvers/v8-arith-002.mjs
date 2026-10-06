#!/usr/bin/env node
// v8-arith-002.mjs — Payroll with county tax (per-task solver).
// All money in integer cents. Half-up rounding on fractional cents.

function roundHalfUp(x) {
  return Math.floor(x + 0.5 + 1e-9);
}

function main() {
  const C = (d) => Math.round(d * 100); // dollars to integer cents

  const base = C(9200.00);
  const overtime = Math.round(C(52.25) * 28); // 5225 * 28 = 146300
  const bonuses = C(2200.00) + C(1100.00);

  const preTax = C(600.00) + C(285.00) + C(155.00) + C(90.00);

  // Federal tax on (base + overtime - preTax), marginal brackets.
  const fedBase = base + overtime - preTax;
  const brackets = [
    [C(1000.00), 0.10], [C(2000.00), 0.12], [C(3000.00), 0.22],
    [C(3000.00), 0.24], [C(4000.00), 0.32], [Number.MAX_SAFE_INTEGER, 0.35],
  ];
  let fedTaxF = 0, remaining = fedBase;
  for (const [width, rate] of brackets) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, width);
    fedTaxF += take * rate;
    remaining -= take;
  }
  const fedTax = roundHalfUp(fedTaxF);

  // Bonuses taxed at flat 22%.
  const bonusTax = roundHalfUp(bonuses * 0.22);

  // State/local/county on (base + overtime + bonuses - preTax).
  const slBase = base + overtime + bonuses - preTax;
  const stateTax = roundHalfUp(slBase * 0.062);
  const localTax = roundHalfUp(slBase * 0.018);
  const countyTax = roundHalfUp(slBase * 0.011);

  // City on (base + overtime) only.
  const cityTax = roundHalfUp((base + overtime) * 0.0125);

  const postTax = C(60) + C(75) + C(160) + C(45) + C(30) + C(20);

  const net = base + overtime + bonuses - preTax - fedTax - bonusTax
    - stateTax - localTax - cityTax - countyTax - postTax;

  console.log(`USD ${(net / 100).toFixed(2)}`);
}

main();
