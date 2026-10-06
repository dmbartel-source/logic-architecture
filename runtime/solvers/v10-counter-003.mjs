#!/usr/bin/env node
// solvers/v10-counter-003.mjs — Knapsack counterfactual: one item becomes
// unavailable. Output (base optimum value minus counterfactual optimum value)
// like '5'.
// Format: "Knapsack capacity 15. Items: A: value=10, weight=5; ..." /
// "Counterfactual: item C becomes unavailable."
// Method: 0/1 knapsack optimum via branch-and-bound AND via DP — the two
// independent optimizers must agree on both the base and counterfactual
// values, else FATAL. Removing an item cannot raise the optimum, so a
// negative loss is a FATAL bug signal.
// Mode-17: FATAL on any unparseable input.
// Usage: node v10-counter-003.mjs --prompt <prompt.txt>

import { readPrompt, FATAL, diag } from "./lib/v10-util.mjs";

// Primary: branch-and-bound on 0/1 knapsack. Returns optimal VALUE.
function knapsackBB(items, capacity) {
  const order = items.map((_, i) => i).sort((a, b) =>
    items[b].value / items[b].weight - items[a].value / items[a].weight);
  const n = order.length;
  const suf = new Array(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) suf[i] = suf[i + 1] + items[order[i]].value;
  let best = 0;
  (function dfs(pos, w, v) {
    if (w > capacity) return;
    if (v + suf[pos] < best) return;
    if (v > best) best = v;
    if (pos === n) return;
    const it = items[order[pos]];
    if (w + it.weight <= capacity) dfs(pos + 1, w + it.weight, v + it.value);
    dfs(pos + 1, w, v);
  })(0, 0, 0);
  return best;
}

// Independent: DP over capacity.
function knapsackDP(items, capacity) {
  const dp = new Array(capacity + 1).fill(0);
  for (const it of items)
    for (let w = capacity; w >= it.weight; w--)
      if (dp[w - it.weight] + it.value > dp[w]) dp[w] = dp[w - it.weight] + it.value;
  return Math.max(...dp);
}

function main() {
  const text = readPrompt(process.argv.slice(2));

  const capM = /[Kk]napsack capacity (\d+)/.exec(text);
  if (!capM) FATAL("knapsack capacity not parsed");
  const cap = parseInt(capM[1], 10);

  const itemsLineM = /Items:\s*([^\n]+)/i.exec(text);
  if (!itemsLineM) FATAL("items line not found");
  const items = [];
  const ire = /([A-Za-z]+\d*):\s*value=(\d+),\s*weight=(\d+)/g;
  let m;
  while ((m = ire.exec(itemsLineM[1])) !== null)
    items.push({ name: m[1], value: parseInt(m[2], 10), weight: parseInt(m[3], 10) });
  if (items.length === 0) FATAL("no items parsed");
  const stripped = itemsLineM[1]
    .replace(/([A-Za-z]+\d*):\s*value=(\d+),\s*weight=(\d+)/g, "")
    .replace(/[;\s.]/g, "");
  if (stripped !== "") FATAL(`unparsed item text: "${stripped}"`);

  const cM = /item\s+([A-Za-z]+\d*)\s+becomes unavailable/i.exec(text);
  if (!cM) FATAL("counterfactual removal not parsed");
  if (!items.some((x) => x.name === cM[1])) FATAL(`unavailable item ${cM[1]} not in pool`);
  if (!/how much optimal value is lost\s*\(base optimum minus counterfactual optimum\)/i.test(text))
    FATAL("expected 'base optimum minus counterfactual optimum' question");

  const cfItems = items.filter((x) => x.name !== cM[1]);

  const bBB = knapsackBB(items, cap), bDP = knapsackDP(items, cap);
  if (bBB !== bDP) FATAL(`base optimizer mismatch: B&B=${bBB} DP=${bDP}`);
  const cBB = knapsackBB(cfItems, cap), cDP = knapsackDP(cfItems, cap);
  if (cBB !== cDP) FATAL(`counterfactual optimizer mismatch: B&B=${cBB} DP=${cDP}`);

  const lost = bBB - cBB;
  if (lost < 0) FATAL(`negative loss ${lost} — optimizer bug (removal cannot raise optimum)`);

  diag(`base optimum ${bBB}, without ${cM[1]}: ${cBB}, lost ${lost}`);
  console.log(String(lost));
}

main();
