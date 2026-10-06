#!/usr/bin/env node
// solvers/v10-mult-003.mjs — Multi-optimum routing: output ONLY the shortest
// distance (mode 18: multiple optimal routes may exist; the DISTANCE is unique).
// Undirected graph, Dijkstra.
// Mode-17: FAIL LOUDLY (FATAL on stderr, exit 1) if prompt structure mismatches.
// Usage: node v10-mult-003.mjs --prompt <prompt.txt>

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v10-mult-003.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

const FATAL = (msg) => { console.error(`FATAL: ${msg}`); process.exit(1); };

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");

  const roadRe = /([A-Z][A-Za-z0-9]*)-([A-Z][A-Za-z0-9]*)\s*\((\d+(?:\.\d+)?)\)/g;
  const roads = [];
  let m;
  while ((m = roadRe.exec(text)) !== null) {
    roads.push({ a: m[1], b: m[2], d: parseFloat(m[3]) });
  }
  if (roads.length === 0) FATAL("no roads parsed");

  const mRoute = text.match(/from\s+([A-Z][A-Za-z0-9]*)\s+to\s+([A-Z][A-Za-z0-9]*)/i);
  if (!mRoute) FATAL("could not parse route endpoints");
  const src = mRoute[1], dst = mRoute[2];

  if (!/shortest\s+distance/i.test(text)) FATAL("prompt does not ask for shortest distance");

  const dist = { [src]: 0 };
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
      const nd = dist[u] + r.d;
      if (dist[v] === undefined || nd < dist[v]) {
        dist[v] = nd; open.push(v);
      }
    }
  }
  if (dist[dst] === undefined) FATAL(`no route from ${src} to ${dst}`);

  console.log(Number.isInteger(dist[dst]) ? String(dist[dst]) : dist[dst].toFixed(2));
}

main();
