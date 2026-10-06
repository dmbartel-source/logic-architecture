#!/usr/bin/env node
// solvers/v9-arith-001.mjs — Eight-category invoice (v9-arith-001).
// PAL-style: parse invoice lines AND rate tables from the prompt, apply category
// discounts, conditional bonuses, tiered rebate, rush fee, and per-line taxes.
// All rounding: Math.round to cents at each stated step.
//
// KA5/KA6 fix: the DISCOUNT/BONUS/TAX tables are parsed from the prompt, not
// hardcoded as code constants. If a category with active lines lacks a rate in
// the prompt, FATAL (the environment mutation must be visible to the solver).
// Qty regex widened to (-?\d+) + assertNonNegative so negative quantities fail
// loudly instead of being silently dropped.

import { readFileSync } from "node:fs";
import { assertNonNegative } from "./validate-input.mjs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v9-arith-001.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

function fatal(msg) { console.error(`FATAL: ${msg}`); process.exit(1); }

const REBATE_TIERS = [[3000, 12], [2500, 10], [2000, 8], [1600, 6], [1200, 4], [800, 3], [400, 2]];

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");

  // Lines: "H1: goods, $120.00 x 2 [active]"
  // KA5 fix: qty widened to (-?\d+) so negative quantities are parsed, not dropped.
  const lines = [];
  const lineRe = /^(\w+):\s*(\w+),\s*\$([\d.]+)\s*x\s*(-?\d+)\s*\[(active|voided)\]/gm;
  let m;
  while ((m = lineRe.exec(text)) !== null) {
    if (m[5] !== "active") continue;
    const priceCents = Math.round(parseFloat(m[3]) * 100);
    const qty = parseInt(m[4], 10);
    lines.push({ code: m[1], cat: m[2], cents: priceCents * qty, qty });
  }
  if (lines.length === 0) { console.error("No active invoice lines parsed"); process.exit(1); }

  // KA5 fix: negative quantities must fail loudly, not silently drop the line.
  assertNonNegative(lines.map((l) => l.qty), "quantity");

  // KA6 fix: parse the discount table from the prompt (step 2).
  // Format: "goods 12% off, services 8% off, ..."
  const DISCOUNT = {};
  for (const dm of text.matchAll(/(\w+) (\d+)% off/g)) {
    DISCOUNT[dm[1]] = parseInt(dm[2], 10);
  }

  // KA6 fix: parse the bonus table from the prompt (step 3).
  // Format: "if goods subtotal >= $700, extra 2% off each goods line; ..."
  const BONUS = {};
  for (const bm of text.matchAll(/if (\w+) subtotal >= \$([\d.]+), extra (\d+)% off each \w+ line/g)) {
    BONUS[bm[1]] = { thr: parseFloat(bm[2]), pct: parseInt(bm[3], 10) };
  }

  // KA6 fix: parse the tax table from the prompt (step 6).
  // Format: "Tax per line (on post-bonus line amounts): goods 7%, services 9%, ..."
  const TAX = {};
  const taxSection = /Tax per line[^:]*:([^\n]+)/.exec(text);
  if (taxSection) {
    for (const tm of taxSection[1].matchAll(/(\w+) (\d+)%/g)) {
      TAX[tm[1]] = parseInt(tm[2], 10);
    }
  }

  // KA6 fix: every category with active lines must have a discount rate.
  // If the prompt's rate table is missing a category, the environment mutation
  // is invisible to a hardcoded table — FATAL instead.
  const activeCats = new Set(lines.map((l) => l.cat));
  for (const c of activeCats) {
    if (DISCOUNT[c] === undefined) fatal(`category '${c}' has active lines but no discount rate in the prompt`);
    if (TAX[c] === undefined) fatal(`category '${c}' has active lines but no tax rate in the prompt`);
  }

  // Step 2: category discount per line, round to cents.
  for (const l of lines) {
    const d = DISCOUNT[l.cat];
    l.cents = Math.round(l.cents * (100 - d) / 100);
  }

  // Step 3: conditional bonuses on post-discount category subtotals.
  const sub = {};
  for (const l of lines) sub[l.cat] = (sub[l.cat] || 0) + l.cents;
  for (const [cat, b] of Object.entries(BONUS)) {
    if ((sub[cat] || 0) >= b.thr * 100) {
      for (const l of lines) if (l.cat === cat) l.cents = Math.round(l.cents * (100 - b.pct) / 100);
    }
  }

  // Step 4: subtotal, tiered rebate.
  const subtotal = lines.reduce((a, l) => a + l.cents, 0);
  let rebatePct = 0;
  for (const [thr, pct] of REBATE_TIERS) { if (subtotal >= thr * 100) { rebatePct = pct; break; } }
  const rebate = Math.round(subtotal * rebatePct / 100);

  // Step 5: rush fee 5% on (subtotal - rebate).
  const rush = Math.round((subtotal - rebate) * 5 / 100);

  // Step 6: per-line tax on post-bonus amounts, round each, sum.
  let taxSum = 0;
  for (const l of lines) {
    const t = TAX[l.cat];
    taxSum += Math.round(l.cents * t / 100);
  }

  const total = subtotal - rebate + rush + taxSum;
  console.log(`USD ${(total / 100).toFixed(2)}`);
}

main();
