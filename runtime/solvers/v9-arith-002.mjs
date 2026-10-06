#!/usr/bin/env node
// solvers/v9-arith-002.mjs — Payroll eight brackets (v9-arith-002).
// Parses gross pay, marginal brackets, 401(k), state and county taxes.

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v9-arith-002.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

const r2 = (x) => Math.round(x * 100) / 100;

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");

  const grossM = /gross pay of \$([\d,]+)/.exec(text);
  if (!grossM) { console.error("FATAL: gross pay not parsed"); process.exit(1); }
  const gross = parseFloat(grossM[1].replace(/,/g, ""));

  // Brackets: "10% on first $11,000; 12% on next $33,725; ...; 37% above."
  const brackets = [];
  const brRe = /(\d+(?:\.\d+)?)% on (first|next) \$([\d,]+)/g;
  let m;
  while ((m = brRe.exec(text)) !== null) {
    brackets.push({ rate: parseFloat(m[1]) / 100, width: parseFloat(m[3].replace(/,/g, "")) });
  }
  const topRe = /(\d+(?:\.\d+)?)% above/.exec(text);
  if (brackets.length === 0 || !topRe) { console.error("FATAL: brackets not parsed"); process.exit(1); }
  const topRate = parseFloat(topRe[1]) / 100;

  // Federal tax on gross (taxable income = gross; 401k reduction applied at marginal rate).
  let fed = 0, rem = gross;
  for (const b of brackets) {
    const take = Math.min(rem, b.width);
    fed += r2(take * b.rate);
    rem -= take;
    if (rem <= 0) break;
  }
  if (rem > 0) fed += r2(rem * topRate);

  // 401(k): "6% of gross, pre-tax ... apply the reduction at the employee's marginal rate (24%)"
  const k401M = /401\(k\) contribution is (\d+(?:\.\d+)?)% of gross/.exec(text);
  const margM = /marginal rate \((\d+(?:\.\d+)?)%\)/.exec(text);
  if (!k401M || !margM) { console.error("FATAL: 401k params not parsed"); process.exit(1); }
  const k401 = r2(gross * parseFloat(k401M[1]) / 100);
  fed -= r2(k401 * parseFloat(margM[1]) / 100);

  // State: "flat 4.25% on (gross - $5,000)"
  const stM = /State tax: flat (\d+(?:\.\d+)?)% on \(gross - \$([\d,]+)\)/.exec(text);
  if (!stM) { console.error("FATAL: state tax not parsed"); process.exit(1); }
  const state = r2((gross - parseFloat(stM[2].replace(/,/g, ""))) * parseFloat(stM[1]) / 100);

  // County A: "1.2% on the first $100,000 of gross"; B: "0.8% on gross above $100,000"
  const caM = /County tax A: (\d+(?:\.\d+)?)% on the first \$([\d,]+) of gross/.exec(text);
  const cbM = /County tax B: (\d+(?:\.\d+)?)% on gross above \$([\d,]+)/.exec(text);
  if (!caM || !cbM) { console.error("FATAL: county taxes not parsed"); process.exit(1); }
  const capA = parseFloat(caM[2].replace(/,/g, ""));
  const countyA = r2(Math.min(gross, capA) * parseFloat(caM[1]) / 100);
  const countyB = r2(Math.max(0, gross - parseFloat(cbM[2].replace(/,/g, ""))) * parseFloat(cbM[1]) / 100);

  const net = r2(gross - fed - state - countyA - countyB - k401);
  console.log(`USD ${net.toFixed(2)}`);
}

main();
