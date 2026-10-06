#!/usr/bin/env node
// solvers/solve-counter-v9.mjs — v9 counterfactual solver.
// PAL-style: parse prompt, deterministic combinatorial search, print answer.
// Handles v9-counter-001..005 (each a novel counterfactual structure).
//
// Each variant searches with a primary algorithm, then fully re-searches with
// an INDEPENDENT algorithm (different technique), and FATALs on any mismatch:
// base value, after value, and the tie-broken answer must all agree.
// The printed answer is also checked against its expected format regex.
//
// Usage: node solve-counter-v9.mjs --prompt <prompt.txt>
// Prints ONLY the answer to stdout; diagnostics go to stderr.

import { readFileSync } from "node:fs";
import { canonicalLabel, solutionSignature, compareSignature, detectTieBreak, isLexSmallestRule } from "./canonical-label.mjs";
import { assertRLeN, assertCountMatch } from "./validate-input.mjs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node solve-counter-v9.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

function fatal(msg) { console.error("FATAL: " + msg); process.exit(1); }

// Lexicographic compare of string arrays.
function lexCompare(a, b) {
  const sa = a.join(","), sb = b.join(",");
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

// All r-combinations of array indices (returns index lists).
function combos(n, r) {
  const out = [];
  const rec = (start, cur) => {
    if (cur.length === r) { out.push([...cur]); return; }
    for (let i = start; i < n; i++) { cur.push(i); rec(i + 1, cur); cur.pop(); }
  };
  rec(0, []);
  return out;
}

// ── Knapsack implementations ─────────────────────────────────────────
// Primary: branch-and-bound on 0/1 knapsack. Returns optimal VALUE.
function knapsackBB(items, capacity) {
  const order = items.map((_, i) => i).sort((a, b) =>
    items[b].value / items[b].weight - items[a].value / items[a].weight);
  const n = order.length;
  const suf = new Array(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) suf[i] = suf[i + 1] + items[order[i]].value;
  let best = 0;
  function dfs(pos, w, v) {
    if (w > capacity) return;
    if (v + suf[pos] < best) return;
    if (v > best) best = v;
    if (pos === n) return;
    const it = items[order[pos]];
    if (w + it.weight <= capacity) dfs(pos + 1, w + it.weight, v + it.value);
    dfs(pos + 1, w, v);
  }
  dfs(0, 0, 0);
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

function parseKnapsackItems(text) {
  const items = [];
  const re = /^([A-Za-z]+\d*):\s*value=(\d+),\s*weight=(\d+)/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    items.push({ name: m[1], value: +m[2], weight: +m[3] });
  }
  const capM = /capacity (\d+)/.exec(text);
  return { items, capacity: capM ? +capM[1] : null };
}

// ── 001: quintuple removal minimizing the remainder optimum ───────────
// Question: "which 5 items, if removed, minimize the optimal value of the
// remaining 15 items?"  Tie-break: lexicographically smallest sorted list.
function solve001(text) {
  const { items, capacity } = parseKnapsackItems(text);
  if (items.length === 0 || capacity === null) fatal("knapsack not parsed");
  // HERA P2 (t09 pair 10): stated-vs-listed count reconciliation. The prompt
  // declares "<N> items (name: value, weight)"; silently solving when N != the
  // listed count means committing on a self-contradictory specification.
  assertCountMatch(text, /^(\d+) items \(name: value, weight\)/m,
    /^([A-Za-z]+\d*):\s*value=\d+,\s*weight=\d+/gm, "items");
  const rM = /which (\d+) items, if removed/.exec(text);
  const r = rM ? +rM[1] : 5;
  const names = items.map((x) => x.name);
  // E6-7: domain invariant — cannot remove more items than exist (T9).
  // combos(n, r<r) yields nothing and the old code died on a null dereference.
  assertRLeN(r, names.length, "remove items");

  const search = (kval) => {
    let best = null;
    for (const idx of combos(names.length, r)) {
      const rem = idx.map((i) => names[i]);
      const rset = new Set(rem);
      const v = kval(items.filter((x) => !rset.has(x.name)), capacity);
      const srem = [...rem].sort();
      if (!best || v < best.v || (v === best.v && lexCompare(srem, best.rem) < 0))
        best = { v, rem: srem };
    }
    return best;
  };
  const primary = search(knapsackBB);
  const independent = search(knapsackDP); // full independent re-search
  if (primary.v !== independent.v || lexCompare(primary.rem, independent.rem) !== 0)
    fatal(`001 self-verification mismatch: B&B=${primary.rem.join(",")}@${primary.v} vs DP=${independent.rem.join(",")}@${independent.v}`);
  const answer = `REMOVE:${primary.rem.join(",")}`;
  if (!/^REMOVE:[A-T](,[A-T])*$/.test(answer)) fatal(`001 format check failed: ${answer}`);
  console.error(`001 verified: removal=${primary.rem.join(",")} remainder-opt=${primary.v}`);
  console.log(answer);
}

// ── Shortest-path implementations ────────────────────────────────────
// Primary: Dijkstra.
function shortestDijkstra(edges, start, end) {
  const adj = new Map();
  for (const [u, v, d] of edges) {
    if (!adj.has(u)) adj.set(u, []);
    adj.get(u).push([v, d]);
  }
  const dist = new Map([[start, 0]]);
  const pq = [[0, start]];
  while (pq.length) {
    pq.sort((a, b) => a[0] - b[0]);
    const [d, u] = pq.shift();
    if (d !== dist.get(u)) continue;
    if (u === end) return d;
    for (const [v, w] of adj.get(u) || []) {
      const nd = d + w;
      if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); pq.push([nd, v]); }
    }
  }
  return dist.get(end) ?? Infinity;
}

// Independent: exhaustive simple-path DFS enumeration.
function shortestEnum(edges, start, end) {
  const adj = new Map();
  for (const [u, v, d] of edges) {
    if (!adj.has(u)) adj.set(u, []);
    adj.get(u).push([v, d]);
  }
  let best = Infinity;
  const dfs = (u, cost, seen) => {
    if (u === end) { if (cost < best) best = cost; return; }
    for (const [v, d] of adj.get(u) || []) {
      if (seen.has(v)) continue;
      seen.add(v); dfs(v, cost + d, seen); seen.delete(v);
    }
  };
  dfs(start, 0, new Set([start]));
  return best;
}

// ── 002: 3 link changes maximizing shortest-distance increase ─────────
// Question: "which 3 changes, applied together, maximize the increase in
// shortest distance?"  Changes listed sorted. Tie-break: lexicographically
// smallest sorted change list among max-delta triples.
function solve002(text) {
  const edges = [];
  const eRe = /^([A-Za-z]+)->([A-Za-z]+):\s*(\d+)\s*$/gm;
  let m;
  while ((m = eRe.exec(text)) !== null) edges.push([m[1], m[2], +m[3]]);
  if (edges.length === 0) fatal("network not parsed");
  const changes = [];
  const cRe = /^([A-Za-z]+)->([A-Za-z]+) becomes (\d+)\s*$/gm;
  while ((m = cRe.exec(text)) !== null) changes.push({ u: m[1], v: m[2], d: +m[3] });
  if (changes.length === 0) fatal("changes not parsed");
  const kM = /which (\d+) changes, applied together/.exec(text);
  const k = kM ? +kM[1] : 3;
  // KA5 fix: t10's uncaught exception (r=30 > n=9) crashed in lexCompare.
  // assertRLeN FATALs with a named invariant instead.
  assertRLeN(k, changes.length, "choose-k-changes");

  // ── Tie-break precedence (Pass³ regression fix) ──
  // An explicit prompt-stated tie-break rule takes precedence over the
  // canonical (WL structural) tie-break below. Canonical is only the fallback
  // when the prompt states no tie-break rule.
  const tb002 = detectTieBreak(text);
  const useLex002 = tb002.stated && isLexSmallestRule(tb002.rule);
  if (tb002.stated) console.error(`002: prompt states tie-break "${tb002.rule}" -> ${useLex002 ? "honoring lexicographic" : "canonical fallback"}`);

  // ── Mode 18 canonical tie-break (fallback) ──
  // Label nodes by pure graph structure (WL refinement): S/T distinguished
  // by role, others by weighted directed connection profile. The tie-break
  // among max-delta change sets uses structural signatures, not raw names,
  // so the choice is invariant under bijective renaming.
  const nodeIds = [...new Set(edges.flatMap(([u, v]) => [u, v]))];
  const wlabels = canonicalLabel(nodeIds.map((id) => ({
    id,
    attrs: { isS: id === "S", isT: id === "T" },
    out: edges.filter(([u]) => u === id).map(([u, v, d]) => ({ to: v, attrs: { d } })),
    in: edges.filter(([, v]) => v === id).map(([u, v, d]) => ({ from: u, attrs: { d } })),
  })));
  // Structural signature of a change triple: sorted color-pairs + new values.
  const changeSig = (idx) => solutionSignature(
    idx.map((i) => changes[i]),
    wlabels,
    (c) => [c.u, c.v],
  ) + "|" + idx.map((i) => changes[i].d).sort((a, b) => a - b).join(",");
  // Canonical serialization key for a single change: (colorU, colorV, nameStr).
  // Sorting output by this gives rename-invariant serialization order.
  const changeKey = (c) => {
    const lu = wlabels.get(c.u), lv = wlabels.get(c.v);
    return [lu.color, lv.color, `${c.u}->${c.v}`];
  };
  const canonSort = (arr) => [...arr].sort((a, b) => {
    const ka = changeKey(a), kb = changeKey(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || (ka[2] < kb[2] ? -1 : ka[2] > kb[2] ? 1 : 0);
  });
  // Returns -1/0/1: comparison of two change index-sets.
  // Primary: structural signature (canonical fallback), UNLESS the prompt
  // states an explicit lexicographic tie-break — then raw-name lex is primary.
  // Secondary: raw-name lex (deterministic; only reached for automorphic
  // variants, which are structurally identical).
  const canonCompare = (idxA, idxB) => {
    if (!useLex002) {
      const s = compareSignature(changeSig(idxA), changeSig(idxB));
      if (s !== 0) return s;
    }
    const da = idxA.map((i) => changes[i].u + "->" + changes[i].v).sort();
    const db = idxB.map((i) => changes[i].u + "->" + changes[i].v).sort();
    return lexCompare(da, db);
  };

  const edgeMap = new Map(edges.map(([u, v, d]) => [u + "->" + v, d]));
  const withChanges = (idx) => {
    const em = new Map(edgeMap);
    for (const i of idx) em.set(changes[i].u + "->" + changes[i].v, changes[i].d);
    return [...em.entries()].map(([uv, d]) => { const [u, v] = uv.split("->"); return [u, v, d]; });
  };

  const search = (spath) => {
    const base = spath(edges, "S", "T");
    let best = null;
    for (const idx of combos(changes.length, k)) {
      const nd = spath(withChanges(idx), "S", "T");
      const delta = nd - base;
      // desc is canonically serialized (structural order), so output strings
      // are rename-invariant, not just the selection.
      const desc = canonSort(idx.map((i) => changes[i])).map((c) => c.u + "->" + c.v);
      if (!best || delta > best.delta || (delta === best.delta && canonCompare(idx, best.idx) < 0))
        best = { delta, desc, idx: [...idx] };
    }
    return { base, ...best };
  };
  const primary = search(shortestDijkstra);
  const independent = search(shortestEnum); // full independent re-search
  if (primary.base !== independent.base || primary.delta !== independent.delta ||
      lexCompare(primary.desc, independent.desc) !== 0)
    fatal(`002 self-verification mismatch: dijkstra=${primary.base}>${primary.delta}:${primary.desc.join(",")} vs enum=${independent.base}>${independent.delta}:${independent.desc.join(",")}`);
  if (!(primary.delta > 0)) fatal(`002 sanity: claimed delta ${primary.delta} is not a positive increase`);
  const answer = `${primary.base}>${primary.delta}:${primary.desc.join(",")}`;
  if (!/^\d+>\d+:[A-Z]->[A-Z](,[A-Z]->[A-Z])*$/.test(answer)) fatal(`002 format check failed: ${answer}`);
  console.error(`002 verified: base=${primary.base} delta=${primary.delta} changes=${primary.desc.join(",")}`);
  console.log(answer);
}

// ── List-scheduling implementations ──────────────────────────────────
// Primary: time-stepped list scheduler, LPT among ready jobs.
function listScheduleA(durations, prec, mCount, names) {
  const n = durations.length;
  // Canonical tie-break: order-independent. Ties on duration break by job
  // NAME (canonical content), never by array index (input order). This is a
  // Mode 18 fix: the previous `a - b` index tie-break made the makespan
  // depend on input order, causing the two "independent" methods to disagree
  // on reversed inputs.
  const tieKey = names ? ((j) => names[j]) : ((j) => String(j));
  const done = new Set(), started = new Set();
  const finishAt = new Array(n).fill(0);
  let running = [];
  let now = 0;
  const machineFree = new Array(mCount).fill(0);
  while (done.size < n) {
    for (const r of running) if (r.end <= now) done.add(r.job);
    running = running.filter((r) => r.end > now);
    if (done.size === n) break;
    const ready = [];
    for (let j = 0; j < n; j++) {
      if (started.has(j) || done.has(j)) continue;
      const preds = prec.get(j) || new Set();
      let ok = true;
      for (const p of preds) if (!done.has(p)) { ok = false; break; }
      if (ok) ready.push(j);
    }
    ready.sort((a, b) => durations[b] - durations[a] ||
      (tieKey(a) < tieKey(b) ? -1 : tieKey(a) > tieKey(b) ? 1 : 0));
    let idle = false;
    for (let k = 0; k < mCount && ready.length > 0; k++) {
      if (machineFree[k] <= now) {
        const j = ready.shift();
        started.add(j);
        const end = now + durations[j];
        finishAt[j] = end;
        machineFree[k] = end;
        running.push({ job: j, end });
        idle = true;
      }
    }
    if (running.length === 0) fatal("scheduling deadlock");
    if (!idle || ready.length > 0) now = Math.min(...running.map((r) => r.end));
    else now = Math.min(...running.map((r) => r.end));
  }
  return Math.max(...finishAt);
}

// Independent: event-driven scheduler written from the spec sentence:
// "list scheduling, longest-duration-first among ready jobs" — whenever a
// machine is idle and a ready job exists, start the longest ready job.
function listScheduleB(names, dur, pred, mCount) {
  const doneAt = {};
  const running = new Map();
  let t = 0;
  while (Object.keys(doneAt).length < names.length) {
    for (const [j, e] of [...running]) if (e <= t) { running.delete(j); doneAt[j] = e; }
    if (Object.keys(doneAt).length === names.length) break;
    const ready = names
      .filter((j) => !(j in doneAt) && !running.has(j) && (pred[j] || []).every((p) => p in doneAt))
      .sort((a, b) => dur[b] - dur[a] || (a < b ? -1 : 1));
    while (running.size < mCount && ready.length) {
      const j = ready.shift();
      running.set(j, t + dur[j]);
    }
    if (running.size === 0) fatal("scheduling deadlock (independent)");
    t = Math.min(...running.values());
  }
  return Math.max(...Object.values(doneAt));
}

// ── 003: 5 precedence removals maximizing makespan reduction ──────────
// Question: "which 5 precedence constraints, if removed, maximize the
// makespan reduction?"  Constraints listed sorted. Tie-break: lexicographically
// smallest sorted constraint list among max-reduction sets.
function solve003(text) {
  const jm = /(\d+) jobs on (\d+) machines/.exec(text);
  if (!jm) fatal("job/machine counts not parsed");
  const n = +jm[1], mCount = +jm[2];
  const durations = new Array(n).fill(0);
  const nameToIdx = new Map();
  const names = [];
  const dRe = /^(J\d+):\s*(\d+)\s*$/gm;
  let m;
  while ((m = dRe.exec(text)) !== null) { names.push(m[1]); nameToIdx.set(m[1], names.length - 1); durations[names.length - 1] = +m[2]; }
  if (names.length !== n) fatal(`parsed ${names.length} jobs, expected ${n}`);
  const pLine = /Precedence: ([^.]+)\./.exec(text);
  if (!pLine) fatal("precedence not parsed");
  const cons = [];
  for (const c of pLine[1].split(";")) {
    const t = c.trim();
    if (!t) continue;
    const [a, b] = t.split(">").map((s) => s.trim());
    if (!nameToIdx.has(a) || !nameToIdx.has(b)) fatal(`unknown job in constraint ${t}`);
    cons.push(a + ">" + b);
  }
  const rM = /which (\d+) precedence constraints, if removed/.exec(text);
  const r = rM ? +rM[1] : 5;
  // E6-7: domain invariant — cannot remove more constraints than exist.
  assertRLeN(r, cons.length, "remove precedence constraints");

  // ── Tie-break precedence (Pass³ regression fix) ──
  // An explicit prompt-stated tie-break rule takes precedence over the
  // canonical (WL structural) tie-break below. Canonical is only the fallback
  // when the prompt states no tie-break rule.
  const tb003 = detectTieBreak(text);
  const useLex003 = tb003.stated && isLexSmallestRule(tb003.rule);
  if (tb003.stated) console.error(`003: prompt states tie-break "${tb003.rule}" -> ${useLex003 ? "honoring lexicographic" : "canonical fallback"}`);

  // ── Mode 18 canonical tie-break (fallback) ──
  // Label jobs by pure precedence+duration structure (WL refinement).
  // Removal-set tie-break uses structural signatures, not raw names.
  const wlabels003 = canonicalLabel(names.map((nm) => {
    const di = nameToIdx.get(nm);
    return {
      id: nm,
      attrs: { dur: durations[di] },
      out: cons.filter((c) => c.split(">")[0] === nm).map((c) => ({ to: c.split(">")[1], attrs: {} })),
      in: cons.filter((c) => c.split(">")[1] === nm).map((c) => ({ from: c.split(">")[0], attrs: {} })),
    };
  }));
  const removalSig = (idx) => solutionSignature(
    idx.map((i) => cons[i]),
    wlabels003,
    (c) => c.split(">"),
  );
  // Canonical serialization key for a single constraint: (colorA, colorB, str).
  const removalKey = (c) => {
    const [a, b] = c.split(">");
    const la = wlabels003.get(a), lb = wlabels003.get(b);
    return [la.color, lb.color, c];
  };
  const canonSort003 = (arr) => [...arr].sort((a, b) => {
    const ka = removalKey(a), kb = removalKey(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || (ka[2] < kb[2] ? -1 : ka[2] > kb[2] ? 1 : 0);
  });
  const canonCompare003 = (idxA, idxB) => {
    if (!useLex003) {
      const s = compareSignature(removalSig(idxA), removalSig(idxB));
      if (s !== 0) return s;
      const da = canonSort003(idxA.map((i) => cons[i]));
      const db = canonSort003(idxB.map((i) => cons[i]));
      return lexCompare(da, db);
    }
    // Explicit prompt-stated lexicographic tie-break: pure name order.
    const da = idxA.map((i) => cons[i]).sort();
    const db = idxB.map((i) => cons[i]).sort();
    return lexCompare(da, db);
  };

  const schedA = (removedSet) => {
    const prec = new Map();
    for (const key of cons) {
      if (removedSet.has(key)) continue;
      const [a, b] = key.split(">");
      const ai = nameToIdx.get(a), bi = nameToIdx.get(b);
      if (!prec.has(bi)) prec.set(bi, new Set());
      prec.get(bi).add(ai);
    }
    return listScheduleA(durations, prec, mCount, names);
  };
  const schedB = (removedSet) => {
    const dur = {}, pred = {};
    for (const nm of names) dur[nm] = durations[nameToIdx.get(nm)];
    for (const key of cons) {
      if (removedSet.has(key)) continue;
      const [a, b] = key.split(">");
      (pred[b] = pred[b] || []).push(a);
    }
    return listScheduleB(names, dur, pred, mCount);
  };

  const search = (sched) => {
    const base = sched(new Set());
    let best = null;
    for (const idx of combos(cons.length, r)) {
      const removed = new Set(idx.map((i) => cons[i]));
      const reduction = base - sched(removed);
      const desc = canonSort003(idx.map((i) => cons[i]));
      if (!best || reduction > best.reduction || (reduction === best.reduction && canonCompare003(idx, best.idx) < 0))
        best = { reduction, desc, idx: [...idx] };
    }
    return { base, ...best };
  };
  const primary = search(schedA);
  const independent = search(schedB); // full independent re-search
  if (primary.base !== independent.base || primary.reduction !== independent.reduction ||
      lexCompare(primary.desc, independent.desc) !== 0)
    fatal(`003 self-verification mismatch: A=${primary.base}>${primary.reduction}:${primary.desc.join(",")} vs B=${independent.base}>${independent.reduction}:${independent.desc.join(",")}`);
  if (!(primary.reduction > 0)) fatal(`003 sanity: claimed reduction ${primary.reduction} is not positive`);
  const answer = `${primary.base}>${primary.reduction}:${primary.desc.join(",")}`;
  if (!/^\d+>\d+:[A-Z0-9]+>[A-Z0-9]+(,[A-Z0-9]+>[A-Z0-9]+)*$/.test(answer)) fatal(`003 format check failed: ${answer}`);
  console.error(`003 verified: base=${primary.base} reduction=${primary.reduction} removals=${primary.desc.join(",")}`);
  console.log(answer);
}

// ── 004: 2 member removals minimizing the max 6-member team value ──────
// Question: "which 2 members, if removed, minimize the max 6-member team
// value among the remaining 10?"  Team value = 100*distinct roles + sum skills.
// Tie-break: lexicographically smallest sorted removal list.
function solve004(text) {
  const members = [];
  const mRe = /^(M\d+):\s*skill=(\d+),\s*roles=\[([^\]]*)\]/gm;
  let m;
  while ((m = mRe.exec(text)) !== null) {
    members.push({
      name: m[1],
      skill: +m[2],
      roles: m[3].split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean),
    });
  }
  if (members.length === 0) fatal("members not parsed");
  const tM = /max value of any (\d+)-member team/.exec(text);
  const t = tM ? +tM[1] : 6;
  const rM = /which (\d+) members, if removed/.exec(text);
  const r = rM ? +rM[1] : 2;

  const teamValue = (team) => {
    const roles = new Set();
    let s = 0;
    for (const x of team) { s += x.skill; for (const rl of x.roles) roles.add(rl); }
    return 100 * roles.size + s;
  };
  // Primary: recursive combination enumeration.
  const maxTeamA = (pool) => {
    let bv = -1;
    const rec = (start, cur) => {
      if (cur.length === t) { const v = teamValue(cur); if (v > bv) bv = v; return; }
      for (let i = start; i < pool.length; i++) { cur.push(pool[i]); rec(i + 1, cur); cur.pop(); }
    };
    rec(0, []);
    return bv;
  };
  // Independent: build explicit team arrays, then evaluate.
  const maxTeamB = (pool) => {
    const teams = [];
    const rec = (start, cur) => {
      if (cur.length === t) { teams.push([...cur]); return; }
      for (let i = start; i < pool.length; i++) { cur.push(pool[i]); rec(i + 1, cur); cur.pop(); }
    };
    rec(0, []);
    let bv = -1;
    for (const team of teams) {
      const roles = new Set();
      let s = 0;
      for (const x of team) { s += x.skill; x.roles.forEach((rl) => roles.add(rl)); }
      const v = 100 * roles.size + s;
      if (v > bv) bv = v;
    }
    return bv;
  };

  const search = (maxTeam) => {
    const base = maxTeam(members);
    let best = null;
    for (const idx of combos(members.length, r)) {
      const rem = idx.map((i) => members[i].name);
      const rset = new Set(rem);
      const v = maxTeam(members.filter((x) => !rset.has(x.name)));
      const srem = [...rem].sort();
      if (!best || v < best.v || (v === best.v && lexCompare(srem, best.rem) < 0))
        best = { v, rem: srem };
    }
    return { base, ...best };
  };
  const primary = search(maxTeamA);
  const independent = search(maxTeamB); // full independent re-search
  if (primary.base !== independent.base || primary.v !== independent.v ||
      lexCompare(primary.rem, independent.rem) !== 0)
    fatal(`004 self-verification mismatch: A=${primary.base}>${primary.v}:${primary.rem.join(",")} vs B=${independent.base}>${independent.v}:${independent.rem.join(",")}`);
  if (!(primary.v < primary.base)) fatal(`004 sanity: claimed after-value ${primary.v} is not below base ${primary.base}`);
  const drop = primary.base - primary.v;
  const answer = `${primary.base}>${drop}:${primary.rem.join(",")}`;
  if (!/^\d+>\d+:[A-Z0-9]+(,[A-Z0-9]+)*$/.test(answer)) fatal(`004 format check failed: ${answer}`);
  console.error(`004 verified: base=${primary.base} after=${primary.v} removal=${primary.rem.join(",")}`);
  console.log(answer);
}

// ── 005: synergy knapsack + single removal with max drop ───────────────
// Question: "whose single removal from the pool most reduces the
// re-optimized value?"  Tie-break: smallest item name among max-drop items.
function solve005(text) {
  const { items, capacity } = parseKnapsackItems(text);
  if (items.length === 0 || capacity === null) fatal("knapsack not parsed");
  const syn = [];
  const sLine = /Synergies \(applied if both in knapsack\): ([^.]+)\./.exec(text);
  if (!sLine) fatal("synergies not parsed");
  const sRe = /([A-Za-z]+\d*)\+([A-Za-z]+\d*):\s*([+-]\d+)/g;
  let m;
  while ((m = sRe.exec(sLine[1])) !== null) syn.push({ a: m[1], b: m[2], bonus: +m[3] });

  const valueOf = (chosen) => {
    const set = new Set(chosen.map((x) => x.name));
    let v = chosen.reduce((a, x) => a + x.value, 0);
    for (const s of syn) if (set.has(s.a) && set.has(s.b)) v += s.bonus;
    return v;
  };
  // Primary: B&B with synergy-aware bound.
  const optimalA = (pool) => {
    const order = pool.map((_, i) => i).sort((a, b) =>
      pool[b].value / pool[b].weight - pool[a].value / pool[a].weight);
    const n = order.length;
    const posSyn = syn.filter((s) => s.bonus > 0).reduce((a, s) => a + s.bonus, 0);
    const suf = new Array(n + 1).fill(0);
    for (let i = n - 1; i >= 0; i--) suf[i] = suf[i + 1] + pool[order[i]].value;
    let best = -Infinity;
    const chosen = [];
    function dfs(pos, w) {
      if (w > capacity) return;
      const v = valueOf(chosen);
      if (v + suf[pos] + posSyn < best) return;
      if (v > best) best = v;
      if (pos === n) return;
      const it = pool[order[pos]];
      if (w + it.weight <= capacity) { chosen.push(it); dfs(pos + 1, w + it.weight); chosen.pop(); }
      dfs(pos + 1, w);
    }
    dfs(0, 0);
    return best;
  };
  // Independent: brute-force 2^n.
  const optimalB = (pool) => {
    let best = -Infinity;
    const n = pool.length;
    for (let mask = 0; mask < (1 << n); mask++) {
      let w = 0;
      const chosen = [];
      for (let i = 0; i < n; i++) if (mask >> i & 1) { w += pool[i].weight; chosen.push(pool[i]); }
      if (w > capacity) continue;
      const v = valueOf(chosen);
      if (v > best) best = v;
    }
    return best;
  };

  const search = (opt) => {
    const base = opt(items);
    let bestDrop = null;
    for (const x of items) {
      const pool = items.filter((y) => y.name !== x.name);
      const v = opt(pool);
      const drop = base - v;
      if (!bestDrop || drop > bestDrop.drop || (drop === bestDrop.drop && x.name < bestDrop.name))
        bestDrop = { drop, name: x.name, after: v };
    }
    return { base, ...bestDrop };
  };
  const primary = search(optimalA);
  const independent = search(optimalB); // full independent re-search
  if (primary.base !== independent.base || primary.drop !== independent.drop || primary.name !== independent.name)
    fatal(`005 self-verification mismatch: A=${primary.base}>${primary.drop}:${primary.name} vs B=${independent.base}>${independent.drop}:${independent.name}`);
  if (!(primary.drop > 0)) fatal(`005 sanity: claimed drop ${primary.drop} is not positive`);
  const answer = `${primary.base}>${primary.drop}:${primary.name}`;
  if (!/^\d+>\d+:[A-Z]$/.test(answer)) fatal(`005 format check failed: ${answer}`);
  console.error(`005 verified: base=${primary.base} drop=${primary.drop} removal=${primary.name}`);
  console.log(answer);
}

// ── Question-type dispatch ────────────────────────────────────────────
function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");
  if (/which \d+ items, if removed, minimize the optimal value/.test(text)) return solve001(text);
  if (/which \d+ changes, applied together, maximize the increase in shortest distance/.test(text)) return solve002(text);
  if (/which \d+ precedence constraints, if removed, maximize the makespan reduction/.test(text)) return solve003(text);
  if (/which \d+ members, if removed, minimize the max \d+-member team value/.test(text)) return solve004(text);
  if (/whose single removal from the pool most reduces the re-optimized value/.test(text)) return solve005(text);
  fatal("unknown v9 counterfactual variant — unrecognized question type");
}

main();
