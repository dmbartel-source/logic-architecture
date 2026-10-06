#!/usr/bin/env node
// solvers/v10-route-002.mjs — Enumerate all simple routes A->F, order by
// distance (ties by path string), output the 3rd-shortest.
// PAL-style: exhaustive DFS enumeration is exact on this small graph.
// Mode-17: FAIL LOUDLY (FATAL on stderr, exit 1) on any unparseable input.
// Usage: node v10-route-002.mjs --prompt <prompt.txt>

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v10-route-002.mjs --prompt <prompt.txt>"); process.exit(1); }
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

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");
  const adj = parseGraph(text);
  const m = text.match(/all simple routes from\s+([A-Za-z][A-Za-z0-9]*)\s+to\s+([A-Za-z][A-Za-z0-9]*)\s+ordered by distance/i);
  if (!m) FATAL("could not parse k-th-shortest route request");
  const [src, dst] = [m[1], m[2]];
  if (!adj.has(src) || !adj.has(dst)) FATAL("endpoint not in graph");

  const paths = [];
  const dfs = (u, visited, path, dist) => {
    if (u === dst) { paths.push({ path: [...path], dist }); return; }
    for (const [v, w] of adj.get(u) || []) {
      if (visited.has(v)) continue;
      visited.add(v);
      path.push(v);
      dfs(v, visited, path, dist + w);
      path.pop();
      visited.delete(v);
    }
  };
  dfs(src, new Set([src]), [src], 0);
  if (paths.length === 0) FATAL("no routes found");

  paths.sort((a, b) => {
    if (a.dist !== b.dist) return a.dist - b.dist;
    const sa = a.path.join("-"), sb = b.path.join("-");
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });

  const K = 3;
  if (paths.length < K) FATAL(`only ${paths.length} routes found, need ${K}`);
  console.log("DISTANCE:" + paths[K - 1].path.join("-"));
}

main();
