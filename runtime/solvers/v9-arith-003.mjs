#!/usr/bin/env node
// solvers/v9-arith-003.mjs — Nine-currency expenses (v9-arith-003).
// Convert each expense, cap meals/lodging per day, cap day totals, add fee.

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v9-arith-003.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

const r2 = (x) => Math.round(x * 100) / 100;

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");

  // Rates: "Exchange rates to USD: EUR 1.08, GBP 1.27, ..." — parse ONLY that
  // line; the expense lines below reuse the same "CUR amount" shape and must
  // not be mistaken for rates.
  const ratesLineM = /Exchange rates to USD:\s*([^\n]+)/.exec(text);
  if (!ratesLineM) { console.error("FATAL: exchange-rate line not parsed"); process.exit(1); }
  const rates = { USD: 1 };
  const rateRe = /\b([A-Z]{3}) ([\d.]+)/g;
  let m;
  while ((m = rateRe.exec(ratesLineM[1])) !== null) rates[m[1]] = parseFloat(m[2]);
  if (Object.keys(rates).length < 9) { console.error("FATAL: too few rates parsed"); process.exit(1); }

  // Caps: "cap meals at $150/day and lodging at $400/day", "cap each day's total at $800",
  // "2% processing fee".
  const mealCapM = /cap meals at \$([\d.]+)\/day/.exec(text);
  const lodgCapM = /lodging at \$([\d.]+)\/day/.exec(text);
  const dayCapM = /cap each day's total at \$([\d.]+)/.exec(text);
  const feeM = /(\d+(?:\.\d+)?)% processing fee/.exec(text);
  if (!mealCapM || !lodgCapM || !dayCapM || !feeM) { console.error("FATAL: caps/fee not parsed"); process.exit(1); }

  // Expenses: "Day1: meals EUR 120; lodging EUR 180; ..."
  const days = {};
  const dayRe = /^Day(\d+):\s*(.+)$/gm;
  while ((m = dayRe.exec(text)) !== null) {
    const items = [];
    for (const part of m[2].split(";")) {
      const em = /(\w+) ([A-Z]{3}) ([\d.]+)/.exec(part.trim());
      if (!em) continue;
      items.push({ cat: em[1].toLowerCase(), usd: r2(parseFloat(em[3]) * (rates[em[2]] ?? NaN)) });
      if (Number.isNaN(items[items.length - 1].usd)) { console.error(`FATAL: unknown currency ${em[2]}`); process.exit(1); }
    }
    days[m[1]] = items;
  }
  if (Object.keys(days).length === 0) { console.error("FATAL: no days parsed"); process.exit(1); }

  let total = 0;
  for (const d of Object.keys(days).sort()) {
    let meals = 0, lodging = 0, other = 0;
    for (const it of days[d]) {
      if (it.cat === "meals") meals += it.usd;
      else if (it.cat === "lodging") lodging += it.usd;
      else other += it.usd;
    }
    const dayTotal = Math.min(
      Math.min(meals, parseFloat(mealCapM[1])) + Math.min(lodging, parseFloat(lodgCapM[1])) + other,
      parseFloat(dayCapM[1])
    );
    total += dayTotal;
  }
  total = r2(total * (1 + parseFloat(feeM[1]) / 100));
  console.log(`USD ${total.toFixed(2)}`);
}

main();
