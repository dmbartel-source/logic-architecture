#!/usr/bin/env node
// solvers/solve-select-v9.mjs — v9 constrained-selection solver.
//
// PAL-style: parse prompt -> branch-and-bound subset search -> self-verify ->
// print answer. Handles v9-select-001..006 and v9-elide-003.
//
// Usage: node solve-select-v9.mjs --prompt <prompt.txt>
//   stdout: exactly one line, '<score>:<name1,name2,...>' (names sorted).
//   stderr: diagnostics only.
//   Any parse gap or self-verification failure is FATAL (exit 1): the solver
//   never prints an unverified answer (v1.8 §5 mode 17: fail loudly, never
//   silently drop a constraint).
//
// Two historical silent-drop bugs fixed here (both were mode-17 failures where
// the solver printed an INFEASIBLE answer with exit 0):
//   - 002: role pairs were parsed only from "(rN,rM)" parenthesized form, so the
//     unparenthesized "covering r1 must equal the number covering r2" pair was
//     silently dropped. Now all 5 pairs are parsed and the count is asserted.
//   - 006: flag quotas were parsed with /at least (\d+) ([a-e])/g, which only
//     matched the first quota ("at least 3 a") because the rest ("3 b, 2 c, ...")
//     do not repeat the words "at least". Now the whole quota list is parsed
//     and the count (5) is asserted.
//
// Every variant now asserts parsed-constraint counts against the prompt's
// stated structure AND re-verifies the winning subset against every parsed
// constraint before printing.

import { readFileSync } from "node:fs";

function fatal(msg) {
  console.error(`FATAL: ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else fatal(`unknown argument: ${argv[i]}`);
  }
  if (!args.prompt) fatal("usage: node solve-select-v9.mjs --prompt <prompt.txt>");
  return args;
}

// "A: value=42, weight=8, flags=['x']" | "c01: score=88, roles=['r1','r2']"
// "K01: value=23, weight=6, family=F2" | "M01: value=28, flags=['a']"
function parseItems(text) {
  const items = [];
  const re = /^([A-Za-z]+\d*):\s*(?:value|score)=(\d+)(?:,\s*weight=(\d+))?(?:,\s*flags=\[([^\]]*)\])?(?:,\s*roles=\[([^\]]*)\])?(?:,\s*family=(\w+))?/gm;
  let m;
  const list = (s) => s ? s.split(",").map((x) => x.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean) : [];
  while ((m = re.exec(text)) !== null) {
    items.push({
      name: m[1],
      value: +m[2],
      weight: m[3] !== undefined ? +m[3] : 0,
      flags: list(m[4]),
      roles: list(m[5]),
      family: m[6] || null,
    });
  }
  return items;
}

// Lexicographic compare of sorted name lists (tuple semantics, §5 mode 14).
function lexCompare(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return a.length - b.length;
}

function assertSorted(names, tag) {
  const s = [...names].sort();
  if (s.join(",") !== names.join(",")) fatal(`${tag}: solution names not sorted`);
}

// ── Generic branch-and-bound (used by 004) ───────────────────────────
// maximize over subsets; `spec` provides:
//   canTake(item, sel): incremental feasibility (false prunes the take-branch)
//   leafScore(sel): {score, raw} or null if infeasible at leaf
//   maxBonusFactor: loosen the value bound for bonus objectives (default 0)
function branchAndBound(items, spec) {
  const order = [...items].sort((a, b) => (b.value / Math.max(b.weight, 1)) - (a.value / Math.max(a.weight, 1)) || b.value - a.value);
  const remSum = new Array(order.length + 1).fill(0);
  for (let i = order.length - 1; i >= 0; i--) remSum[i] = remSum[i + 1] + order[i].value;

  let best = null;
  const sel = [];

  // Greedy incumbent for a strong initial bound.
  {
    const g = [];
    for (const it of order) { g.push(it); if (spec.canTake && spec.canTake(it, g) === false) g.pop(); }
    const gs = spec.leafScore(g);
    if (gs) best = { score: gs.score, raw: gs.raw, names: g.map((x) => x.name).sort() };
  }

  const isBetter = (score, raw, names) => {
    if (!best) return true;
    if (score !== best.score) return score > best.score;
    if (spec.tiebreakRaw && raw !== best.raw) return raw > best.raw;
    return lexCompare(names, best.names) < 0;
  };

  function dfs(i, curValue) {
    // Bound prune (strict <: equal scores may still win on tie-break).
    const maxBonus = spec.maxBonusFactor || 0;
    if (best && curValue + remSum[i] < best.score / (1 + maxBonus)) return;
    if (i === order.length) {
      const s = spec.leafScore(sel);
      if (s) {
        const names = sel.map((x) => x.name).sort();
        if (isBetter(s.score, s.raw, names)) best = { score: s.score, raw: s.raw, names };
      }
      return;
    }
    const it = order[i];
    sel.push(it);
    if (spec.canTake(it, sel) !== false) dfs(i + 1, curValue + it.value);
    sel.pop();
    dfs(i + 1, curValue);
  }
  dfs(0, 0);
  return best;
}

// ══ Variant 001: 26-item 6-resource knapsack + implications + quotas ══
function parse001(text) {
  const items = parseItems(text);
  if (items.length !== 26) fatal(`001: parsed ${items.length} items, expected 26`);
  const names = new Set(items.map((x) => x.name));
  const caps = {};
  for (const m of text.matchAll(/\b(r\d+)<=(\d+)/g)) caps[m[1]] = +m[2];
  const res = Object.keys(caps).sort();
  if (res.length !== 6) fatal(`001: parsed ${res.length} resources, expected 6`);
  const usage = {};
  for (const m of text.matchAll(/^([A-Za-z]+\d*):\s*((?:r\d+=\d+(?:,\s*)?)+)/gm)) {
    const u = {};
    for (const kv of m[2].split(",")) {
      const [k, v] = kv.split("=").map((s) => s.trim());
      u[k] = +v;
    }
    usage[m[1]] = u;
  }
  for (const nm of names) {
    const u = usage[nm];
    if (!u || res.some((r) => !(r in u))) fatal(`001: incomplete resource usage for ${nm}`);
  }
  const seg = /Implications \(if left taken, right must be taken\): ([^.]+)\./.exec(text);
  if (!seg) fatal("001: implications segment not found");
  const impl = new Map();
  let nImpl = 0;
  for (const p of seg[1].split(";")) {
    const t = p.trim();
    if (!t) continue;
    const ab = t.split("->").map((s) => s.trim());
    if (ab.length !== 2 || !names.has(ab[0]) || !names.has(ab[1])) fatal(`001: bad implication '${t}'`);
    if (!impl.has(ab[0])) impl.set(ab[0], new Set());
    impl.get(ab[0]).add(ab[1]);
    nImpl++;
  }
  if (nImpl !== 16) fatal(`001: parsed ${nImpl} implications, expected 16`);
  const qseg = /Flag quotas: ([^.]+)\./.exec(text);
  if (!qseg) fatal("001: flag quota segment not found");
  const minQ = {};
  for (const part of qseg[1].split(";")[0].split(",")) {
    const m = /(\d+)\s+([A-Za-z])/.exec(part);
    if (m) minQ[m[2]] = +m[1];
  }
  for (const f of ["x", "y", "z", "w"]) if (!(f in minQ)) fatal(`001: missing min quota for flag '${f}'`);
  const maxM = /at most (\d+) of any flag/.exec(text);
  if (!maxM) fatal("001: max-per-flag quota not found");
  return { items, caps, res, usage, impl, minQ, maxFlag: +maxM[1] };
}

function solve001(P) {
  const { items, caps, res, usage, impl, minQ, maxFlag } = P;
  const order = items;
  const reqCache = new Map();
  for (const x of items) {
    const out = new Set();
    const stack = [x.name];
    while (stack.length) {
      const c = stack.pop();
      for (const b of impl.get(c) || []) if (!out.has(b)) { out.add(b); stack.push(b); }
    }
    reqCache.set(x.name, out);
  }
  const suf = new Array(order.length + 1).fill(0);
  for (let i = order.length - 1; i >= 0; i--) suf[i] = suf[i + 1] + order[i].value;
  const sufFlag = new Array(order.length + 1);
  sufFlag[order.length] = {};
  for (let i = order.length - 1; i >= 0; i--) {
    sufFlag[i] = { ...sufFlag[i + 1] };
    for (const f of order[i].flags) sufFlag[i][f] = (sufFlag[i][f] || 0) + 1;
  }
  let best = null;
  const taken = new Set(), skipped = new Set();
  const tot = {}, fc = {};
  const violates = () => {
    for (const r of res) if ((tot[r] || 0) > caps[r]) return true;
    for (const f of Object.keys(fc)) if (fc[f] > maxFlag) return true;
    return false;
  };
  function dfs(i, val) {
    if (best && val + suf[i] < best.score) return;
    for (const f of Object.keys(minQ)) {
      if ((fc[f] || 0) + (sufFlag[i][f] || 0) < minQ[f]) return;
    }
    if (i === order.length) {
      for (const f of Object.keys(minQ)) if ((fc[f] || 0) < minQ[f]) return;
      for (const a of taken) for (const b of impl.get(a) || []) if (!taken.has(b)) return;
      const nms = [...taken].sort();
      if (!best || val > best.score || (val === best.score && lexCompare(nms, best.names) < 0)) {
        best = { score: val, names: nms };
      }
      return;
    }
    const it = order[i];
    let okTake = true;
    for (const b of reqCache.get(it.name)) if (skipped.has(b)) { okTake = false; break; }
    if (okTake) {
      taken.add(it.name);
      for (const r of res) tot[r] = (tot[r] || 0) + usage[it.name][r];
      for (const f of it.flags) fc[f] = (fc[f] || 0) + 1;
      if (!violates()) dfs(i + 1, val + it.value);
      taken.delete(it.name);
      for (const r of res) tot[r] -= usage[it.name][r];
      for (const f of it.flags) fc[f] -= 1;
    }
    let okSkip = true;
    for (const a of taken) if (reqCache.get(a).has(it.name)) { okSkip = false; break; }
    if (okSkip) {
      skipped.add(it.name);
      dfs(i + 1, val);
      skipped.delete(it.name);
    }
  }
  dfs(0, 0);
  if (!best) fatal("001: no feasible solution");
  return best;
}

function verify001(P, sol) {
  const { items, caps, res, usage, impl, minQ, maxFlag } = P;
  const byName = new Map(items.map((x) => [x.name, x]));
  assertSorted(sol.names, "001");
  const sel = new Set(sol.names);
  if (sel.size !== sol.names.length) fatal("001: duplicate names in solution");
  const tot = {};
  let val = 0;
  const fc = {};
  for (const nm of sol.names) {
    const it = byName.get(nm);
    if (!it) fatal(`001: unknown item ${nm}`);
    val += it.value;
    for (const r of res) tot[r] = (tot[r] || 0) + usage[nm][r];
    for (const f of it.flags) fc[f] = (fc[f] || 0) + 1;
  }
  for (const r of res) if (tot[r] > caps[r]) fatal(`001: resource ${r} over cap`);
  for (const [a, bs] of impl) {
    if (sel.has(a)) for (const b of bs) if (!sel.has(b)) fatal(`001: implication ${a}->${b} violated`);
  }
  for (const [f, q] of Object.entries(minQ)) if ((fc[f] || 0) < q) fatal(`001: flag '${f}' below minimum quota`);
  for (const [f, c] of Object.entries(fc)) if (c > maxFlag) fatal(`001: flag '${f}' above maximum quota`);
  if (val !== sol.score) fatal("001: value recomputation mismatch");
}

// ══ Variant 002: team selection with role-pairing constraints ══
function parse002(text) {
  const items = parseItems(text);
  if (items.length !== 24) fatal(`002: parsed ${items.length} candidates, expected 24`);
  const nM = /Select EXACTLY (\d+) candidates/.exec(text);
  if (!nM) fatal("002: exact count not found");
  const n = +nM[1];
  const rM = /covering all (\d+) roles \((r\d+)\.\.(r\d+)\)/.exec(text);
  if (!rM) fatal("002: role range not found");
  const roles = [];
  for (let i = +rM[2].slice(1); i <= +rM[3].slice(1); i++) roles.push("r" + i);
  if (roles.length !== +rM[1]) fatal("002: role count mismatch");
  // Pair 1 is phrased WITHOUT parentheses: "covering r1 must equal the number
  // covering r2". The rest are parenthesized in the "same for" list.
  const pairs = [];
  const fp = /covering (r\d+) must equal the number covering (r\d+)/.exec(text);
  if (!fp) fatal("002: first role-pair sentence not found");
  pairs.push([fp[1], fp[2]]);
  const sf = /same for ([^.]+)\./.exec(text);
  if (!sf) fatal("002: 'same for' pair list not found");
  for (const pm of sf[1].matchAll(/\((r\d+),(r\d+)\)/g)) pairs.push([pm[1], pm[2]]);
  if (pairs.length !== 5) fatal(`002: parsed ${pairs.length} role pairs, expected 5`);
  for (const [a, b] of pairs) {
    if (!roles.includes(a) || !roles.includes(b)) fatal(`002: pair (${a},${b}) outside role set`);
    if (a === b) fatal(`002: degenerate pair (${a},${b})`);
  }
  return { items, n, roles, pairs };
}

function solve002(P) {
  const { items, n, roles, pairs } = P;
  const R = roles.length;
  const rIdx = new Map(roles.map((r, i) => [r, i]));
  const order = [...items].sort((a, b) => b.value - a.value);
  const covOf = order.map((it) => it.roles.map((r) => rIdx.get(r)).filter((x) => x !== undefined));
  covOf.forEach((c, i) => { if (c.length === 0) fatal(`002: ${order[i].name} covers no known role`); });
  const N = order.length;
  const pairIdx = pairs.map(([a, b]) => [rIdx.get(a), rIdx.get(b)]);
  const sufScore = new Array(N + 1).fill(0);
  const sufCov = Array.from({ length: N + 1 }, () => new Array(R).fill(0));
  const remA = pairIdx.map(() => new Array(N + 1).fill(0));
  const remB = pairIdx.map(() => new Array(N + 1).fill(0));
  for (let i = N - 1; i >= 0; i--) {
    sufScore[i] = sufScore[i + 1] + order[i].value;
    for (let r = 0; r < R; r++) sufCov[i][r] = sufCov[i + 1][r];
    for (const r of covOf[i]) sufCov[i][r]++;
    pairIdx.forEach(([ia, ib], k) => {
      remA[k][i] = remA[k][i + 1];
      remB[k][i] = remB[k][i + 1];
      const ca = covOf[i].includes(ia), cb = covOf[i].includes(ib);
      if (ca && !cb) remA[k][i]++;
      if (cb && !ca) remB[k][i]++;
    });
  }
  let best = null;
  const cov = new Array(R).fill(0);
  const sel = [];
  function dfs(i, score) {
    if (best && score + sufScore[i] < best.score) return;
    if (sel.length > n || sel.length + (N - i) < n) return;
    for (let r = 0; r < R; r++) if (cov[r] + sufCov[i][r] < 1) return;
    for (let k = 0; k < pairIdx.length; k++) {
      const [ia, ib] = pairIdx[k];
      const d = cov[ia] - cov[ib];
      // remaining items can shift d by at most +remA (a-only) / -remB (b-only)
      if (d < -remA[k][i] || d > remB[k][i]) return;
    }
    if (i === N) {
      if (sel.length !== n) return;
      for (let r = 0; r < R; r++) if (cov[r] === 0) return;
      for (const [ia, ib] of pairIdx) if (cov[ia] !== cov[ib]) return;
      const nms = sel.map((x) => x.name).sort();
      if (!best || score > best.score || (score === best.score && lexCompare(nms, best.names) < 0)) {
        best = { score, names: nms };
      }
      return;
    }
    sel.push(order[i]);
    for (const r of covOf[i]) cov[r]++;
    dfs(i + 1, score + order[i].value);
    sel.pop();
    for (const r of covOf[i]) cov[r]--;
    dfs(i + 1, score);
  }
  dfs(0, 0);
  if (!best) fatal("002: no feasible solution");
  return best;
}

function verify002(P, sol) {
  const { items, n, roles, pairs } = P;
  const byName = new Map(items.map((x) => [x.name, x]));
  assertSorted(sol.names, "002");
  if (sol.names.length !== n) fatal("002: solution size != exact count");
  if (new Set(sol.names).size !== sol.names.length) fatal("002: duplicate names");
  const cov = {};
  let score = 0;
  for (const nm of sol.names) {
    const it = byName.get(nm);
    if (!it) fatal(`002: unknown candidate ${nm}`);
    score += it.value;
    for (const r of it.roles) cov[r] = (cov[r] || 0) + 1;
  }
  for (const r of roles) if (!cov[r]) fatal(`002: role ${r} uncovered`);
  for (const [a, b] of pairs) {
    if ((cov[a] || 0) !== (cov[b] || 0)) fatal(`002: pair (${a},${b}) counts unequal`);
  }
  if (score !== sol.score) fatal("002: score recomputation mismatch");
}

// ══ Variant 003: conflicts + co-require groups ══
function parse003(text) {
  const items = parseItems(text);
  if (items.length !== 28) fatal(`003: parsed ${items.length} items, expected 28`);
  const names = new Set(items.map((x) => x.name));
  const wM = /total weight <= (\d+)/.exec(text);
  if (!wM) fatal("003: weight cap not found");
  const cseg = /Conflict pairs \(cannot both be selected\): ([^.]+)\./.exec(text);
  if (!cseg) fatal("003: conflict segment not found");
  const conflicts = new Set();
  let nConf = 0;
  for (const p of cseg[1].split(";")) {
    const t = p.trim();
    if (!t) continue;
    const ab = t.split("/").map((s) => s.trim());
    if (ab.length !== 2 || !names.has(ab[0]) || !names.has(ab[1])) fatal(`003: bad conflict '${t}'`);
    conflicts.add(ab[0] + "|" + ab[1]);
    conflicts.add(ab[1] + "|" + ab[0]);
    nConf++;
  }
  if (nConf !== 14) fatal(`003: parsed ${nConf} conflict pairs, expected 14`);
  const gseg = /Co-require groups \(all or nothing\): ([^.]+)\./.exec(text);
  if (!gseg) fatal("003: co-require segment not found");
  const groups = [];
  for (const g of gseg[1].split(";")) {
    const ms = g.trim().replace(/[{}]/g, "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!ms.length) continue;
    for (const mm of ms) if (!names.has(mm)) fatal(`003: unknown group member ${mm}`);
    groups.push(ms);
  }
  if (groups.length !== 4) fatal(`003: parsed ${groups.length} co-require groups, expected 4`);
  const fM = /cover at least (\d+) of the (\d+) families/.exec(text);
  if (!fM) fatal("003: family coverage not found");
  const pM = /at most (\d+) per family/.exec(text);
  if (!pM) fatal("003: per-family cap not found");
  return { items, wcap: +wM[1], conflicts, groups, minFam: +fM[1], perFam: +pM[1] };
}

function solve003(P) {
  const { items, wcap, conflicts, groups, minFam, perFam } = P;
  const byName = new Map(items.map((x) => [x.name, x]));
  const seen = new Set();
  const units = [];
  for (const g of groups) {
    units.push({
      names: g,
      value: g.reduce((a, nm) => a + byName.get(nm).value, 0),
      weight: g.reduce((a, nm) => a + byName.get(nm).weight, 0),
    });
    for (const nm of g) seen.add(nm);
  }
  for (const x of items) {
    if (!seen.has(x.name)) units.push({ names: [x.name], value: x.value, weight: x.weight });
  }
  const order = [...units].sort((a, b) => b.value / Math.max(b.weight, 1) - a.value / Math.max(a.weight, 1));
  const remSum = new Array(order.length + 1).fill(0);
  for (let i = order.length - 1; i >= 0; i--) remSum[i] = remSum[i + 1] + order[i].value;
  let best = null;
  const sel = [];
  const takenNames = new Set();
  let wSum = 0;
  function dfs(i, val) {
    if (best && val + remSum[i] < best.score) return;
    if (i === order.length) {
      const fams = new Set();
      const famCount = {};
      for (const nm of takenNames) {
        const f = byName.get(nm).family;
        if (f) { fams.add(f); famCount[f] = (famCount[f] || 0) + 1; }
      }
      if (fams.size < minFam) return;
      for (const c of Object.values(famCount)) if (c > perFam) return;
      const nms = [...takenNames].sort();
      if (!best || val > best.score || (val === best.score && lexCompare(nms, best.names) < 0)) {
        best = { score: val, names: nms };
      }
      return;
    }
    const u = order[i];
    let ok = wSum + u.weight <= wcap;
    if (ok) {
      for (const nm of u.names) {
        for (const t of takenNames) {
          if (conflicts.has(nm + "|" + t)) { ok = false; break; }
        }
        if (!ok) break;
      }
    }
    if (ok) {
      sel.push(u);
      for (const nm of u.names) takenNames.add(nm);
      wSum += u.weight;
      dfs(i + 1, val + u.value);
      sel.pop();
      for (const nm of u.names) takenNames.delete(nm);
      wSum -= u.weight;
    }
    dfs(i + 1, val);
  }
  dfs(0, 0);
  if (!best) fatal("003: no feasible solution");
  return best;
}

function verify003(P, sol) {
  const { items, wcap, conflicts, groups, minFam, perFam } = P;
  const byName = new Map(items.map((x) => [x.name, x]));
  assertSorted(sol.names, "003");
  const sel = new Set(sol.names);
  if (sel.size !== sol.names.length) fatal("003: duplicate names");
  let w = 0, val = 0;
  const fams = new Set(), famCount = {};
  for (const nm of sol.names) {
    const it = byName.get(nm);
    if (!it) fatal(`003: unknown item ${nm}`);
    w += it.weight;
    val += it.value;
    if (it.family) { fams.add(it.family); famCount[it.family] = (famCount[it.family] || 0) + 1; }
  }
  if (w > wcap) fatal("003: weight over cap");
  for (const a of sol.names) {
    for (const b of sol.names) {
      if (a !== b && conflicts.has(a + "|" + b)) fatal(`003: conflict ${a}/${b} both selected`);
    }
  }
  for (const g of groups) {
    const k = g.filter((nm) => sel.has(nm)).length;
    if (k !== 0 && k !== g.length) fatal("003: co-require group partially selected");
  }
  if (fams.size < minFam) fatal("003: family coverage below minimum");
  for (const [f, c] of Object.entries(famCount)) if (c > perFam) fatal(`003: family ${f} over per-family cap`);
  if (val !== sol.score) fatal("003: value recomputation mismatch");
}

// ══ Variant 004: compartments ══
function parse004(text) {
  const items = parseItems(text);
  if (items.length !== 24) fatal(`004: parsed ${items.length} items, expected 24`);
  const expand = (a, b) => {
    const pa = a.match(/^([A-Za-z]+)(\d+)$/), pb = b.match(/^([A-Za-z]+)(\d+)$/);
    if (!pa || !pb || pa[1] !== pb[1]) fatal(`004: bad range ${a}-${b}`);
    const out = [];
    for (let i = +pa[2]; i <= +pb[2]; i++) out.push(pa[1] + String(i).padStart(pa[2].length, "0"));
    return out;
  };
  const compOf = new Map();
  for (const m of text.matchAll(/([A-Za-z]+\d+)-([A-Za-z]+\d+) in (C\d+)/g)) {
    for (const nm of expand(m[1], m[2])) {
      if (compOf.has(nm)) fatal(`004: ${nm} assigned to two compartments`);
      compOf.set(nm, m[3]);
    }
  }
  const names = new Set(items.map((x) => x.name));
  for (const nm of names) if (!compOf.has(nm)) fatal(`004: ${nm} in no compartment`);
  if (new Set(compOf.values()).size !== 8) fatal("004: expected 8 compartments");
  const cwM = /Per-compartment: weight <= (\d+), at most (\d+) items/.exec(text);
  if (!cwM) fatal("004: per-compartment limits not found");
  const cross = [];
  for (const m of text.matchAll(/(C\d+)\+(C\d+) <= (\d+)/g)) cross.push([m[1], m[2], +m[3]]);
  if (cross.length !== 4) fatal(`004: parsed ${cross.length} cross constraints, expected 4`);
  return { items, compOf, cwCap: +cwM[1], cItemMax: +cwM[2], cross };
}

function solve004(P) {
  const { items, compOf, cwCap, cItemMax, cross } = P;
  const spec = {
    canTake(it, sel) {
      const cw = {}, cc = {};
      for (const x of sel) {
        const c = compOf.get(x.name);
        cw[c] = (cw[c] || 0) + x.weight;
        cc[c] = (cc[c] || 0) + 1;
        if (cw[c] > cwCap || cc[c] > cItemMax) return false;
      }
      for (const [a, b, cap] of cross) if ((cw[a] || 0) + (cw[b] || 0) > cap) return false;
      return true;
    },
    leafScore(sel) {
      if (spec.canTake(null, sel) === false) return null;
      const v = sel.reduce((a, x) => a + x.value, 0);
      return { score: v, raw: v };
    },
  };
  const best = branchAndBound(items, spec);
  if (!best) fatal("004: no feasible solution");
  return best;
}

function verify004(P, sol) {
  const { items, compOf, cwCap, cItemMax, cross } = P;
  const byName = new Map(items.map((x) => [x.name, x]));
  assertSorted(sol.names, "004");
  if (new Set(sol.names).size !== sol.names.length) fatal("004: duplicate names");
  const cw = {}, cc = {};
  let val = 0;
  for (const nm of sol.names) {
    const it = byName.get(nm);
    if (!it) fatal(`004: unknown item ${nm}`);
    const c = compOf.get(nm);
    cw[c] = (cw[c] || 0) + it.weight;
    cc[c] = (cc[c] || 0) + 1;
    val += it.value;
  }
  for (const c of Object.keys(cw)) {
    if (cw[c] > cwCap) fatal(`004: compartment ${c} weight over cap`);
    if (cc[c] > cItemMax) fatal(`004: compartment ${c} item count over max`);
  }
  for (const [a, b, cap] of cross) {
    if ((cw[a] || 0) + (cw[b] || 0) > cap) fatal(`004: cross ${a}+${b} over cap`);
  }
  if (val !== sol.score) fatal("004: value recomputation mismatch");
}

// ══ Variant 005: utilization bonus with floor ══
function parse005(text) {
  const items = parseItems(text);
  if (items.length !== 24) fatal(`005: parsed ${items.length} items, expected 24`);
  const capM = /bin capacity (\d+)/.exec(text);
  if (!capM) fatal("005: capacity not found");
  const flM = /Minimum utilization: weight >= (\d+)/.exec(text);
  if (!flM) fatal("005: utilization floor not found");
  const tiers = [];
  for (const m of text.matchAll(/>=(\d+)%:\s*\+(\d+)%/g)) tiers.push([+m[1], +m[2]]);
  if (tiers.length !== 7) fatal(`005: parsed ${tiers.length} explicit bonus tiers, expected 7`);
  // The 8th tier is the "else +0%" default (below the lowest threshold).
  const elseM = /;\s*else\s*\+(\d+)%\./.exec(text);
  if (!elseM) fatal("005: 'else +N%' default tier not found");
  if (+elseM[1] !== 0) fatal(`005: default tier bonus is +${elseM[1]}%, expected +0%`);
  tiers.sort((a, b) => b[0] - a[0]);
  return { items, cap: +capM[1], floor: +flM[1], tiers };
}

function solve005(P) {
  const { items, cap, floor, tiers } = P;
  // Exact integer tier lookup: w*100 >= thr*cap  <=>  w/cap*100 >= thr.
  const bonusPct = (w) => {
    for (const [thr, b] of tiers) if (w * 100 >= thr * cap) return b;
    return 0;
  };
  // Exact DP over weight: dp[w] = best {raw value, names} at EXACT weight w
  // (max raw value, then lexicographically smallest sorted name list).
  // Score at weight w is raw*(100+bonusPct(w)) — integer cents, so the whole
  // objective is exact integer arithmetic; no floating-point anywhere.
  const byName = [...items].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const dp = new Array(cap + 1).fill(null);
  dp[0] = { v: 0, names: [] };
  const betterAtW = (cand, cur) => {
    if (!cur) return true;
    if (cand.v !== cur.v) return cand.v > cur.v;
    return lexCompare(cand.names, cur.names) < 0;
  };
  for (const it of byName) {
    for (let w = cap; w >= it.weight; w--) {
      const prev = dp[w - it.weight];
      if (!prev) continue;
      const cand = { v: prev.v + it.value, names: [...prev.names, it.name] };
      if (betterAtW(cand, dp[w])) dp[w] = cand;
    }
  }
  let best = null; // {scoreCents, raw, names}
  for (let w = floor; w <= cap; w++) {
    const e = dp[w];
    if (!e) continue;
    const scoreCents = e.v * (100 + bonusPct(w));
    if (!best || scoreCents > best.scoreCents ||
        (scoreCents === best.scoreCents && (e.v > best.raw ||
          (e.v === best.raw && lexCompare(e.names, best.names) < 0)))) {
      best = { scoreCents, raw: e.v, names: e.names };
    }
  }
  if (!best) fatal("005: no feasible solution");
  return { score: best.scoreCents / 100, raw: best.raw, names: best.names };
}

function verify005(P, sol) {
  const { items, cap, floor, tiers } = P;
  const byName = new Map(items.map((x) => [x.name, x]));
  assertSorted(sol.names, "005");
  if (new Set(sol.names).size !== sol.names.length) fatal("005: duplicate names");
  let w = 0, v = 0;
  for (const nm of sol.names) {
    const it = byName.get(nm);
    if (!it) fatal(`005: unknown item ${nm}`);
    w += it.weight;
    v += it.value;
  }
  if (w < floor || w > cap) fatal("005: weight outside [floor, cap]");
  let p = 0;
  for (const [thr, b] of tiers) if (w * 100 >= thr * cap) { p = b; break; }
  // Integer-cents score, computed identically to solve005: v*(100+p) is an
  // integer number of cents, so no floating-point rounding is involved.
  const score = (v * (100 + p)) / 100;
  if (score !== sol.score) fatal("005: score recomputation mismatch");
}

// ══ Variant 006: chain implications, exact count, flag quotas ══
function parse006(text) {
  const items = parseItems(text);
  if (items.length !== 20) fatal(`006: parsed ${items.length} items, expected 20`);
  const names = new Set(items.map((x) => x.name));
  const nM = /Select EXACTLY (\d+) modules/.exec(text);
  if (!nM) fatal("006: exact count not found");
  const chains = [];
  const seen = new Set();
  const chainRe = /([A-Za-z]+)(\d+)->(?:[A-Za-z]+\d+->)*\.\.\.->([A-Za-z]+)(\d+)|([A-Za-z]+\d+(?:->[A-Za-z]+\d+)+)/g;
  let m;
  while ((m = chainRe.exec(text)) !== null) {
    let arr, key;
    if (m[5]) {
      key = m[5];
      arr = m[5].split("->");
    } else {
      key = `${m[1]}${m[2]}..${m[3]}${m[4]}`;
      arr = [];
      for (let i = +m[2]; i <= +m[4]; i++) arr.push(m[1] + String(i).padStart(m[2].length, "0"));
    }
    if (seen.has(key)) continue;
    seen.add(key);
    chains.push(arr);
  }
  if (chains.length !== 2) fatal(`006: parsed ${chains.length} chains, expected 2`);
  const chained = new Set(chains.flat());
  if (chained.size !== chains[0].length + chains[1].length) fatal("006: chains overlap");
  for (const nm of chained) if (!names.has(nm)) fatal(`006: chain member ${nm} is not an item`);
  // Modules outside any chain (here M17..M20) are free: take/skip independently.
  const free = items.map((x) => x.name).filter((nm) => !chained.has(nm));
  // Parse the FULL quota list: "at least 3 a, 3 b, 2 c, 2 d, 2 e."
  // (Only the first entry repeats the words "at least"; a global
  // /at least (\d+) ([a-e])/g would silently drop the other four.)
  const qseg = /Flag quotas: ([^.]+)\./.exec(text);
  if (!qseg) fatal("006: flag quota segment not found");
  const minQ = {};
  for (const part of qseg[1].split(",")) {
    const qm = /(\d+)\s+([A-Za-z])/.exec(part);
    if (qm) minQ[qm[2]] = +qm[1];
  }
  if (Object.keys(minQ).length !== 5) fatal(`006: parsed ${Object.keys(minQ).length} flag quotas, expected 5`);
  return { items, n: +nM[1], chains, free, minQ };
}

function solve006(P) {
  const { items, n, chains, free, minQ } = P;
  const byName = new Map(items.map((x) => [x.name, x]));
  // "if a module is taken, all later modules in its chain must be taken":
  // feasible per-chain selections are exactly the suffixes. Chain-free modules
  // (M17..M20) are independent take/skip units.
  const unitOpts = chains.map((ch) => {
    const out = [[]];
    for (let i = ch.length - 1; i >= 0; i--) out.push(ch.slice(i));
    return out;
  });
  for (const nm of free) unitOpts.push([[], [nm]]);
  let best = null;
  const rec = (ui, chosen) => {
    if (ui === unitOpts.length) {
      if (chosen.length !== n) return;
      const fc = {};
      let v = 0;
      for (const nm of chosen) {
        const x = byName.get(nm);
        if (!x) fatal(`006: unknown module ${nm}`);
        v += x.value;
        for (const f of x.flags) fc[f] = (fc[f] || 0) + 1;
      }
      for (const [f, q] of Object.entries(minQ)) if ((fc[f] || 0) < q) return;
      const nms = [...chosen].sort();
      if (!best || v > best.score || (v === best.score && lexCompare(nms, best.names) < 0)) {
        best = { score: v, names: nms };
      }
      return;
    }
    for (const s of unitOpts[ui]) rec(ui + 1, chosen.concat(s));
  };
  rec(0, []);
  if (!best) fatal("006: no feasible solution");
  return best;
}

function verify006(P, sol) {
  const { items, n, chains, minQ } = P;
  const byName = new Map(items.map((x) => [x.name, x]));
  assertSorted(sol.names, "006");
  if (sol.names.length !== n) fatal("006: solution size != exact count");
  const sel = new Set(sol.names);
  if (sel.size !== sol.names.length) fatal("006: duplicate names");
  let val = 0;
  const fc = {};
  for (const nm of sol.names) {
    const it = byName.get(nm);
    if (!it) fatal(`006: unknown module ${nm}`);
    val += it.value;
    for (const f of it.flags) fc[f] = (fc[f] || 0) + 1;
  }
  for (const ch of chains) {
    let seenMissing = false;
    for (let i = ch.length - 1; i >= 0; i--) {
      if (!sel.has(ch[i])) seenMissing = true;
      else if (seenMissing) fatal("006: chain selection not a suffix (implication violated)");
    }
  }
  for (const [f, q] of Object.entries(minQ)) if ((fc[f] || 0) < q) fatal(`006: flag '${f}' below minimum quota`);
  if (val !== sol.score) fatal("006: value recomputation mismatch");
}

// ══ Elide-003: knapsack with double-negative membership requirement ══
// "no team shall be without at least one member who has completed safety
// training. Trained members: A, C, E." -> selected set must include >= 1 of
// the trained set. (v1.8 mode 17: the requirement is phrased to be dropped;
// parse it explicitly and FAIL LOUDLY if any part is unparseable.)
function parseElide(text) {
  const items = parseItems(text);
  if (items.length !== 5) fatal(`elide: parsed ${items.length} items, expected 5`);
  const names = new Set(items.map((x) => x.name));
  const capM = /capacity (\d+)/.exec(text);
  if (!capM) fatal("elide: capacity not found");
  const tmM = /Trained members: ([^.]+)\./.exec(text);
  if (!tmM) fatal("elide: trained-members list not found");
  const trained = new Set(tmM[1].split(",").map((s) => s.trim()).filter(Boolean));
  if (trained.size === 0) fatal("elide: trained set empty");
  for (const t of trained) if (!names.has(t)) fatal(`elide: trained member ${t} is not an item`);
  if (!/without at least one member/i.test(text)) {
    fatal("elide: membership requirement sentence not found");
  }
  return { items, cap: +capM[1], trained };
}

function solveElide(P) {
  const { items, cap, trained } = P;
  const order = [...items].sort((a, b) => b.value / Math.max(b.weight, 1) - a.value / Math.max(a.weight, 1));
  const suf = new Array(order.length + 1).fill(0);
  for (let i = order.length - 1; i >= 0; i--) suf[i] = suf[i + 1] + order[i].value;
  let best = null;
  const sel = [];
  let wSum = 0;
  function dfs(i, val) {
    if (best && val + suf[i] < best.score) return;
    if (i === order.length) {
      const nms = sel.map((x) => x.name);
      if (!nms.some((x) => trained.has(x))) return; // membership requirement
      const sn = [...nms].sort();
      if (!best || val > best.score || (val === best.score && lexCompare(sn, best.names) < 0)) {
        best = { score: val, names: sn };
      }
      return;
    }
    const it = order[i];
    if (wSum + it.weight <= cap) {
      sel.push(it);
      wSum += it.weight;
      dfs(i + 1, val + it.value);
      sel.pop();
      wSum -= it.weight;
    }
    dfs(i + 1, val);
  }
  dfs(0, 0);
  if (!best) fatal("elide: no feasible solution");
  return best;
}

function verifyElide(P, sol) {
  const { items, cap, trained } = P;
  const byName = new Map(items.map((x) => [x.name, x]));
  assertSorted(sol.names, "elide");
  if (new Set(sol.names).size !== sol.names.length) fatal("elide: duplicate names");
  let w = 0, val = 0, hasTrained = false;
  for (const nm of sol.names) {
    const it = byName.get(nm);
    if (!it) fatal(`elide: unknown item ${nm}`);
    w += it.weight;
    val += it.value;
    if (trained.has(nm)) hasTrained = true;
  }
  if (w > cap) fatal("elide: weight over capacity");
  if (!hasTrained) fatal("elide: no trained member selected (membership requirement violated)");
  if (val !== sol.score) fatal("elide: value recomputation mismatch");
}

// ── Main ─────────────────────────────────────────────────────────────
function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");

  let sol, decimals = 0;
  if (/Resource usage per item/.test(text)) {
    const P = parse001(text);
    sol = solve001(P);
    verify001(P, sol);
  } else if (/Select EXACTLY \d+ candidates/.test(text)) {
    const P = parse002(text);
    sol = solve002(P);
    verify002(P, sol);
  } else if (/Conflict pairs/.test(text)) {
    const P = parse003(text);
    sol = solve003(P);
    verify003(P, sol);
  } else if (/Compartments:/.test(text)) {
    const P = parse004(text);
    sol = solve004(P);
    verify004(P, sol);
  } else if (/Utilization bonus/.test(text)) {
    const P = parse005(text);
    sol = solve005(P);
    verify005(P, sol);
    decimals = 2;
  } else if (/Implication chains/.test(text)) {
    const P = parse006(text);
    sol = solve006(P);
    verify006(P, sol);
  } else if (/without at least one member/i.test(text)) {
    const P = parseElide(text);
    sol = solveElide(P);
    verifyElide(P, sol);
  } else {
    fatal("unknown v9 select variant");
  }

  if (decimals > 0) {
    if (!/two decimals/.test(text)) fatal("decimal format requested but prompt lacks 'two decimals'");
    console.log(`${sol.score.toFixed(decimals)}:${sol.names.join(",")}`);
  } else {
    if (!Number.isInteger(sol.score)) fatal("non-integer score for integer answer format");
    console.log(`${sol.score}:${sol.names.join(",")}`);
  }
}

main();
