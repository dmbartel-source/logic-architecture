#!/usr/bin/env node
// v8-arith-004.mjs — Sales commission (per-task solver).
// Tiers + overlapping accelerators (per v8 bank repair: accelerators are
// overlapping, not nested). All money in integer cents, half-up rounding.

function roundHalfUp(x) {
  return Math.floor(x + 0.5 + 1e-9);
}

function main() {
  const C = (d) => Math.round(d * 100);

  const sales = C(142000.00);
  const returns = C(8300.00);
  const commissionable = Math.max(0, sales - returns);

  // Tiered commission (marginal brackets).
  const tiers = [
    [C(25000), 0.04], [C(25000), 0.06], [C(25000), 0.09],
    [C(25000), 0.12], [C(25000), 0.15], [C(25000), 0.18],
    [Number.MAX_SAFE_INTEGER, 0.20],
  ];
  let tierComm = 0, rem = commissionable;
  for (const [w, r] of tiers) {
    if (rem <= 0) break;
    const take = Math.min(rem, w);
    tierComm += take * r;
    rem -= take;
  }

  // Accelerators (overlapping): 3% above 100k, 2% above 125k, 1% above 150k.
  let accel = 0;
  if (commissionable > C(100000)) accel += (commissionable - C(100000)) * 0.03;
  if (commissionable > C(125000)) accel += (commissionable - C(125000)) * 0.02;
  if (commissionable > C(150000)) accel += (commissionable - C(150000)) * 0.01;

  const tierTotal = roundHalfUp(tierComm + accel);

  // Team override: 1.5% of first 200k + 2% of rest. Team sales 310k.
  const teamSales = C(310000.00);
  const override = roundHalfUp(
    Math.min(teamSales, C(200000)) * 0.015 +
    Math.max(0, teamSales - C(200000)) * 0.02
  );

  const advance = C(2800.00);
  const clawback = roundHalfUp(
    C(900.00) * 0.50 + C(1300.00) * 0.25 + C(600.00) * 1.00 + C(450.00) * 0.75
  );

  const net = tierTotal + override - advance - clawback;
  console.log(`USD ${(net / 100).toFixed(2)}`);
}

main();
