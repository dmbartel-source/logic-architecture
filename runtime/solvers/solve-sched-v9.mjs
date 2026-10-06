#!/usr/bin/env node
// solve-sched-v9.mjs — v9 scheduling solvers (6 novel formats), auto-detect.
//
// Usage: node solve-sched-v9.mjs --prompt <prompt.txt>
//   Prints ONLY the answer (one line) to stdout; diagnostics to stderr.
//   FATALs (exit 1) on unrecognized format or any verification failure.
//
// Formats (auto-detected from prompt text):
//   multimachine : multi-machine, eligibility + releases + precedence, min makespan
//                  output 'MAKESPAN:J01@0,J02@3,...' sorted by (start, name)
//   singlesetup  : single machine, releases, sequence-dependent setups, min makespan
//                  output 'MAKESPAN:A@0,B@5,...' (start order)
//   shifts       : worker/shift assignment w/ skills, max shifts, no consecutive days,
//                  min max-shifts; output 'S01=w1,S02=w3,...'
//   caps         : identical machines w/ duration caps, min makespan
//                  output 'MAKESPAN:J01@0,J02@4,...' sorted by (start, name)
//   lateness     : single machine, deadlines, maintenance windows, setups,
//                  min max lateness (floored at 0); output 'LATE:J01@12,...'
//                  sorted by (completion, name), @ = completion time
//   flowshop     : 2-stage flow shop, min makespan; output 'MAKESPAN:J01,J02,...'
//
// Method: PAL-style — parse the prompt, solve deterministically
// (branch-and-bound / DP bitmask), self-verify against ALL parsed constraints.

import { readFileSync } from "node:fs";
import { canonicalLabel, detectTieBreak, isStartNameRule } from "./canonical-label.mjs";
import { assertInterval, assertNonNegative } from "./validate-input.mjs";

const FATAL = (msg) => { console.error(`FATAL: ${msg}`); process.exit(1); };
const diag = (...a) => console.error(...a);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node solve-sched-v9.mjs --prompt <prompt.txt>"); process.exit(2); }
  return args;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

// Lexicographic compare of [key, name] pair sequences.
function cmpPair(a, b) {
  if (a[0] !== b[0]) return a[0] - b[0];
  return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
}
function seqLT(a, b) {
  if (!b) return true;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const c = cmpPair(a[i], b[i]);
    if (c !== 0) return c < 0;
  }
  return a.length < b.length;
}

// Kahn's topological sort; FATALs on cycle.
function topoSort(n, preds, succs) {
  const indeg = preds.map((p) => p.length);
  const q = [];
  for (let i = 0; i < n; i++) if (indeg[i] === 0) q.push(i);
  const order = [];
  while (q.length) {
    const j = q.pop();
    order.push(j);
    for (const t of succs[j]) if (--indeg[t] === 0) q.push(t);
  }
  if (order.length !== n) FATAL("precedence graph has a cycle");
  return order;
}

function allPerms(arr) {
  const out = [];
  const a = arr.slice();
  const gen = (k) => {
    if (k === a.length) { out.push(a.slice()); return; }
    for (let i = k; i < a.length; i++) {
      [a[k], a[i]] = [a[i], a[k]];
      gen(k + 1);
      [a[k], a[i]] = [a[i], a[k]];
    }
  };
  gen(0);
  return out;
}

function checkFormat(tag, answer, re) {
  if (!re.test(answer)) FATAL(`${tag}: answer fails format check: ${answer}`);
}

// ---------------------------------------------------------------------------
// Format 1: multi-machine, eligibility + releases + precedence, min makespan
// ---------------------------------------------------------------------------
function solveMultiMachine(text) {
  const tag = "multimachine";
  const jobs = [];
  const jre = /^([A-Za-z0-9]+): duration=(-?\d+), machines=\[([^\]]*)\], release=(-?\d+)\s*$/gm;
  let m;
  while ((m = jre.exec(text))) {
    const elig = [...m[3].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    if (!elig.length) FATAL(`${tag}: no eligible machines parsed for ${m[1]}`);
    jobs.push({ name: m[1], dur: +m[2], elig, release: +m[4] });
  }
  if (!jobs.length) FATAL(`${tag}: no jobs parsed`);
  // KA5 fix: durations/releases widened to (-?\d+); negative values FATAL loudly.
  assertNonNegative(jobs.map((j) => j.dur), "duration");
  assertNonNegative(jobs.map((j) => j.release), "release");
  const n = jobs.length;
  const idx = new Map(jobs.map((j, i) => [j.name, i]));
  const preds = jobs.map(() => []), succs = jobs.map(() => []);
  const pre = /([A-Za-z0-9]+) before ([A-Za-z0-9]+)/g;
  while ((m = pre.exec(text))) {
    const a = idx.get(m[1]), b = idx.get(m[2]);
    if (a === undefined || b === undefined) FATAL(`${tag}: precedence on unknown job: ${m[0]}`);
    preds[b].push(a); succs[a].push(b);
  }
  let machines = [];
  const mr = /\(M(\d+)\.\.M(\d+)\)/.exec(text);
  if (mr) { for (let i = +mr[1]; i <= +mr[2]; i++) machines.push(`M${i}`); }
  else machines = [...new Set(jobs.flatMap((j) => j.elig))].sort();
  const nM = machines.length;
  const mIdx = new Map(machines.map((x, i) => [x, i]));
  const eligI = jobs.map((j) =>
    j.elig.map((e) => {
      const k = mIdx.get(e);
      if (k === undefined) FATAL(`${tag}: eligible machine ${e} not in machine list`);
      return k;
    })
  );
  const topo = topoSort(n, preds, succs);
  // jobs forced to a single machine (for the lower bound)
  const forced = machines.map(() => []);
  jobs.forEach((j, i) => { if (eligI[i].length === 1) forced[eligI[i][0]].push(i); });

  const startA = new Float64Array(n).fill(-1);
  const endA = new Float64Array(n).fill(-1);
  const machA = new Int32Array(n).fill(-1);
  const machineFree = new Float64Array(nM);
  const predEnd = new Float64Array(n);
  const predDone = new Int32Array(n);
  const ee = new Float64Array(n);
  let nodes = 0;
  const NODE_BUDGET = 500_000_000;

  // Lower bound on makespan at the current node. Also fills ee[] (earliest
  // end ignoring machines) used by the sequence lower bound.
  function lowerBound() {
    let lb = 0;
    let sumFree = 0, sumWork = 0;
    for (let k = 0; k < nM; k++) {
      lb = Math.max(lb, machineFree[k]);
      sumFree += machineFree[k];
    }
    let cp = 0;
    for (const j of topo) {
      let e;
      if (machA[j] !== -1) e = endA[j];
      else {
        let s = jobs[j].release;
        for (const p of preds[j]) s = Math.max(s, ee[p]);
        e = s + jobs[j].dur;
      }
      ee[j] = e;
      if (e > cp) cp = e;
      if (machA[j] === -1) sumWork += jobs[j].dur;
    }
    lb = Math.max(lb, cp, (sumFree + sumWork) / nM);
    for (let k = 0; k < nM; k++) {
      let f = machineFree[k];
      for (const j of forced[k]) if (machA[j] === -1) f += jobs[j].dur;
      if (f > lb) lb = f;
    }
    return lb;
  }

  // Lower bound on the final sorted (start,name) sequence: placed jobs keep
  // their actual pair; unplaced jobs use an optimistic start <= actual start.
  // Valid by elementwise-then-lexicographic monotonicity of sorting.
  function seqLowerBound() {
    const pairs = [];
    for (let j = 0; j < n; j++) {
      if (machA[j] !== -1) pairs.push([startA[j], jobs[j].name]);
      else {
        let s = jobs[j].release;
        for (const p of preds[j]) s = Math.max(s, ee[p]);
        let minFree = Infinity;
        for (const k of eligI[j]) minFree = Math.min(minFree, machineFree[k]);
        s = Math.max(s, minFree);
        pairs.push([s, jobs[j].name]);
      }
    }
    pairs.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1));
    return pairs;
  }

  function children() {
    const cands = [];
    for (let j = 0; j < n; j++) {
      if (machA[j] !== -1 || predDone[j] !== preds[j].length) continue;
      for (const k of eligI[j]) {
        const s = Math.max(jobs[j].release, predEnd[j], machineFree[k]);
        cands.push([s, jobs[j].name, j, k]);
      }
    }
    cands.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1));
    return cands;
  }

  function place(j, k, s) {
    startA[j] = s; endA[j] = s + jobs[j].dur; machA[j] = k;
    const prevFree = machineFree[k];
    machineFree[k] = endA[j];
    const touched = [];
    for (const t of succs[j]) {
      if (endA[j] > predEnd[t]) { touched.push([t, predEnd[t]]); predEnd[t] = endA[j]; }
      predDone[t]++;
    }
    return { prevFree, touched };
  }
  function unplace(j, k, st) {
    for (const t of succs[j]) predDone[t]--;
    for (const [t, old] of st.touched) predEnd[t] = old;
    machineFree[k] = st.prevFree;
    machA[j] = -1;
  }

  // Phase 1: minimal makespan (strict improvement => no plateau).
  let bestMs = Infinity;
  (function dfs1(count) {
    if (++nodes > NODE_BUDGET) FATAL(`${tag}: phase-1 search budget exceeded`);
    if (count === n) {
      let ms = 0;
      for (let i = 0; i < n; i++) ms = Math.max(ms, endA[i]);
      if (ms < bestMs) bestMs = ms;
      return;
    }
    if (lowerBound() >= bestMs) return; // need strict improvement
    for (const [s, , j, k] of children()) {
      const st = place(j, k, s);
      dfs1(count + 1);
      unplace(j, k, st);
    }
  })(0);
  if (!isFinite(bestMs)) FATAL(`${tag}: no feasible schedule found`);
  diag(`${tag}: phase 1 done: optimal makespan=${bestMs} nodes=${nodes}`);

  // Phase 2: lexicographically smallest sorted (start,name) sequence among
  // schedules with makespan <= bestMs.
  let best = { seq: null, sched: null };
  const nodes1 = nodes;
  (function dfs2(count) {
    if (++nodes > NODE_BUDGET) FATAL(`${tag}: phase-2 search budget exceeded`);
    const lb = lowerBound();
    if (lb > bestMs) return;
    if (count === n) {
      const seq = jobs.map((j, i) => [startA[i], j.name])
        .sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1));
      if (!best.seq || seqLT(seq, best.seq)) {
        best = { seq, sched: { start: [...startA], end: [...endA], mach: [...machA] } };
      }
      return;
    }
    // Tie-break prune: every completion has (ms, seq) >= (lb, L_seq);
    // if lb == bestMs and L_seq >= best.seq, this node cannot improve.
    // (A SCHEDV9_NOTBPRUNE=1 override for exhaustive cross-checking was
    // removed 2026-10-06: span-check flags environment-variable reads as
    // severe RUNTIME-INTERNALS-STATIC, and solver behavior must be a pure
    // function of the prompt. The production path is the pruned one.)
    if (lb === bestMs && best.seq) {
      const L = seqLowerBound();
      if (!seqLT(L, best.seq)) return;
    }
    for (const [s, , j, k] of children()) {
      const st = place(j, k, s);
      dfs2(count + 1);
      unplace(j, k, st);
    }
  })(0);
  diag(`${tag}: phase 2 done: nodes=${nodes - nodes1}`);
  if (!best.sched) FATAL(`${tag}: phase 2 found no schedule`);

  // ---- self-verification against ALL parsed constraints ----
  const { start, end, mach } = best.sched;
  for (let j = 0; j < n; j++) {
    if (!eligI[j].includes(mach[j])) FATAL(`${tag}: verify: ${jobs[j].name} on ineligible machine`);
    if (start[j] < jobs[j].release) FATAL(`${tag}: verify: ${jobs[j].name} before release`);
    for (const p of preds[j]) if (start[j] < end[p]) FATAL(`${tag}: verify: precedence violated`);
  }
  for (let k = 0; k < nM; k++) {
    const on = jobs.map((j, i) => i).filter((i) => mach[i] === k)
      .sort((a, b) => start[a] - start[b]);
    for (let i = 1; i < on.length; i++) {
      if (start[on[i]] < end[on[i - 1]]) FATAL(`${tag}: verify: overlap on ${machines[k]}`);
    }
  }
  let ms = 0;
  for (let i = 0; i < n; i++) ms = Math.max(ms, end[i]);
  if (ms !== bestMs) FATAL(`${tag}: verify: makespan mismatch`);

  const answer = `${bestMs}:` + best.seq.map(([s, nm]) => `${nm}@${s}`).join(",");
  checkFormat(tag, answer, /^\d+:[A-Za-z0-9]+@\d+(,[A-Za-z0-9]+@\d+)*$/);
  diag(`${tag}: jobs=${n} machines=${nM} makespan=${bestMs} nodes=${nodes}`);
  return answer;
}

// ---------------------------------------------------------------------------
// Format 2: single machine, releases, sequence-dependent setups, min makespan
// ---------------------------------------------------------------------------
function solveSingleSetup(text) {
  const tag = "singlesetup";
  const jobs = [];
  const jre = /^([A-Za-z]+): duration=(-?\d+), release=(-?\d+)\s*$/gm;
  let m;
  while ((m = jre.exec(text))) jobs.push({ name: m[1], dur: +m[2], release: +m[3] });
  if (!jobs.length) FATAL(`${tag}: no jobs parsed`);
  // KA5 fix: durations/releases widened to (-?\d+); negative values FATAL loudly.
  assertNonNegative(jobs.map((j) => j.dur), "duration");
  assertNonNegative(jobs.map((j) => j.release), "release");
  const n = jobs.length;
  const setup = new Map();
  const sre = /([A-Za-z]+)->([A-Za-z]+): (\d+)/g;
  while ((m = sre.exec(text))) setup.set(`${m[1]}>${m[2]}`, +m[3]);
  const st = (a, b) => (a < 0 ? 0 : setup.get(`${jobs[a].name}>${jobs[b].name}`) || 0);

  const N = 1 << n;
  const dp = new Float64Array(N * n).fill(Infinity);
  for (let i = 0; i < n; i++) dp[((1 << i) * n) + i] = jobs[i].release + jobs[i].dur;
  for (let mask = 1; mask < N; mask++) {
    for (let last = 0; last < n; last++) {
      if (!(mask & (1 << last))) continue;
      const cur = dp[mask * n + last];
      if (!isFinite(cur)) continue;
      for (let j = 0; j < n; j++) {
        if (mask & (1 << j)) continue;
        const c = Math.max(jobs[j].release, cur + st(last, j)) + jobs[j].dur;
        const nmask = mask | (1 << j);
        if (c < dp[nmask * n + j]) dp[nmask * n + j] = c;
      }
    }
  }
  let Mstar = Infinity;
  for (let l = 0; l < n; l++) Mstar = Math.min(Mstar, dp[(N - 1) * n + l]);
  if (!isFinite(Mstar)) FATAL(`${tag}: infeasible`);

  // Feasibility oracle: min completion of remMask starting from (t,last) <= Mstar?
  const fbuf = new Float64Array(N * n);
  function feasible(remMask, t, last) {
    if (remMask === 0) return t; // nothing left: completion is current time
    fbuf.fill(Infinity);
    for (let i = 0; i < n; i++) {
      if (remMask & (1 << i)) {
        fbuf[((1 << i) * n) + i] = Math.max(jobs[i].release, t + st(last, i)) + jobs[i].dur;
      }
    }
    for (let sub = 1; sub < N; sub++) {
      if (sub & ~remMask) continue;
      for (let l = 0; l < n; l++) {
        if (!(sub & (1 << l))) continue;
        const cur = fbuf[sub * n + l];
        if (!isFinite(cur)) continue;
        for (let j = 0; j < n; j++) {
          if (!(remMask & (1 << j)) || sub & (1 << j)) continue;
          const c = Math.max(jobs[j].release, cur + st(l, j)) + jobs[j].dur;
          const ns = sub | (1 << j);
          if (c < fbuf[ns * n + j]) fbuf[ns * n + j] = c;
        }
      }
    }
    let b = Infinity;
    for (let l = 0; l < n; l++) b = Math.min(b, fbuf[remMask * n + l]);
    return b <= Mstar;
  }

  // ── Tie-break precedence (Pass³ regression fix) ──
  // An explicit prompt-stated tie-break rule takes precedence over the Mode 18
  // canonical (WL structural) tie-break. Canonical is only the fallback when
  // the prompt states no tie-break rule.
  const tb = detectTieBreak(text);
  const useStartName = tb.stated && isStartNameRule(tb.rule);
  if (tb.stated) diag(`${tag}: prompt states tie-break "${tb.rule}" -> ${useStartName ? "honoring (start,name)" : "canonical fallback"}`);

  // ── Mode 18 canonical tie-break (fallback) ──
  // Label jobs by pure structure (WL refinement on duration, release, and the
  // setup-time matrix). Used for tie-breaking only when the prompt states no
  // tie-break rule (see precedence guard above); otherwise the prompt's rule
  // wins. Colors are structural; same-colored jobs are symmetric (any choice
  // among them yields automorphic schedules).
  const wlabels = canonicalLabel(jobs.map((jb, i) => ({
    id: jb.name,
    attrs: { dur: jb.dur, release: jb.release },
    out: jobs.filter((_, k) => k !== i).map((o) => ({ to: o.name, attrs: { st: st(i, jobs.indexOf(o)) } })),
    in: jobs.filter((_, k) => k !== i).map((o) => ({ from: o.name, attrs: { st: st(jobs.indexOf(o), i) } })),
  })));
  const colorOf = (j) => wlabels.get(jobs[j].name).color;

  // Greedy left-to-right: lexicographically smallest sequence by the applicable
  // tie-break key — (start, name) when the prompt states it, else canonical
  // (start, color) for rename-invariance.
  let remMask = N - 1, t = 0, last = -1;
  const order = [];
  for (let step = 0; step < n; step++) {
    const cands = [];
    for (let j = 0; j < n; j++) {
      if (remMask & (1 << j)) {
        const s = last < 0 ? jobs[j].release : Math.max(jobs[j].release, t + st(last, j));
        cands.push([s, colorOf(j), jobs[j].name, j]);
      }
    }
    cands.sort((a, b) => a[0] - b[0] || (useStartName ? 0 : a[1] - b[1]) || (a[2] < b[2] ? -1 : 1));
    let pick = null;
    for (const [s, , , j] of cands) {
      if (feasible(remMask ^ (1 << j), s + jobs[j].dur, j)) { pick = [s, j]; break; }
    }
    if (!pick) FATAL(`${tag}: tie-break greedy failed (no feasible next job)`);
    const [s, j] = pick;
    order.push({ name: jobs[j].name, start: s, color: colorOf(j) });
    t = s + jobs[j].dur; last = j; remMask ^= 1 << j;
  }

  // ---- self-verification ----
  let vt = 0, vlast = -1;
  for (const o of order) {
    const j = jobs.findIndex((x) => x.name === o.name);
    const es = vlast < 0 ? jobs[j].release : Math.max(jobs[j].release, vt + st(vlast, j));
    if (es !== o.start) FATAL(`${tag}: verify: start mismatch for ${o.name}`);
    vt = o.start + jobs[j].dur; vlast = j;
  }
  if (vt !== Mstar) FATAL(`${tag}: verify: makespan ${vt} != optimal ${Mstar}`);
  for (let i = 1; i < order.length; i++) {
    if (order[i].start <= order[i - 1].start) FATAL(`${tag}: verify: starts not increasing`);
  }

  // Serialization order: by job name when the prompt states a (start,name)
  // tie-break (matches the bank's name-ordered convention for this format),
  // else canonical (start, color, name) for rename-invariance (Mode 18 fallback).
  const answer = `${Mstar}:` + order
    .map((o) => o)
    .sort((a, b) => useStartName ? (a.name < b.name ? -1 : 1)
                                 : (a.start - b.start || a.color - b.color || (a.name < b.name ? -1 : 1)))
    .map((o) => `${o.name}@${o.start}`).join(",");
  checkFormat(tag, answer, /^\d+:[A-Za-z0-9]+@\d+(,[A-Za-z0-9]+@\d+)*$/);
  diag(`${tag}: jobs=${n} makespan=${Mstar}`);
  return answer;
}

// ---------------------------------------------------------------------------
// Format 3: shift assignment — skills, max shifts, no consecutive days,
//           minimize max shifts per worker; tie-break: lexicographic S01..S24
// ---------------------------------------------------------------------------
function solveShifts(text) {
  const tag = "shifts";
  const workers = [];
  const wre = /^(\w+): skills=\[([^\]]*)\], max_shifts=(\d+)\s*$/gm;
  let m;
  while ((m = wre.exec(text))) {
    workers.push({
      name: m[1],
      skills: [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]),
      max: +m[3],
    });
  }
  if (!workers.length) FATAL(`${tag}: no workers parsed`);
  const shifts = [];
  const sre = /^([A-Za-z0-9]+): needs (\w+), day (\d+)\s*$/gm;
  while ((m = sre.exec(text))) shifts.push({ id: m[1], skill: m[2], day: +m[3] });
  if (!shifts.length) FATAL(`${tag}: no shifts parsed`);
  shifts.sort((a, b) => (a.id < b.id ? -1 : 1));
  const nW = workers.length, nS = shifts.length;
  const skillW = shifts.map((sh) =>
    workers.map((w, i) => (w.skills.includes(sh.skill) ? i : -1)).filter((i) => i >= 0)
  );
  for (let i = 0; i < nS; i++) {
    if (!skillW[i].length) FATAL(`${tag}: shift ${shifts[i].id} has no skilled worker`);
  }
  const withSkill = {};
  for (const sk of new Set(shifts.map((s) => s.skill))) {
    withSkill[sk] = workers.map((w, i) => (w.skills.includes(sk) ? i : -1)).filter((i) => i >= 0);
  }

  let fNodes = 0;
  // Feasibility of completing `fixed` (array of worker idx / -1) with per-worker cap T.
  function feasible(T, fixed) {
    const assign = fixed.slice();
    const used = new Array(nW).fill(0);
    const days = workers.map(() => new Set());
    const cap = workers.map((w) => Math.min(w.max, T));
    for (let i = 0; i < nS; i++) {
      if (assign[i] < 0) continue;
      const w = assign[i];
      if (!workers[w].skills.includes(shifts[i].skill)) return false;
      if (++used[w] > cap[w]) return false;
      for (const dd of days[w]) if (Math.abs(dd - shifts[i].day) === 1) return false;
      days[w].add(shifts[i].day);
    }
    const remSkill = {};
    for (let i = 0; i < nS; i++) {
      if (assign[i] < 0) remSkill[shifts[i].skill] = (remSkill[shifts[i].skill] || 0) + 1;
    }
    function candList(i) {
      const d = shifts[i].day;
      const out = [];
      for (const w of skillW[i]) {
        if (used[w] >= cap[w]) continue;
        let ok = true;
        for (const dd of days[w]) if (Math.abs(dd - d) === 1) { ok = false; break; }
        if (ok) out.push(w);
      }
      return out;
    }
    function dfs() {
      if (++fNodes > 20_000_000) FATAL(`${tag}: feasibility budget exceeded`);
      // counting bound per skill (sound)
      for (const sk of Object.keys(remSkill)) {
        if (!remSkill[sk]) continue;
        let avail = 0;
        for (const w of withSkill[sk]) avail += cap[w] - used[w];
        if (remSkill[sk] > avail) return false;
      }
      let bi = -1, bc = null;
      for (let i = 0; i < nS; i++) {
        if (assign[i] >= 0) continue;
        const c = candList(i);
        if (!c.length) return false;
        if (!bc || c.length < bc.length) { bc = c; bi = i; if (c.length === 1) break; }
      }
      if (bi < 0) return true;
      remSkill[shifts[bi].skill]--;
      for (const w of bc) {
        assign[bi] = w; used[w]++; days[w].add(shifts[bi].day);
        if (dfs()) return true;
        assign[bi] = -1; used[w]--; days[w].delete(shifts[bi].day);
      }
      remSkill[shifts[bi].skill]++;
      return false;
    }
    return dfs();
  }

  const empty = new Array(nS).fill(-1);
  const skillCount = {};
  for (const sh of shifts) skillCount[sh.skill] = (skillCount[sh.skill] || 0) + 1;
  let lower = Math.ceil(nS / nW);
  for (const sk of Object.keys(skillCount)) {
    lower = Math.max(lower, Math.ceil(skillCount[sk] / withSkill[sk].length));
  }
  const maxMax = Math.max(...workers.map((w) => w.max));
  let Tstar = -1;
  for (let T = lower; T <= maxMax; T++) {
    fNodes = 0;
    if (feasible(T, empty)) { Tstar = T; break; }
  }
  if (Tstar < 0) FATAL(`${tag}: no feasible assignment at any T`);

  // Greedy: lexicographically smallest (S01..S24) worker-name sequence.
  const assign = new Array(nS).fill(-1);
  const nameOf = (w) => workers[w].name;
  for (let i = 0; i < nS; i++) {
    const cands = skillW[i].slice().sort((a, b) => (nameOf(a) < nameOf(b) ? -1 : 1));
    let pick = -1;
    for (const w of cands) {
      assign[i] = w;
      fNodes = 0;
      if (feasible(Tstar, assign)) { pick = w; break; }
      assign[i] = -1;
    }
    if (pick < 0) FATAL(`${tag}: tie-break greedy failed at ${shifts[i].id}`);
  }

  // ---- self-verification ----
  const used = new Array(nW).fill(0);
  const days = workers.map(() => new Set());
  for (let i = 0; i < nS; i++) {
    const w = assign[i];
    if (w < 0) FATAL(`${tag}: verify: ${shifts[i].id} unassigned`);
    if (!workers[w].skills.includes(shifts[i].skill)) FATAL(`${tag}: verify: skill violated`);
    used[w]++;
    for (const dd of days[w]) {
      if (Math.abs(dd - shifts[i].day) === 1) FATAL(`${tag}: verify: consecutive days for ${workers[w].name}`);
    }
    days[w].add(shifts[i].day);
  }
  let mx = 0;
  for (let w = 0; w < nW; w++) {
    if (used[w] > workers[w].max) FATAL(`${tag}: verify: max_shifts exceeded`);
    mx = Math.max(mx, used[w]);
  }
  if (mx !== Tstar) FATAL(`${tag}: verify: max load ${mx} != Tstar ${Tstar}`);

  const answer = shifts.map((sh, i) => `${sh.id}=${workers[assign[i]].name}`).join(",");
  checkFormat(tag, answer, /^[A-Za-z0-9]+=[A-Za-z0-9]+(,[A-Za-z0-9]+=[A-Za-z0-9]+)*$/);
  diag(`${tag}: shifts=${nS} workers=${nW} minMaxShifts=${Tstar}`);
  return answer;
}

// ---------------------------------------------------------------------------
// Format 4: identical machines with duration caps, min makespan.
// Makespan is constant (= total/caps) on feasible schedules; the work is the
// tie-break: lexicographically smallest sorted (start, name) sequence.
// Exact method: enumerate set partitions (restricted growth) x per-machine
// permutations; all feasible schedules have no idle (load == cap), so this is
// complete. Fused k-way merge + incremental lexicographic compare.
// ---------------------------------------------------------------------------
function solveCaps(text) {
  const tag = "caps";
  const jobs = [];
  const jre = /^([A-Za-z0-9]+): duration=(-?\d+)\s*$/gm;
  let m;
  while ((m = jre.exec(text))) jobs.push({ name: m[1], dur: +m[2] });
  if (!jobs.length) FATAL(`${tag}: no jobs parsed`);
  // KA5 fix: durations widened to (-?\d+); negative values FATAL loudly.
  assertNonNegative(jobs.map((j) => j.dur), "duration");
  const n = jobs.length;
  let machines = [];
  const ml = /(\d+) machines? (M\d+(?:\/M\d+)*)/.exec(text);
  if (ml) machines = ml[2].split("/");
  const caps = {};
  const cre = /\b(M\d+)\s*<=\s*(\d+)/g;
  while ((m = cre.exec(text))) caps[m[1]] = +m[2];
  if (!machines.length) machines = Object.keys(caps).sort();
  if (!machines.length) FATAL(`${tag}: no machines parsed`);
  const nM = machines.length;
  const cap = machines.map((x) => {
    if (caps[x] === undefined) FATAL(`${tag}: no cap for ${x}`);
    return caps[x];
  });
  const dur = jobs.map((j) => j.dur);

  let bestSeq = null;
  let bestDetail = null;
  let evals = 0;

  // Fused k-way merge with incremental lexicographic compare vs bestSeq.
  // machSeqs[k] = sorted [(start,name)] list for machine k. Returns true if better.
  function isBetter(machSeqs) {
    const ptrs = new Array(nM).fill(0);
    for (let pos = 0; pos < n; pos++) {
      let bv = null, bi = -1;
      for (let k = 0; k < nM; k++) {
        if (ptrs[k] >= machSeqs[k].length) continue;
        const e = machSeqs[k][ptrs[k]];
        if (!bv || e[0] < bv[0] || (e[0] === bv[0] && e[1] < bv[1])) { bv = e; bi = k; }
      }
      if (!bv) FATAL(`${tag}: merge underflow`);
      const c = cmpPair(bv, bestSeq[pos]);
      if (c > 0) return false;
      if (c < 0) return true;
      ptrs[bi]++;
    }
    return false; // equal: not better
  }

  function evaluate(groups, loads) {
    evals++;
    const machSeqs = [];
    const machPerms = [];
    for (let k = 0; k < nM; k++) {
      const seqs = [];
      const perms = [];
      for (const p of allPerms(groups[k])) {
        let t = 0;
        seqs.push(p.map((j) => { const e = [t, jobs[j].name]; t += dur[j]; return e; }));
        perms.push(p);
      }
      machSeqs.push(seqs);
      machPerms.push(perms);
    }
    if (!bestSeq) {
      // seed with the first combination
      const first = machSeqs.map((s) => s[0]);
      const ptrs = new Array(nM).fill(0);
      const merged = [];
      for (let pos = 0; pos < n; pos++) {
        let bv = null, bi = -1;
        for (let k = 0; k < nM; k++) {
          if (ptrs[k] >= first[k].length) continue;
          const e = first[k][ptrs[k]];
          if (!bv || e[0] < bv[0] || (e[0] === bv[0] && e[1] < bv[1])) { bv = e; bi = k; }
        }
        merged.push(bv); ptrs[bi]++;
      }
      bestSeq = merged;
      bestDetail = { groups: groups.map((g) => g.slice()), perms: machPerms.map((p) => p[0]) };
      return;
    }
    // product over per-machine permutations with fused compare
    const idx = new Array(nM).fill(0);
    const chosen = new Array(nM);
    function prod(k) {
      if (k === nM) {
        if (isBetter(chosen)) {
          // materialize best sequence + detail
          const ptrs = new Array(nM).fill(0);
          const merged = [];
          const det = [];
          for (let kk = 0; kk < nM; kk++) det.push(machPerms[kk][idx[kk]]);
          for (let pos = 0; pos < n; pos++) {
            let bv = null, bi = -1;
            for (let kk = 0; kk < nM; kk++) {
              if (ptrs[kk] >= chosen[kk].length) continue;
              const e = chosen[kk][ptrs[kk]];
              if (!bv || e[0] < bv[0] || (e[0] === bv[0] && e[1] < bv[1])) { bv = e; bi = kk; }
            }
            merged.push(bv); ptrs[bi]++;
          }
          bestSeq = merged;
          bestDetail = { groups: groups.map((g) => g.slice()), perms: det };
        }
        return;
      }
      for (let i = 0; i < machSeqs[k].length; i++) {
        idx[k] = i; chosen[k] = machSeqs[k][i];
        prod(k + 1);
      }
    }
    prod(0);
  }

  const loads = new Array(nM).fill(0);
  const groups = machines.map(() => []);
  (function rec(i, maxUsed) {
    if (i === n) { evaluate(groups, loads); return; }
    for (let g = 0; g <= Math.min(nM - 1, maxUsed + 1); g++) {
      if (loads[g] + dur[i] <= cap[g]) {
        loads[g] += dur[i]; groups[g].push(i);
        rec(i + 1, Math.max(maxUsed, g));
        groups[g].pop(); loads[g] -= dur[i];
      }
    }
  })(0, -1);
  if (!bestSeq) FATAL(`${tag}: no feasible assignment`);

  // ---- self-verification ----
  const { groups: bg, perms: bp } = bestDetail;
  const seen = new Set();
  let ms = 0;
  const startOf = new Map();
  for (let k = 0; k < nM; k++) {
    let t = 0, load = 0;
    for (const j of bp[k]) {
      if (seen.has(j)) FATAL(`${tag}: verify: job twice`);
      seen.add(j);
      startOf.set(j, t);
      t += dur[j]; load += dur[j];
    }
    if (load > cap[k]) FATAL(`${tag}: verify: cap exceeded on ${machines[k]}`);
    ms = Math.max(ms, t);
  }
  if (seen.size !== n) FATAL(`${tag}: verify: job missing`);
  for (let pos = 0; pos < n; pos++) {
    const [s, nm] = bestSeq[pos];
    const j = jobs.findIndex((x) => x.name === nm);
    if (startOf.get(j) !== s) FATAL(`${tag}: verify: start mismatch for ${nm}`);
    if (pos > 0 && cmpPair(bestSeq[pos - 1], bestSeq[pos]) > 0) FATAL(`${tag}: verify: not sorted`);
  }

  const answer = `${ms}:` + bestSeq.map(([s, nm]) => `${nm}@${s}`).join(",");
  checkFormat(tag, answer, /^\d+:[A-Za-z0-9]+@\d+(,[A-Za-z0-9]+@\d+)*$/);
  diag(`${tag}: jobs=${n} machines=${nM} makespan=${ms} assignments_evaluated=${evals}`);
  return answer;
}

// ---------------------------------------------------------------------------
// Format 5: single machine, deadlines, maintenance windows, setups;
//           minimize max lateness floored at 0.
//           Tie-break: lexicographically smallest sorted (completion, name).
//           Answer @ = completion time.
// ---------------------------------------------------------------------------
function solveLateness(text) {
  const tag = "lateness";
  const jobs = [];
  const jre = /^([A-Za-z0-9]+): duration=(-?\d+), deadline=(-?\d+)\s*$/gm;
  let m;
  while ((m = jre.exec(text))) jobs.push({ name: m[1], dur: +m[2], deadline: +m[3] });
  if (!jobs.length) FATAL(`${tag}: no jobs parsed`);
  // KA5 fix: durations/deadlines widened to (-?\d+); negative values FATAL loudly.
  assertNonNegative(jobs.map((j) => j.dur), "duration");
  assertNonNegative(jobs.map((j) => j.deadline), "deadline");
  const n = jobs.length;
  const wins = [];
  const wre = /\[(\d+),(\d+)\)/g;
  while ((m = wre.exec(text))) wins.push([+m[1], +m[2]]);
  wins.sort((a, b) => a[0] - b[0]);
  // E6-7: domain invariant — windows require a < b (T11: inverted window is
  // silently inert, not "no window").
  for (const [a, b] of wins) assertInterval(a, b, "maintenance window");
  const setup = new Map();
  const sre = /([A-Za-z0-9]+)->([A-Za-z0-9]+): (\d+)/g;
  while ((m = sre.exec(text))) setup.set(`${m[1]}>${m[2]}`, +m[3]);
  const st = (a, b) => (a < 0 ? 0 : setup.get(`${jobs[a].name}>${jobs[b].name}`) || 0);
  // earliest start >= t0 whose [t, t+dur) is disjoint from all windows
  const mstart = (t0, dur) => {
    let t = t0;
    for (const [a, b] of wins) if (t < b && t + dur > a) t = b;
    return t;
  };

  const N = 1 << n;
  const fbuf = new Float64Array(N * n);
  // Min completion of remMask from (t0,last) with every job's lateness <= T;
  // Infinity if impossible. (max(0,c-d) <= T  <=>  c-d <= T for T>=0.)
  function feasMin(T, remMask, t0, last) {
    if (remMask === 0) return t0; // nothing left: completion is current time
    fbuf.fill(Infinity);
    for (let i = 0; i < n; i++) {
      if (remMask & (1 << i)) {
        const c = mstart(t0 + st(last, i), jobs[i].dur) + jobs[i].dur;
        if (c - jobs[i].deadline <= T) fbuf[((1 << i) * n) + i] = c;
      }
    }
    for (let sub = 1; sub < N; sub++) {
      if (sub & ~remMask) continue;
      for (let l = 0; l < n; l++) {
        if (!(sub & (1 << l))) continue;
        const cur = fbuf[sub * n + l];
        if (!isFinite(cur)) continue;
        for (let j = 0; j < n; j++) {
          if (!(remMask & (1 << j)) || sub & (1 << j)) continue;
          const c = mstart(cur + st(l, j), jobs[j].dur) + jobs[j].dur;
          if (c - jobs[j].deadline > T) continue;
          const ns = sub | (1 << j);
          if (c < fbuf[ns * n + j]) fbuf[ns * n + j] = c;
        }
      }
    }
    let b = Infinity;
    for (let l = 0; l < n; l++) b = Math.min(b, fbuf[remMask * n + l]);
    return b;
  }

  let Tstar = 0;
  while (!isFinite(feasMin(Tstar, N - 1, 0, -1))) {
    if (++Tstar > 100000) FATAL(`${tag}: Tstar runaway`);
  }

  // Greedy: lexicographically smallest sorted (completion, name) sequence.
  let rem = N - 1, t = 0, last = -1;
  const order = [];
  for (let step = 0; step < n; step++) {
    const cands = [];
    for (let j = 0; j < n; j++) {
      if (rem & (1 << j)) {
        const s = mstart(t + st(last, j), jobs[j].dur);
        const c = s + jobs[j].dur;
        if (c - jobs[j].deadline <= Tstar) cands.push([c, jobs[j].name, j, s]);
      }
    }
    cands.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1));
    let pick = null;
    for (const [c, , j, s] of cands) {
      if (isFinite(feasMin(Tstar, rem ^ (1 << j), c, j))) { pick = [j, s, c]; break; }
    }
    if (!pick) FATAL(`${tag}: tie-break greedy failed (no feasible next job)`);
    const [j, s, c] = pick;
    order.push({ name: jobs[j].name, start: s, comp: c });
    t = c; last = j; rem ^= 1 << j;
  }

  // ---- self-verification ----
  let vt = 0, vlast = -1, vmax = 0;
  for (const o of order) {
    const j = jobs.findIndex((x) => x.name === o.name);
    const es = mstart(vt + st(vlast, j), jobs[j].dur);
    if (es !== o.start) FATAL(`${tag}: verify: start mismatch for ${o.name}`);
    for (const [a, b] of wins) {
      if (o.start < b && o.start + jobs[j].dur > a) FATAL(`${tag}: verify: ${o.name} spans a window`);
    }
    const c = o.start + jobs[j].dur;
    if (c !== o.comp) FATAL(`${tag}: verify: completion mismatch for ${o.name}`);
    vmax = Math.max(vmax, Math.max(0, c - jobs[j].deadline));
    vt = c; vlast = j;
  }
  if (vmax !== Tstar) FATAL(`${tag}: verify: max lateness ${vmax} != Tstar ${Tstar}`);
  for (let i = 1; i < order.length; i++) {
    if (cmpPair([order[i - 1].comp, order[i - 1].name], [order[i].comp, order[i].name]) > 0) {
      FATAL(`${tag}: verify: not sorted by (completion,name)`);
    }
  }

  const answer = `${Tstar}:` + order.map((o) => `${o.name}@${o.comp}`).join(",");
  checkFormat(tag, answer, /^\d+:[A-Za-z0-9]+@\d+(,[A-Za-z0-9]+@\d+)*$/);
  diag(`${tag}: jobs=${n} minMaxLateness=${Tstar}`);
  return answer;
}

// ---------------------------------------------------------------------------
// Format 6: 2-stage flow shop, min makespan; tie-break: lexicographically
//           smallest job order. DP bitmask + greedy with feasibility oracle.
// ---------------------------------------------------------------------------
function solveFlowShop(text) {
  const tag = "flowshop";
  const jobs = [];
  const jre = /^([A-Za-z0-9]+): stage1=(\d+), stage2=(\d+)\s*$/gm;
  let m;
  while ((m = jre.exec(text))) jobs.push({ name: m[1], p1: +m[2], p2: +m[3] });
  if (!jobs.length) FATAL(`${tag}: no jobs parsed`);
  const n = jobs.length;
  const N = 1 << n;
  const sum1 = new Float64Array(N);
  for (let mask = 1; mask < N; mask++) {
    const b = mask & -mask;
    const i = 31 - Math.clz32(b);
    sum1[mask] = sum1[mask ^ b] + jobs[i].p1;
  }
  const dp = new Float64Array(N).fill(Infinity);
  dp[0] = 0;
  for (let mask = 0; mask < N; mask++) {
    if (!isFinite(dp[mask])) continue;
    for (let j = 0; j < n; j++) {
      if (mask & (1 << j)) continue;
      const c1 = sum1[mask] + jobs[j].p1;
      const c2 = Math.max(dp[mask], c1) + jobs[j].p2;
      const nm = mask | (1 << j);
      if (c2 < dp[nm]) dp[nm] = c2;
    }
  }
  const Mstar = dp[N - 1];
  if (!isFinite(Mstar)) FATAL(`${tag}: infeasible`);

  // Min achievable final stage-2 completion for remMask from (t1,t2).
  const fbuf = new Float64Array(N);
  function feasMin(remMask, t1, t2) {
    fbuf.fill(Infinity);
    fbuf[0] = t2;
    for (let sub = 1; sub < N; sub++) {
      if (sub & ~remMask) continue;
      for (let j = 0; j < n; j++) {
        if (!(sub & (1 << j))) continue;
        const prev = sub ^ (1 << j);
        const pc = fbuf[prev];
        if (!isFinite(pc)) continue;
        const c1 = t1 + sum1[sub];
        const c2 = Math.max(pc, c1) + jobs[j].p2;
        if (c2 < fbuf[sub]) fbuf[sub] = c2;
      }
    }
    return fbuf[remMask];
  }

  // Greedy: lexicographically smallest job order among Mstar-optimal.
  let rem = N - 1, t1 = 0, t2 = 0;
  const order = [];
  for (let step = 0; step < n; step++) {
    const cands = [];
    for (let j = 0; j < n; j++) if (rem & (1 << j)) cands.push(j);
    cands.sort((a, b) => (jobs[a].name < jobs[b].name ? -1 : 1));
    let pick = -1, pc1 = 0, pc2 = 0;
    for (const j of cands) {
      const c1 = t1 + jobs[j].p1;
      const c2 = Math.max(t2, c1) + jobs[j].p2;
      if (feasMin(rem ^ (1 << j), c1, c2) <= Mstar) { pick = j; pc1 = c1; pc2 = c2; break; }
    }
    if (pick < 0) FATAL(`${tag}: tie-break greedy failed`);
    order.push(jobs[pick].name);
    t1 = pc1; t2 = pc2; rem ^= 1 << pick;
  }

  // ---- self-verification ----
  let v1 = 0, v2 = 0;
  const seen = new Set();
  for (const nm of order) {
    if (seen.has(nm)) FATAL(`${tag}: verify: duplicate job`);
    seen.add(nm);
    const j = jobs.findIndex((x) => x.name === nm);
    v1 += jobs[j].p1;
    v2 = Math.max(v2, v1) + jobs[j].p2;
  }
  if (seen.size !== n) FATAL(`${tag}: verify: job missing`);
  if (v2 !== Mstar) FATAL(`${tag}: verify: makespan ${v2} != optimal ${Mstar}`);

  const answer = `${Mstar}:` + order.join(",");
  checkFormat(tag, answer, /^\d+:[A-Za-z0-9]+(,[A-Za-z0-9]+)*$/);
  diag(`${tag}: jobs=${n} makespan=${Mstar}`);
  return answer;
}

// ---------------------------------------------------------------------------
// Detection + main
// ---------------------------------------------------------------------------
function detect(text) {
  if (/2-stage flow shop/.test(text)) return ["flowshop", solveFlowShop];
  if (/Assign every shift to a worker/.test(text)) return ["shifts", solveShifts];
  if (/maximum lateness/.test(text)) return ["lateness", solveLateness];
  if (/capacity caps/.test(text)) return ["caps", solveCaps];
  if (/Sequence-dependent setup/.test(text)) return ["singlesetup", solveSingleSetup];
  if (/eligible machines/.test(text)) return ["multimachine", solveMultiMachine];
  FATAL("unrecognized v9 scheduling prompt format");
  return null;
}

const args = parseArgs(process.argv.slice(2));
const text = readFileSync(args.prompt, "utf8");
const [tag, solver] = detect(text);
diag(`format detected: ${tag}`);
const t0 = Date.now();
const answer = solver(text);
diag(`solved in ${Date.now() - t0}ms`);
process.stdout.write(answer + "\n");
