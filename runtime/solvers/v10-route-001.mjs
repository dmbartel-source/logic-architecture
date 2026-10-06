#!/usr/bin/env node
// solvers/v10-route-001.mjs — Shortest route from A to F visiting D then E, in
// that order (undirected graph, positive weights).
// PAL-style: parse edges, Dijkstra each leg (A->D, D->E, E->F) with a
// lexicographic-path tie-break, concatenate. Concatenation is provably optimal
// for the ordered-visit constraint: any feasible path's length >= the sum of
// the three independent shortest-leg distances (positive weights).
// Mode-17: FAIL LOUDLY (FATAL on stderr, exit 1) on any unparseable input.
// Usage: node v10-route-001.mjs --prompt <prompt.txt>

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v10-route-001.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

const FATAL = (msg) => { console.error(`FATAL: ${msg}`); process.exit(1); };

function parseGraph(text) {
  const adj = new Map();
  const addEdge = (a, b, w) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push([b, w]);
    adj.get(b).push([a, w]);
  };
  const re = /([A-Za-z][A-Za-z0-9]*)-([A-Za-z][A-Za-z0-9]*)\s*\((\d+(?:\.\d+)?)\)/g;
  let m, n = 0;
  while ((m = re.exec(text)) !== null) { addEdge(m[1], m[2], parseFloat(m[3])); n++; }
  if (n === 0) FATAL("no edges parsed");
  return adj;
}

function cmpPath(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return a.length - b.length;
}

// Dijkstra returning the lexicographically smallest among shortest paths.
function shortestPath(adj, src, dst) {
  const dist = new Map([[src, 0]]);
  const best = new Map([[src, [src]]]);
  const pq = [[0, [src], src]];
  const done = new Set();
  while (pq.length > 0) {
    pq.sort((x, y) => x[0] - y[0] || cmpPath(x[1], y[1]));
    const [d, path, u] = pq.shift();
    if (done.has(u)) continue;
    done.add(u);
    for (const [v, w] of adj.get(u) || []) {
      const nd = d + w;
      const np = [...path, v];
      if (!dist.has(v) || nd < dist.get(v) ||
          (nd === dist.get(v) && cmpPath(np, best.get(v)) < 0)) {
        dist.set(v, nd);
        best.set(v, np);
        pq.push([nd, np, v]);
      }
    }
  }
  return best.get(dst) || null;
}

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");
  const adj = parseGraph(text);
  const m = text.match(/shortest route from\s+([A-Za-z][A-Za-z0-9]*)\s+to\s+([A-Za-z][A-Za-z0-9]*)\s+that visits\s+([A-Za-z][A-Za-z0-9]*)\s+and then\s+([A-Za-z][A-Za-z0-9]*),?\s+in that order/i);
  if (!m) FATAL("could not parse ordered-visit route constraint");
  const [src, dst, w1, w2] = [m[1], m[2], m[3], m[4]];
  for (const n of [src, dst, w1, w2]) if (!adj.has(n)) FATAL(`node ${n} not in graph`);
  const p1 = shortestPath(adj, src, w1);
  const p2 = shortestPath(adj, w1, w2);
  const p3 = shortestPath(adj, w2, dst);
  if (!p1 || !p2 || !p3) FATAL("a required leg is unreachable");
  const full = [...p1, ...p2.slice(1), ...p3.slice(1)];
  console.log("DISTANCE:" + full.join("-"));
}

main();
