#!/usr/bin/env node
// solvers/v10-elide-001.mjs — Elision-probe cart: a percent-off coupon that applies
// ONLY to regular (non-sale) items. Parse the cart, identify sale items from the
// "already on sale" sentence (anti-elision: the coupon does NOT apply to them),
// apply the coupon to the rest, sum.
// Mode-17: FAIL LOUDLY (FATAL on stderr, exit 1) if prompt structure mismatches.
// Usage: node v10-elide-001.mjs --prompt <prompt.txt>

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v10-elide-001.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

const FATAL = (msg) => { console.error(`FATAL: ${msg}`); process.exit(1); };
const C = (s) => Math.round(parseFloat(String(s).replace(/,/g, "")) * 100);

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");

  // Cart lines: "jacket $100, boots $200, hat $50" (also supports "X: $100").
  const cartRe = /(\w+)\s*:?\s+\$\s*([\d,]+(?:\.\d{1,2})?)/g;
  const cart = [];
  let m;
  while ((m = cartRe.exec(text)) !== null) {
    const name = m[1].toLowerCase();
    if (name === "cart") continue;
    cart.push({ name, cents: C(m[2]) });
  }
  if (cart.length === 0) FATAL("no cart items parsed");

  // Sale items: "The jacket and hat are already on sale" (supports "X, Y and Z").
  const mSale = text.match(/([A-Za-z,\s]+?)\s+are\s+already\s+on\s+sale/i);
  if (!mSale) FATAL("could not parse which items are on sale");
  const saleNames = mSale[1]
    .split(/,|\s+and\s+/i)
    .map((s) => s.trim().toLowerCase().replace(/^(the|a|an)\s+/, ""))
    .filter(Boolean);
  if (saleNames.length === 0) FATAL("no sale item names parsed");

  // Coupon: "20%-off coupon" applying to regular items only.
  const mCoupon = text.match(/(\d+(?:\.\d+)?)%-off\s+coupon/i);
  if (!mCoupon) FATAL("could not parse coupon rate");
  if (!/regular\s+items/i.test(text)) FATAL("missing regular-items-only restriction");
  const couponPct = parseFloat(mCoupon[1]);

  let total = 0;
  for (const item of cart) {
    if (saleNames.includes(item.name)) {
      total += item.cents; // on sale: no coupon
    } else {
      total += Math.round(item.cents * (100 - couponPct) / 100);
    }
  }

  console.log(`USD ${(total / 100).toFixed(2)}`);
}

main();
