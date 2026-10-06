#!/usr/bin/env node
// v8-arith-003.mjs — Expense report (per-task solver).
// Currency conversion, per-line caps, per-day combined cap, deductible/fees.
// All money in integer cents, half-up rounding.

function roundHalfUp(x) {
  return Math.floor(x + 0.5 + 1e-9);
}

function main() {
  const C = (d) => Math.round(d * 100);

  const rates = { EUR: 1.08, GBP: 1.27, JPY: 0.0067, CAD: 0.74, CHF: 1.12, AUD: 0.66, NZD: 0.61, USD: 1.0 };

  // Lines: [currency, amount, category, lodgingCap|null, day, reimbursable]
  // Parsed from the prompt (amounts in original currency units).
  const lines = [
    ["USD", 842.00, "airfare", null, 1, true],
    ["EUR", 495.00, "lodging", 180.00, 1, true],
    ["GBP", 48.50, "meal", null, 1, true],
    ["JPY", 8400, "ground", null, 1, true],
    ["EUR", 32.00, "meal", null, 1, true],
    ["NZD", 120.00, "meal", null, 1, true],
    ["GBP", 280.00, "lodging", 200.00, 2, true],
    ["CAD", 150.00, "lodging", 160.00, 2, true],
    ["EUR", 89.00, "ground", null, 2, true],
    ["USD", 24.50, "meal", null, 2, true],
    ["JPY", 12000, "meal", null, 2, false], // non-reimbursable
    ["CHF", 210.00, "lodging", 190.00, 3, true],
    ["CHF", 45.00, "ground", null, 3, true],
    ["AUD", 320.00, "lodging", 170.00, 3, true],
    ["AUD", 95.00, "meal", null, 3, true],
    ["NZD", 85.00, "ground", null, 3, true],
  ];

  // Convert each line to USD cents, round half-up.
  const converted = [];
  for (const [cur, amt, cat, cap, day, ok] of lines) {
    if (!ok) continue;
    const usdCents = roundHalfUp(amt * rates[cur] * 100);
    converted.push({ cat, cap: cap ? C(cap) : null, day, usdCents });
  }

  // Per-line caps.
  for (const l of converted) {
    if (l.cat === "lodging" && l.cap !== null) {
      l.usdCents = Math.min(l.usdCents, l.cap);
    } else if (l.cat === "meal") {
      l.usdCents = Math.min(l.usdCents, C(60.00));
    } else if (l.cat === "ground") {
      l.usdCents = Math.min(l.usdCents, C(75.00));
    }
  }

  // Per-day combined cap: meals + ground <= $110 per day, process in order,
  // cutting off the last meal/ground line to fit.
  const byDay = new Map();
  for (const l of converted) {
    if (!byDay.has(l.day)) byDay.set(l.day, []);
    byDay.get(l.day).push(l);
  }
  const DAY_CAP = C(110.00);
  for (const [day, dayLines] of byDay) {
    const mg = dayLines.filter((l) => l.cat === "meal" || l.cat === "ground");
    let total = mg.reduce((s, l) => s + l.usdCents, 0);
    if (total > DAY_CAP) {
      // Cut off from the last meal/ground line backwards.
      let over = total - DAY_CAP;
      for (let i = mg.length - 1; i >= 0 && over > 0; i--) {
        const cut = Math.min(mg[i].usdCents, over);
        mg[i].usdCents -= cut;
        over -= cut;
      }
    }
  }

  let total = converted.reduce((s, l) => s + l.usdCents, 0);
  total -= C(75.00); // deductible
  total -= C(25.00); // copay
  total -= C(50.00); // admin fee
  total -= C(15.00); // processing fee

  console.log(`USD ${(total / 100).toFixed(2)}`);
}

main();
