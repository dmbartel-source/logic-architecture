#!/usr/bin/env node
// v8-arith-005.mjs — Late penalty with daily compounding (per-task solver).
// Daily rates by band, partial payments before penalty, 30% cap on penalty.
// All money in integer cents, half-up rounding each day.

function roundHalfUp(x) {
  return Math.floor(x + 0.5 + 1e-9);
}

function main() {
  const C = (d) => Math.round(d * 100);

  const original = C(7500.00);
  const cap = roundHalfUp(original * 0.30);

  // Daily rates by day band (1-indexed).
  function rate(day) {
    if (day <= 25) return 0.0010;
    if (day <= 50) return 0.0015;
    if (day <= 75) return 0.0020;
    if (day <= 100) return 0.0025;
    return 0.0030;
  }

  // Payments: [day, amount] — applied in the morning before that day's penalty.
  const payments = new Map([
    [20, C(1200.00)],
    [45, C(1800.00)],
    [70, C(900.00)],
    [95, C(1500.00)],
  ]);

  let balance = original;
  let cumulativePenalty = 0;

  for (let day = 1; day <= 120; day++) {
    // Morning payment.
    if (payments.has(day)) {
      balance -= payments.get(day);
      if (balance < 0) balance = 0;
    }
    // Daily penalty (unless cap reached).
    if (cumulativePenalty < cap && balance > 0) {
      let penalty = roundHalfUp(balance * rate(day));
      // Don't exceed cap.
      if (cumulativePenalty + penalty > cap) {
        penalty = cap - cumulativePenalty;
      }
      balance += penalty;
      cumulativePenalty += penalty;
    }
  }

  console.log(`USD ${(balance / 100).toFixed(2)}`);
}

main();
