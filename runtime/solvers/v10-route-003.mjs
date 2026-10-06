#!/usr/bin/env node
// solvers/v10-route-003.mjs — Route minimizing the longest single leg.
// Tie-break: shortest total distance, then path order (lexicographic).
// PAL-style: exhaustive simple-path enumeration, exact lexicographic key
// (maxLeg, total, pathString).
// Mode-17: FAIL LOUDLY (FATAL on stderr, exit 1) on any unparseable input.
// Usage: node v10-route-003.mjs --prompt <prompt.txt>

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v10-route-003.mjs --prompt <prompt.txt>"); process.exit(1); }
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
  if (!/minimizes the longest single leg/i.test(text)) FATAL("minimax-leg objective not found");
  const m = text.match(/route from\s+([A-Za-z][A-Za-z0-9]*)\s+to\s+([A-Za-z][A-Za-z0-9]*)/i);
  if (!m) FATAL("could not parse route endpoints");
  const [src, dst] = [m[1], m[2]];
  if (!adj.has(src) || !adj.has(dst)) FATAL("endpoint not in graph");

  const paths = [];
  const dfs = (u, visited, path, legs, total) => {
    if (u === dst) { paths.push({ path: [...path], legs: [...legs], total }); return; }
    for (const [v, w] of adj.get(u) || []) {
      if (visited.has(v)) continue;
      visited.add(v);
      path.push(v); legs.push(w);
      dfs(v, visited, path, legs, total + w);
      path.pop(); legs.pop();
      visited.delete(v);
    }
  };
  dfs(src, new Set([src]), [src], [], 0);
  if (paths.length === 0) FATAL("no routes found");

  paths.sort((a, b) => {
    const ma = Math.max(...a.legs), mb = Math.max(...b.legs);
    if (ma !== mb) return ma - mb;
    if (a.total !== b.total) return a.total - b.total;
    const sa = a.path.join("-"), sb = b.path.join("-");
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });

  console.log("MAXLEG:" + paths[0].path.join("-"));
}

main();
