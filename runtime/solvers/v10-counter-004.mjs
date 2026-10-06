#!/usr/bin/env node
// solvers/v10-counter-004.mjs — Shortest-path counterfactual: a road closes.
// Output the increase in the shortest distance like '99'.
// Format: "Roads: A-B (5), B-C (4), A-C (12). Shortest route from A to C is 9
// via B." / "Counterfactual: road B-C closes." / "By how much does the
// shortest A-to-C distance increase?"
// Roads are undirected. The stated base route is recomputed as a parse sanity
// check. Dijkstra and exhaustive simple-path enumeration are independent
// optimizers and must agree on both base and counterfactual distances.
// Mode-17: FATAL on any unparseable input, optimizer mismatch, or a
// disconnected counterfactual graph.
// Usage: node v10-counter-004.mjs --prompt <prompt.txt>

import { readPrompt, FATAL, diag } from "./lib/v10-util.mjs";

// Primary: Dijkstra.
function dijkstra(adj, s, t) {
  const dist = new Map([[s, 0]]);
  const pq = [[0, s]];
  while (pq.length) {
    pq.sort((a, b) => a[0] - b[0]);
    const [d, u] = pq.shift();
    if (d !== dist.get(u)) continue;
    if (u === t) return d;
    for (const [v, w] of adj.get(u) || []) {
      const nd = d + w;
      if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); pq.push([nd, v]); }
    }
  }
  return dist.get(t) ?? Infinity;
}

// Independent: exhaustive simple-path enumeration.
function enumSP(adj, s, t) {
  let best = Infinity;
  (function dfs(u, cost, seen) {
    if (cost >= best) return;
    if (u === t) { best = cost; return; }
    for (const [v, w] of adj.get(u) || []) {
      if (seen.has(v)) continue;
      seen.add(v);
      dfs(v, cost + w, seen);
      seen.delete(v);
    }
  })(s, 0, new Set([s]));
  return best;
}

function buildUndirected(edges) {
  const adj = new Map();
  for (const [u, v, d] of edges) {
    if (!adj.has(u)) adj.set(u, []);
    if (!adj.has(v)) adj.set(v, []);
    adj.get(u).push([v, d]);
    adj.get(v).push([u, d]);
  }
  return adj;
}

function main() {
  const text = readPrompt(process.argv.slice(2));

  // The roads list may share its line with following sentences, so capture the
  // maximal run of "X-Y (d)" specs rather than the whole line.
  const roadsM = /Roads:\s*((?:[A-Za-z0-9]+-[A-Za-z0-9]+\s*\(\d+\)\s*,?\s*)+)/i.exec(text);
  if (!roadsM) FATAL("roads list not parsed");
  const edges = [];
  const ere = /([A-Za-z0-9]+)-([A-Za-z0-9]+)\s*\((\d+)\)/g;
  let m;
  while ((m = ere.exec(roadsM[1])) !== null)
    edges.push([m[1], m[2], parseInt(m[3], 10)]);
  if (edges.length === 0) FATAL("no roads parsed");
  const stripped = roadsM[1]
    .replace(/([A-Za-z0-9]+)-([A-Za-z0-9]+)\s*\(\d+\)/g, "")
    .replace(/[,\s.]/g, "");
  if (stripped !== "") FATAL(`unparsed road text: "${stripped}"`);

  const baseM = /Shortest route from ([A-Za-z0-9]+) to ([A-Za-z0-9]+) is (\d+) via ([A-Za-z0-9]+)/i.exec(text);
  if (!baseM) FATAL("stated base route not parsed");
  const S = baseM[1], T = baseM[2], statedBase = parseInt(baseM[3], 10);

  const dBase = dijkstra(buildUndirected(edges), S, T);
  const eBase = enumSP(buildUndirected(edges), S, T);
  if (dBase !== eBase) FATAL(`base optimizer mismatch: dijkstra=${dBase} enum=${eBase}`);
  if (!isFinite(dBase)) FATAL("base graph disconnects S from T");
  if (dBase !== statedBase) FATAL(`base shortest ${dBase} != stated ${statedBase}`);

  const cM = /road ([A-Za-z0-9]+)-([A-Za-z0-9]+) closes/i.exec(text);
  if (!cM) FATAL("counterfactual closure not parsed");
  const edges2 = edges.filter(([u, v]) =>
    !((u === cM[1] && v === cM[2]) || (u === cM[2] && v === cM[1])));
  if (edges2.length === edges.length) FATAL(`closed road ${cM[1]}-${cM[2]} not found among roads`);

  const qM = /shortest ([A-Za-z0-9]+)-to-([A-Za-z0-9]+) distance increase/i.exec(text);
  if (!qM) FATAL("increase question not parsed");
  if (qM[1] !== S || qM[2] !== T) FATAL("question endpoints differ from base route endpoints");

  const dNew = dijkstra(buildUndirected(edges2), S, T);
  const eNew = enumSP(buildUndirected(edges2), S, T);
  if (dNew !== eNew) FATAL(`counterfactual optimizer mismatch: dijkstra=${dNew} enum=${eNew}`);
  if (!isFinite(dNew)) FATAL("counterfactual disconnects S from T — increase undefined");

  const inc = dNew - dBase;
  if (inc < 0) FATAL(`negative increase ${inc} — optimizer bug`);

  diag(`base shortest ${S}->${T} = ${dBase}; after closure = ${dNew}; increase ${inc}`);
  console.log(String(inc));
}

main();
