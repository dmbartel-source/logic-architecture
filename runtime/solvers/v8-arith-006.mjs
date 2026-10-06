#!/usr/bin/env node
// v8-arith-006.mjs — Loan amortization (per-task solver).
// Varying annual rates, $550/mo payment, extra principal payments.
// All money in integer cents, half-up rounding.

function roundHalfUp(x) {
  return Math.floor(x + 0.5 + 1e-9);
}

function main() {
  const C = (d) => Math.round(d * 100);

  let balance = C(35000.00);
  const regular = C(550.00);
  let totalPaid = 0;
  let month = 0;

  function annualRate(m) {
    if (m <= 12) return 0.065;
    if (m <= 24) return 0.08;
    if (m <= 36) return 0.095;
    return 0.11;
  }

  const extra600 = new Set([6, 12, 18]);
  const extra800 = new Set([24, 30, 36]);

  while (balance > 0) {
    month++;
    const monthlyRate = annualRate(month) / 12;
    const interest = roundHalfUp(balance * monthlyRate);
    const payment = Math.min(regular, balance + interest);
    balance = balance + interest - payment;
    totalPaid += payment;

    // Extra principal payments after the regular payment.
    let extra = 0;
    if (extra600.has(month)) extra = C(600.00);
    else if (extra800.has(month)) extra = C(800.00);
    else if (month === 42) extra = C(1000.00);
    if (extra > 0 && balance > 0) {
      extra = Math.min(extra, balance);
      balance -= extra;
      totalPaid += extra;
    }

    if (month > 600) { console.error("Loan did not terminate"); process.exit(1); }
  }

  const totalInterest = totalPaid - C(35000.00);
  console.log(`USD ${(totalInterest / 100).toFixed(2)}`);
}

main();
