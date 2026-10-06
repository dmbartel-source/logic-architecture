#!/usr/bin/env node
// solvers/v8-arith-001.mjs — deterministic solver for the invoice task.
// Parses lines, applies discounts/bonuses/rebate/fee/tax in prompt order.
// Prints the total as 'USD X.XX'.
import { readFileSync } from "node:fs";

// The prompt is embedded in the task file; we re-derive lines here for a
// self-contained solver. In production the solver would receive structured input.
const LINES = [
  ["H1","goods",120.00,2,"active"],["H2","goods",85.50,1,"active"],
  ["H3","goods",40.25,3,"voided"],["S1","services",200.00,1,"active"],
  ["F1","freight",150.00,1,"active"],["H4","goods",65.75,2,"active"],
  ["S2","services",150.00,1,"voided"],["H5","goods",32.10,4,"active"],
  ["S3","services",95.00,2,"active"],["F2","freight",80.00,2,"active"],
  ["H6","goods",210.00,1,"active"],["S4","services",75.25,1,"active"],
  ["G1","digital",49.99,3,"active"],["G2","digital",19.99,5,"active"],
  ["P1","spares",88.40,2,"active"],["P2","spares",24.95,5,"active"],
  ["H7","goods",150.00,1,"active"],["S5","services",120.00,1,"active"],
  ["W1","warranty",199.00,1,"active"],["W2","warranty",89.00,2,"active"],
];
const DISC = { goods:0.12, services:0.08, freight:0.05, digital:0.10, spares:0.06, warranty:0.04 };
const TAX  = { goods:0.07, services:0.09, freight:0.00, digital:0.06, spares:0.04, warranty:0.05 };
const r2 = (x) => Math.round(x * 100 + 1e-9) / 100; // half-up to cents

// Step 1: exclude voided.
const active = LINES.filter((l) => l[4] === "active");
// Step 2: category discount per line.
const disc = active.map(([code, cat, price, qty]) => ({
  code, cat, amt: r2(price * qty * (1 - DISC[cat])),
}));
const sub = (cat) => disc.filter((d) => d.cat === cat).reduce((s, d) => s + d.amt, 0);
// Step 3: category bonuses.
for (const d of disc) {
  if (d.cat === "goods" && sub("goods") >= 700) d.amt = r2(d.amt * 0.98);
  if (d.cat === "spares" && sub("spares") >= 250) d.amt = r2(d.amt * 0.97);
  if (d.cat === "warranty" && sub("warranty") >= 300) d.amt = r2(d.amt * 0.95);
}
const merch = disc.reduce((s, d) => s + d.amt, 0);
// Step 4: volume rebate.
const tiers = [[2000,0.10],[1600,0.08],[1200,0.06],[800,0.04],[400,0.02]];
let rebate = 0;
for (const [t, r] of tiers) { if (merch >= t) { rebate = r2(merch * r); break; } }
const postRebate = merch - rebate;
// Step 5: rush fee.
const rush = r2(postRebate * 0.05);
// Step 6: tax per discounted line.
const tax = r2(disc.reduce((s, d) => s + r2(d.amt * TAX[d.cat]), 0));
const total = r2(postRebate + rush + tax);
console.log(`USD ${total.toFixed(2)}`);
