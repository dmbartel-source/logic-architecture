#!/usr/bin/env node
// solvers/v9-elide-002.mjs — Clearance exclusion clause (v9-elide-002).
// v1.8 mode 17 probe: the discount exclusion ("unless they contain clearance
// items") is buried in a subordinate clause. The solver must parse the
// exclusion explicitly and FAIL LOUDLY if it cannot — never drop it silently.

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v9-elide-002.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

const r2 = (x) => Math.round(x * 100) / 100;

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");

  const subM = /subtotal of \$([\d,.]+)/.exec(text);
  if (!subM) { console.error("FATAL: subtotal not parsed"); process.exit(1); }
  const subtotal = parseFloat(subM[1].replace(/,/g, ""));

  // "which includes $200 of clearance items" → the order contains clearance items.
  const clearM = /includes \$([\d,.]+) of clearance items/.exec(text);
  const hasClearance = !!clearM;

  // Policy: "orders over $1000 get 10% off, unless they contain clearance items"
  const polM = /orders over \$([\d,.]+) get (\d+(?:\.\d+)?)% off, unless they contain clearance items/.exec(text);
  if (!polM) {
    console.error("FATAL: discount policy with clearance exclusion not parsed — refusing to guess");
    process.exit(1);
  }
  const threshold = parseFloat(polM[1].replace(/,/g, ""));
  const discPct = parseFloat(polM[2]) / 100;

  const discount = (subtotal > threshold && !hasClearance) ? r2(subtotal * discPct) : 0;

  const taxM = /Sales tax is (\d+(?:\.\d+)?)% on the discounted subtotal/.exec(text);
  if (!taxM) { console.error("FATAL: tax rule not parsed"); process.exit(1); }
  const tax = r2((subtotal - discount) * parseFloat(taxM[1]) / 100);

  const total = r2(subtotal - discount + tax);
  console.log(`USD ${total.toFixed(2)}`);
}

main();
