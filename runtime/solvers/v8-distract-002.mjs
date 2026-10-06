#!/usr/bin/env node
// v8-distract-002.mjs — Quarantined cargo (per-task solver).
// Knapsack with exclusions, mandatory includes, and corrected weight.
// All weights/values are integers.

function main() {
  // Items: [code, weight, value]
  // F's weight corrected from 6 to 5 (per prompt).
  const items = [
    ["A", 8, 17], ["B", 7, 15], ["C", 6, 13], ["D", 6, 12],
    ["E", 5, 11], ["F", 5, 10], ["G", 5, 10], ["H", 4, 8],
    ["I", 4, 7], ["J", 3, 6], ["K", 3, 6], ["L", 2, 5],
    ["M", 4, 9], ["N", 3, 8], ["O", 2, 4], ["P", 4, 9],
    ["Q", 3, 7], ["R", 4, 9],
  ];

  const excluded = new Set(["C", "G", "K", "M", "N", "R"]);
  const required = new Set(["A", "D", "Q"]);
  const capacity = 32;

  const pool = items.filter(([c]) => !excluded.has(c));
  const reqItems = pool.filter(([c]) => required.has(c));
  const optItems = pool.filter(([c]) => !required.has(c));

  // Required items must fit.
  const reqWeight = reqItems.reduce((s, [, w]) => s + w, 0);
  const reqValue = reqItems.reduce((s, [, , v]) => s + v, 0);
  if (reqWeight > capacity) { console.error("Required items exceed capacity"); process.exit(1); }

  const remCap = capacity - reqWeight;
  const n = optItems.length;

  // Branch and bound on optional items.
  let best = null; // {codes[], value}
  const order = optItems.map((_, i) => i).sort((a, b) =>
    optItems[b][2] / optItems[b][1] - optItems[a][2] / optItems[a][1]);
  const suffixVal = new Array(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) suffixVal[i] = suffixVal[i + 1] + optItems[order[i]][2];

  function isBetter(cand) {
    if (!best) return true;
    if (cand.value !== best.value) return cand.value > best.value;
    if (cand.codes.length !== best.codes.length) return cand.codes.length < best.codes.length;
    return cand.codes.join("+") < best.codes.join("+");
  }

  function dfs(pos, chosen, w, v) {
    if (w > remCap) return;
    // Bound: (required value + current optional value + optimistic remainder)
    // must be able to beat best total value.
    if (best && reqValue + v + suffixVal[pos] < best.value) return;
    if (pos === n) {
      const allCodes = [...reqItems.map(([c]) => c), ...chosen.map((i) => optItems[i][0])].sort();
      const cand = { codes: allCodes, value: reqValue + v };
      if (isBetter(cand)) best = cand;
      return;
    }
    const i = order[pos];
    const [, iw, iv] = optItems[i];
    if (w + iw <= remCap) {
      chosen.push(i);
      dfs(pos + 1, chosen, w + iw, v + iv);
      chosen.pop();
    }
    dfs(pos + 1, chosen, w, v);
  }

  dfs(0, [], 0, 0);
  if (!best) { console.error("No feasible selection"); process.exit(1); }
  console.log(best.codes.join("+"));
}

main();
