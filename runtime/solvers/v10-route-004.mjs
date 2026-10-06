#!/usr/bin/env node
// solvers/v10-route-004.mjs — Time-window constrained routing: start at S at
// time 0, visit waypoints within their windows in order, end at F. Waiting is
// allowed. Minimize arrival time at F.
// PAL-style: Dijkstra over (node, phase) states, where phase = number of
// waypoints visited. First-arrival semantics: arriving at the current
// waypoint's node counts as the visit; the visit time is max(arrival,
// window_start) and must be <= window_end. Waiting en route is equivalent to
// waiting on arrival (static travel times), so no explicit wait action is
// needed; cycles never improve the arrival time (nonnegative times).
// Mode-17: FAIL LOUDLY (FATAL on stderr, exit 1) on any unparseable input.
// Usage: node v10-route-004.mjs --prompt <prompt.txt>

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v10-route-004.mjs --prompt <prompt.txt>"); process.exit(1); }
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

  const mS = text.match(/Start at\s+([A-Za-z][A-Za-z0-9]*)\s+at time\s+(\d+(?:\.\d+)?)/i);
  if (!mS) FATAL("could not parse start node/time");
  const start = mS[1], t0 = parseFloat(mS[2]);

  const mW = text.match(/Must visit\s+([A-Za-z][A-Za-z0-9]*)\s+within time window\s*\[(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)\],?\s*then\s+([A-Za-z][A-Za-z0-9]*)\s+within\s*\[(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)\],?\s*then end at\s+([A-Za-z][A-Za-z0-9]*)/i);
  if (!mW) FATAL("could not parse waypoint windows");
  const waypoints = [
    { node: mW[1], lo: parseFloat(mW[2]), hi: parseFloat(mW[3]) },
    { node: mW[4], lo: parseFloat(mW[5]), hi: parseFloat(mW[6]) },
  ];
  const end = mW[7];
  const K = waypoints.length;
  for (const w of waypoints) if (!adj.has(w.node)) FATAL(`waypoint ${w.node} not in graph`);
  if (!adj.has(start) || !adj.has(end)) FATAL("start/end not in graph");

  // Dijkstra over (node, phase).
  const key = (node, phase) => `${node}|${phase}`;
  const dist = new Map([[key(start, 0), t0]]);
  const prev = new Map(); // key -> {pkey, node}
  const pq = [[t0, start, 0]];
  const done = new Set();
  const goalKey = key(end, K);
  while (pq.length > 0) {
    pq.sort((a, b) => a[0] - b[0]);
    const [t, u, p] = pq.shift();
    const k = key(u, p);
    if (done.has(k)) continue;
    done.add(k);
    if (k === goalKey) break;
    for (const [v, w] of adj.get(u) || []) {
      const t2 = t + w;
      let np = p, nt = t2;
      if (p < K && v === waypoints[p].node) {
        // First-arrival visit semantics: arrival counts as the visit.
        if (t2 > waypoints[p].hi) continue; // infeasible: missed the window
        np = p + 1;
        nt = Math.max(t2, waypoints[p].lo); // wait for window to open
      }
      const nk = key(v, np);
      if (!dist.has(nk) || nt < dist.get(nk)) {
        dist.set(nk, nt);
        prev.set(nk, { pkey: k, node: v });
        pq.push([nt, v, np]);
      }
    }
  }
  if (!dist.has(goalKey)) FATAL("no feasible route visiting all waypoints in their windows");

  // Reconstruct node sequence from the prev chain.
  const seq = [end];
  let cur = goalKey;
  while (cur !== key(start, 0)) {
    const pr = prev.get(cur);
    if (!pr) FATAL("path reconstruction failed");
    seq.unshift(pr.pkey.split("|")[0]);
    cur = pr.pkey;
  }
  console.log("TIME:" + seq.join("-"));
}

main();
