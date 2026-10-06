#!/usr/bin/env node
// solve-route.mjs — Routing solver (Phase 3, extended Phase 5).
// PAL-style: parse the prompt, run deterministic DFS with pruning, print answer.
//
// Usage: node solve-route.mjs --prompt <prompt.txt>
//   Prints the route like 'S>A>D>T'.
//
// Handles the v8 routing format:
//   "Directed network S -> T (link: distance, toll, exposure, fuel, risk, noise):"
//   "S->A: d=4, toll=3, exp=2, fuel=1, risk=2, noise=1"
//   "Find the route minimizing total distance subject to total toll <= 20, ..."
//   "Tie-breaks: lower toll, then lower exposure, ... then lexicographically smallest node sequence."
//   "Output ONLY the route like 'S>A>D>T'."
//
// Phase 5 extensions:
//   - Waypoint constraints: "must pass through at least five of the hubs {X,Y,Z,W,V,U}"
//     or "must pass through J, N, and O" or "MUST visit G, J, and K".
//   - k-th route: "Output ONLY the 9th route in this ordering" — enumerate all
//     feasible routes in the stated order, output the Nth.
//   - Time windows: "A: [0, 12], service 1" — arrival-time simulation;
//     objective "Minimize arrival time at T".
//   - Link status filtering: [CLOSED], [PROPOSED not built], [NIGHT-ONLY ...],
//     [weight limit ...] links are excluded (distractor tasks).

import { readFileSync } from "node:fs";
import { assertNonNegative } from "./validate-input.mjs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node solve-route.mjs --prompt <prompt.txt>"); process.exit(2); }
  return args;
}

// Attribute name normalization.
const ATTR_ALIASES = {
  d: "distance", dist: "distance", distance: "distance",
  toll: "toll",
  exp: "exposure", exposure: "exposure",
  fuel: "fuel",
  risk: "risk",
  noise: "noise",
  time: "time",
};

const WORD_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

function parseWordNum(s) {
  s = s.trim().toLowerCase();
  if (/^\d+$/.test(s)) return +s;
  return WORD_NUM[s] || null;
}

function parsePrompt(text) {
  // Header: "Directed network S -> T (link: distance, toll, exposure, fuel, risk, noise):"
  // or Phase 5 time-window format: "Deliver from S to T."
  let start, end, attrs;
  const headerRe = /Directed network (\w+) -> (\w+) \(link: ([^)]+)\)/;
  const hm = headerRe.exec(text);
  if (hm) {
    start = hm[1]; end = hm[2];
    attrs = hm[3].split(",").map((s) => ATTR_ALIASES[s.trim().toLowerCase()] || s.trim().toLowerCase());
  } else {
    const delRe = /Deliver from (\w+) to (\w+)\./i.exec(text);
    if (!delRe) { console.error("No network header found"); process.exit(1); }
    start = delRe[1]; end = delRe[2];
    attrs = ["time", "distance"];
  }

  // Links: "S->A: d=4, toll=3, exp=2 [optional status note]"
  // Phase 5: filter out links marked [CLOSED], [PROPOSED not built], etc.
  const links = [];
  const linkRe = /^(\w+)->(\w+):\s*(.+)$/gm;
  let m;
  while ((m = linkRe.exec(text)) !== null) {
    const rawVals = m[3];
    // Extract bracketed status notes.
    const statusNotes = [];
    const noteRe = /\[([^\]]+)\]/g;
    let nm;
    while ((nm = noteRe.exec(rawVals)) !== null) statusNotes.push(nm[1].toLowerCase());
    // Skip unusable links.
    const unusable = statusNotes.some((n) =>
      /closed/.test(n) || /proposed/.test(n) || /not built/.test(n) ||
      /night.only/.test(n) || /weight limit/.test(n));
    if (unusable) continue;
    const vals = {};
    // Strip bracketed notes before parsing k=v pairs.
    const clean = rawVals.replace(/\[[^\]]+\]/g, "");
    // v9: bare-number links "S->A: 4" — the value belongs to the header's first attribute.
    if (/^\s*-?[\d.]+\s*$/.test(clean) && attrs.length > 0) {
      vals[attrs[0]] = +clean.trim();
    } else {
      for (const part of clean.split(",")) {
        const kv = part.split("=");
        if (kv.length < 2) continue;
        const k = kv[0].trim();
        const v = kv[1].trim();
        if (!k || !v) continue;
        const attr = ATTR_ALIASES[k.toLowerCase()] || k.toLowerCase();
        vals[attr] = +v;
      }
    }
    links.push({ from: m[1], to: m[2], vals });
  }

  // Free-text closure mentions (v1.8 mode 17, v9-elide-001): a closure declared
  // in prose, e.g. "segments A->D and B->D are closed for construction".
  // Extract the clause containing "clos" and drop any X->Y links named in it.
  const closedFromProse = new Set();
  const clauseRe = /[^.!?]*clos(?:ed|ure)[^.!?]*/gi;
  let cm;
  while ((cm = clauseRe.exec(text)) !== null) {
    const tokRe = /(\w+)->(\w+)/g;
    let tm;
    while ((tm = tokRe.exec(cm[0])) !== null) closedFromProse.add(tm[1] + "->" + tm[2]);
  }
  const usableLinks = links.filter((l) => !closedFromProse.has(l.from + "->" + l.to));

  // Time windows (Phase 5): "A: [0, 12], service 1"
  const windows = {};
  const winRe = /^(\w+):\s*\[(\d+),\s*(\d+)\],\s*service (\d+)/gm;
  while ((m = winRe.exec(text)) !== null) {
    windows[m[1]] = { open: +m[2], close: +m[3], service: +m[4] };
  }
  const hasWindows = Object.keys(windows).length > 0;

  // Waypoint constraints (Phase 5).
  // "must pass through at least five of the hubs {X, Y, Z, W, V, U}"
  // "must pass through J, N, and O"
  // "MUST visit G, J, and K"
  // "MUST visit all of {C, D, E, F, G}" (v9-route-005; was silently dropped —
  //   the "all of {...}" phrasing matched no branch, so the constraint vanished)
  let waypoints = null;
  const wpAllOf = /must (?:pass through|visit) all of \{([^}]+)\}/i.exec(text);
  if (wpAllOf) {
    const set = wpAllOf[1].split(",").map((s) => s.trim()).filter((s) => /^[A-Z]\w*$/.test(s));
    if (set.length > 0) waypoints = { type: "all", set };
  }
  const wpAtLeast = /must pass through at least (\w+) of (?:the )?hubs? \{([^}]+)\}/i.exec(text);
  if (!waypoints && wpAtLeast) {
    const count = parseWordNum(wpAtLeast[1]);
    const set = wpAtLeast[2].split(",").map((s) => s.trim()).filter(Boolean);
    if (count !== null) waypoints = { type: "at_least", count, set };
  } else {
    const wpAll = /must (?:pass through|visit) ([\w\s,]+?)(?:\.|;|\s+and total|\s+Total)/i.exec(text);
    if (wpAll) {
      const set = wpAll[1].split(/,|\sand\s/).map((s) => s.trim()).filter((s) => /^[A-Z]\w*$/.test(s));
      if (set.length > 0) waypoints = { type: "all", set };
    }
  }

  // k-th route (Phase 5): "Output ONLY the 9th route in this ordering"
  // v9: also "...the 15th path in this ordering".
  let kth = null;
  const kthRe = /output ONLY the (\d+)(?:st|nd|rd|th) (?:route|path) in this ordering/i.exec(text);
  if (kthRe) kth = +kthRe[1];

  // v9: k-th ordering given as "Order them by (total distance, total toll,
  // lexicographically smallest node sequence)". The first key is the objective.
  let orderKeys = null;
  const ordListRe = /Order them by \(([^)]+)\)/i.exec(text);
  if (ordListRe) {
    orderKeys = ordListRe[1].split(",").map((s) => s.trim().toLowerCase());
  }

  // Objective: "minimizing total distance", "Minimize total exposure", "Minimize arrival time at T".
  // v9: "Find the shortest S->T path" → distance;
  //     "the path whose cumulative exposure burden is as small as possible" → exposure.
  // FAIL LOUDLY if no objective parsed — never silently default.
  let objective = null;
  let objectiveArrival = false;
  const arrRe = /minimiz(?:ing|e) arrival time at/i.exec(text);
  if (arrRe) {
    objectiveArrival = true;
    objective = "arrival_time";
  } else {
    const objRe = /minimiz(?:ing|e) total (\w+)/i;
    const om = objRe.exec(text);
    if (om) {
      objective = ATTR_ALIASES[om[1].toLowerCase()] || om[1].toLowerCase();
    } else if (/shortest \w+ ?-> ?\w+ path|find the shortest/i.test(text)) {
      // "Find the shortest S->T path." — shortest = minimize distance.
      objective = "distance";
    } else {
      // "the path whose cumulative exposure burden is as small as possible"
      const smallRe = /cumulative (\w+?)(?: burden)? is as small as possible/i.exec(text);
      if (smallRe) {
        objective = ATTR_ALIASES[smallRe[1].toLowerCase()] || smallRe[1].toLowerCase();
      } else if (orderKeys && orderKeys.length > 0) {
        // k-th mode from "Order them by (...)": first key is the objective.
        const k0 = orderKeys[0].replace(/^total /, "");
        objective = ATTR_ALIASES[k0] || k0;
      } else if (kth !== null) {
        // k-th mode: "ordered by distance (ties: ...)" — the ordering key is the objective.
        const ordRe = /ordered by (\w+)/i.exec(text);
        if (ordRe) {
          objective = ATTR_ALIASES[ordRe[1].toLowerCase()] || ordRe[1].toLowerCase();
        }
      }
    }
    if (!objective) {
      console.error("FATAL: could not parse objective (expected 'minimizing/minimize total <attr>', 'minimize arrival time', or 'ordered by <attr>')");
      process.exit(1);
    }
  }

  // Constraints: "total toll <= 20", also "total toll must be <= 26",
  // v9: "total distance does not exceed 40".
  // KA5 fix: widen (\d+) to (-?\d+) so negative budgets are parsed (not silently
  // dropped); assertNonNegative FATALs on the defect instead of emitting an
  // unconstrained optimum.
  const constraints = {};
  const conRe = /total (\w+)(?:\s+must\s+be)?\s*<=\s*(-?\d+)/gi;
  let cm3;
  while ((cm3 = conRe.exec(text)) !== null) {
    const attr = ATTR_ALIASES[cm3[1].toLowerCase()] || cm3[1].toLowerCase();
    constraints[attr] = +cm3[2];
  }
  const conRe2 = /total (\w+) does not exceed (-?\d+)/gi;
  while ((cm3 = conRe2.exec(text)) !== null) {
    const attr = ATTR_ALIASES[cm3[1].toLowerCase()] || cm3[1].toLowerCase();
    constraints[attr] = +cm3[2];
  }
  assertNonNegative(Object.values(constraints), "constraint budget");

  // Tie-breaks.
  const tiebreaks = [];
  const parseTbParts = (tbText) => {
    const parts = tbText.split(/,\s*then\s*|\s*then\s*/);
    for (const p of parts) {
      const pl = p.trim().toLowerCase();
      const lowerM = /(?:lower|smaller)(?: total)? (\w+)/.exec(pl);
      const shorterM = /shorter (\w+)/.exec(pl);
      if (lowerM) {
        tiebreaks.push({ type: "min", attr: ATTR_ALIASES[lowerM[1]] || lowerM[1] });
      } else if (shorterM) {
        tiebreaks.push({ type: "min", attr: ATTR_ALIASES[shorterM[1]] || shorterM[1] });
      } else if (/fewer links/.test(pl)) {
        tiebreaks.push({ type: "min_links" });
      } else if (/lexicographically smallest/.test(pl)) {
        tiebreaks.push({ type: "lex" });
      }
    }
  };
  const tbRe = /Tie-breaks?:\s*(.+?)\.\s*Output/i;
  const tbm = tbRe.exec(text);
  if (tbm) {
    parseTbParts(tbm[1]);
  } else {
    // v9: "When two paths have equal exposure burden, prefer the one with
    // smaller total distance, then smaller total toll, then the
    // lexicographically smallest node sequence."
    const prefRe = /prefer the one with (.+?)\.\s*Output/i.exec(text);
    if (prefRe) parseTbParts(prefRe[1]);
  }
  // v9 k-th "Order them by (...)": tie-break keys after the first.
  if (orderKeys && orderKeys.length > 1) {
    for (const k of orderKeys.slice(1)) {
      if (/lexicographically/.test(k)) tiebreaks.push({ type: "lex" });
      else {
        const a = k.replace(/^total /, "");
        tiebreaks.push({ type: "min", attr: ATTR_ALIASES[a] || a });
      }
    }
  }

  // E6-7: domain invariants — distances must be non-negative (T8).
  // Negative distances break DFS pruning soundness; a confident answer on
  // such input is mode 17's mirror, not an optimum.
  // Note: attr aliases map d/dist/distance -> "distance".
  assertNonNegative(usableLinks.map((l) => l.vals.distance).filter((v) => v !== undefined), "distance");

  return { start, end, attrs, links: usableLinks, objective, objectiveArrival, constraints, tiebreaks, waypoints, kth, windows, hasWindows };
}

function routeString(path, end) {
  return path.map((l) => l.from).concat([end]).join(">");
}

function costsFor(path) {
  const costs = {};
  for (const l of path) {
    for (const [k, v] of Object.entries(l.vals)) {
      costs[k] = (costs[k] || 0) + v;
    }
  }
  return costs;
}

// Check waypoint satisfaction for a completed route.
function waypointsSatisfied(path, end, waypoints) {
  if (!waypoints) return true;
  const nodes = new Set(path.map((l) => l.from).concat([end]));
  if (waypoints.type === "all") {
    return waypoints.set.every((w) => nodes.has(w));
  } else if (waypoints.type === "at_least") {
    const hit = waypoints.set.filter((w) => nodes.has(w)).length;
    return hit >= waypoints.count;
  }
  return true;
}

// Time-window arrival simulation (Phase 5).
// Returns arrival time at end, or null if infeasible (missed a window).
function simulateArrival(path, end, windows) {
  let t = 0; // start at S at time 0
  const nodes = path.map((l) => l.from).concat([end]);
  for (let i = 0; i < path.length; i++) {
    const link = path[i];
    const travel = link.vals.time || 0;
    t += travel;
    const node = link.to;
    const w = windows[node];
    if (w) {
      if (t > w.close) return null; // arrived too late
      if (t < w.open) t = w.open; // wait
      t += w.service;
    }
  }
  return t;
}

function compareRoutes(a, b, net) {
  // a, b: {path, costs, arrival}
  const { objective, objectiveArrival, tiebreaks, end } = net;
  if (objectiveArrival) {
    if (a.arrival !== b.arrival) return a.arrival - b.arrival;
  } else {
    const av = a.costs[objective] || 0, bv = b.costs[objective] || 0;
    if (av !== bv) return av - bv;
  }
  for (const tb of tiebreaks) {
    if (tb.type === "min") {
      const av = a.costs[tb.attr] || 0, bv = b.costs[tb.attr] || 0;
      if (av !== bv) return av - bv;
    } else if (tb.type === "min_links") {
      if (a.path.length !== b.path.length) return a.path.length - b.path.length;
    } else if (tb.type === "lex") {
      const as = routeString(a.path, end), bs = routeString(b.path, end);
      if (as !== bs) return as < bs ? -1 : 1;
    }
  }
  return 0;
}

function solve(net) {
  const { start, end, links, objective, objectiveArrival, constraints, waypoints, kth, hasWindows, windows } = net;

  const adj = new Map();
  for (const l of links) {
    if (!adj.has(l.from)) adj.set(l.from, []);
    adj.get(l.from).push(l);
  }

  const useWindows = hasWindows && objectiveArrival;

  if (kth !== null) {
    // k-th mode: enumerate ALL feasible routes, sort, pick Nth.
    const feasible = [];
    function dfsK(node, path, visited) {
      if (node === end) {
        const costs = costsFor(path);
        for (const [attr, max] of Object.entries(constraints)) {
          if ((costs[attr] || 0) > max) return;
        }
        if (!waypointsSatisfied(path, end, waypoints)) return;
        let arrival = null;
        if (useWindows) {
          arrival = simulateArrival(path, end, windows);
          if (arrival === null) return;
        }
        feasible.push({ path: [...path], costs, arrival });
        return;
      }
      for (const l of adj.get(node) || []) {
        if (visited.has(l.to)) continue;
        visited.add(l.to);
        path.push(l);
        dfsK(l.to, path, visited);
        path.pop();
        visited.delete(l.to);
      }
    }
    dfsK(start, [], new Set([start]));
    feasible.sort((a, b) => compareRoutes(a, b, net));
    if (feasible.length < kth) {
      console.error(`FATAL: only ${feasible.length} feasible routes, asked for ${kth}th`);
      process.exit(1);
    }
    return { kthRoute: feasible[kth - 1], total: feasible.length };
  }

  // Standard mode: DFS with pruning, track best.
  let best = null;
  let nodes = 0;

  function isBetter(cand) {
    if (!best) return true;
    return compareRoutes(cand, best, net) < 0;
  }

  function dfs(node, path, costs, visited, arrivalSoFar) {
    nodes++;
    if (node === end) {
      for (const [attr, max] of Object.entries(constraints)) {
        if ((costs[attr] || 0) > max) return;
      }
      if (!waypointsSatisfied(path, end, waypoints)) return;
      let arrival = arrivalSoFar;
      if (useWindows) {
        // arrivalSoFar already simulated incrementally; just use it.
        arrival = arrivalSoFar;
        if (arrival === null) return;
      }
      const cand = { path: [...path], costs: { ...costs }, arrival };
      if (isBetter(cand)) best = cand;
      return;
    }
    // Prune on objective (only for additive objectives, not arrival-time).
    if (!objectiveArrival && best && (costs[objective] || 0) > (best.costs[objective] || 0)) return;
    // Prune on constraints.
    for (const [attr, max] of Object.entries(constraints)) {
      if ((costs[attr] || 0) > max) return;
    }

    for (const l of adj.get(node) || []) {
      if (visited.has(l.to)) continue;
      const newCosts = { ...costs };
      for (const [k, v] of Object.entries(l.vals)) {
        newCosts[k] = (newCosts[k] || 0) + v;
      }
      // Incremental arrival simulation for time-window mode.
      let newArrival = arrivalSoFar;
      if (useWindows) {
        let t = arrivalSoFar === undefined ? 0 : arrivalSoFar;
        t += l.vals.time || 0;
        const w = windows[l.to];
        if (w) {
          if (t > w.close) continue; // infeasible branch
          if (t < w.open) t = w.open;
          t += w.service;
        }
        newArrival = t;
      }
      visited.add(l.to);
      path.push(l);
      dfs(l.to, path, newCosts, visited, newArrival);
      path.pop();
      visited.delete(l.to);
    }
  }

  dfs(start, [], {}, new Set([start]), useWindows ? 0 : undefined);
  return { best, nodes };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const text = readFileSync(args.prompt, "utf8");
  const net = parsePrompt(text);
  if (net.links.length === 0) { console.error("No links parsed"); process.exit(1); }
  const result = solve(net);
  if (net.kth !== null) {
    const route = routeString(result.kthRoute.path, net.end);
    console.log(route);
    return;
  }
  const { best } = result;
  if (!best) { console.error("No feasible route"); process.exit(1); }
  const route = routeString(best.path, net.end);
  console.log(route);
}

main();
