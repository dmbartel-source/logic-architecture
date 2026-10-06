#!/usr/bin/env node
// solvers/v10-elide-003.mjs — Elision-probe routing: shortest route honoring a
// road closure (the closure sentence is the probe — eliding it routes through the
// closed road). Undirected graph, Dijkstra with path reconstruction.
// Mode-17: FAIL LOUDLY (FATAL on stderr, exit 1) if prompt structure mismatches.
// Usage: node v10-elide-003.mjs --prompt <prompt.txt>

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v10-elide-003.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

const FATAL = (msg) => { console.error(`FATAL: ${msg}`); process.exit(1); };

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");

  // Roads: "A-B (4)" — undirected.
  const roadRe = /([A-Z][A-Za-z0-9]*)-([A-Z][A-Za-z0-9]*)\s*\((\d+(?:\.\d+)?)\)/g;
  const roads = [];
  let m;
  while ((m = roadRe.exec(text)) !== null) {
    roads.push({ a: m[1], b: m[2], d: parseFloat(m[3]) });
  }
  if (roads.length === 0) FATAL("no roads parsed");

  // Closure: "B-C is closed" (the elision probe).
  const closed = new Set();
  const closeRe = /([A-Z][A-Za-z0-9]*)-([A-Z][A-Za-z0-9]*)\s+is\s+closed/i;
  const mClose = text.match(closeRe);
  if (mClose) {
    const key = [mClose[1], mClose[2]].sort().join("-");
    closed.add(key);
  }

  // Endpoints: "Shortest route from A to C?"
  const mRoute = text.match(/from\s+([A-Z][A-Za-z0-9]*)\s+to\s+([A-Z][A-Za-z0-9]*)/i);
  if (!mRoute) FATAL("could not parse route endpoints");
  const src = mRoute[1], dst = mRoute[2];

  // Dijkstra.
  const dist = { [src]: 0 };
  const prev = {};
  const visited = new Set();
  const open = [src];
  while (open.length > 0) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (dist[open[i]] < dist[open[bi]]) bi = i;
    const u = open.splice(bi, 1)[0];
    if (visited.has(u)) continue;
    visited.add(u);
    if (u === dst) break;
    for (const r of roads) {
      if (![r.a, r.b].includes(u)) continue;
      const v = r.a === u ? r.b : r.a;
      if (closed.has([r.a, r.b].sort().join("-"))) continue;
      const nd = dist[u] + r.d;
      if (dist[v] === undefined || nd < dist[v]) {
        dist[v] = nd; prev[v] = u; open.push(v);
      }
    }
  }
  if (dist[dst] === undefined) FATAL(`no route from ${src} to ${dst}`);

  const path = [];
  for (let cur = dst; cur !== undefined; cur = prev[cur]) path.unshift(cur);
  const distOut = Number.isInteger(dist[dst]) ? dist[dst] : dist[dst].toFixed(2);
  console.log(`${distOut}:${path.join("-")}`);
}

main();
