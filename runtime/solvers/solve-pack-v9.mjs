#!/usr/bin/env node
// solve-pack-v9.mjs — v9 packing solvers (novel bin-packing structures).
//
// PAL-style: parse the prompt, run deterministic exact search, print answer.
// Usage: node solve-pack-v9.mjs --prompt <prompt.txt>
//   Prints ONLY the answer to stdout (one line); diagnostics to stderr.
//   Auto-detects the v9 packing format; FATALs (exit 1) on unrecognized input
//   or if the produced answer violates any parsed constraint.
//
// Formats handled:
//   multisize       — "Bin sizes available (unlimited supply): [...]. Each bin
//                     holds at most K items." Minimize bins; tie-break =
//                     lex-min sorted list of 'CAP:[sorted names]'.
//                     e.g. '3:20:[I01,I05];25:[I02,I03];30:[I04]'
//   knapsack2d      — crates with w x h and value; pack into WxH container
//                     (rotation allowed) maximizing total value; tie-break =
//                     lex-min '<value>:name@x,y[R];...' with names sorted.
//                     (The prompt's 'VALUE:' example is a placeholder for the
//                     numeric value, per the bank's format regex.)
//   multiconstraint — items with weight+volume; per-bin limits on weight,
//                     volume, item count. Minimize bins; tie-break = lex-min
//                     sorted list of '[sorted names]'.
//                     e.g. '4:[I01,I02];[I03,I04];[I05];[I06,I07]'
//   fragile         — bin capacity; at most G items from the same fragile
//                     group per bin; cannot-coexist pairs. Minimize bins;
//                     tie-break = lex-min sorted list of '[sorted names]'.
//
// Method (1D): exact branch-and-bound.
//   * minBins via first-feasible decision B&B (restricted-growth labeling,
//     free-space-aware lower-bound prune).
//   * Lex-min sorted descriptor list via the (l1,B1) recursion: the first
//     element l1 is the minimum descriptor over feasible bins B with R\B
//     packable into k-1 (B1 is unique, in every optimal packing); the rest is
//     the recursion on R\B1. This yields the true lex-min without enumerating
//     all optimal packings.

import { readFileSync } from "node:fs";
import { assertNonNegative } from "./validate-input.mjs";

function fatal(msg) { console.error(`FATAL: ${msg}`); process.exit(1); }
function diag(msg) { console.error(msg); }

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node solve-pack-v9.mjs --prompt <prompt.txt>"); process.exit(2); }
  return args;
}

function detectFormat(text) {
  if (/rotation allowed/i.test(text) && /value=\d+/.test(text)) return "knapsack2d";
  if (/fragile-group/i.test(text)) return "fragile";
  if (/weight=\d+/.test(text) && /volume=\d+/.test(text)) return "multiconstraint";
  if (/Bin sizes available/i.test(text)) return "multisize";
  return null;
}

const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
function cmpList(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i >= a.length) return -1;
    if (i >= b.length) return 1;
    const c = cmpStr(a[i], b[i]);
    if (c) return c;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// B&B core for 1D packing.
//
// ctx = {
//   orderItems(items) -> array (processing order),
//   newBin(it), canAdd(bin,it), add(bin,it), remove(bin,it),
//   constraints: [{ total(it)->num, cap, free(bin)->num }],
//   describeBin(binItems) -> string,
//   isSingleBin(R) -> bool,
//   feasibleBins(R) -> [{ desc, has:Set }] sorted by desc ascending,
// }
// Bins use restricted-growth labeling: each set partition generated once.
// ---------------------------------------------------------------------------

function subsetsUpTo(R, maxSize) {
  const res = [];
  const cur = [];
  (function rec(start) {
    if (cur.length > 0) res.push([...cur]);
    if (cur.length === maxSize) return;
    for (let i = start; i < R.length; i++) {
      cur.push(R[i]);
      rec(i + 1);
      cur.pop();
    }
  })(0);
  return res;
}

// Free-space lower bound on additional bins needed for ord[i:].
// Each new bin contributes at most cap_c of constraint c; open bins contribute
// their free space. Valid (never overestimates).
function extraLB(ord, i, bins, constraints) {
  let lb = 0;
  for (const c of constraints) {
    let remTot = 0;
    for (let j = i; j < ord.length; j++) remTot += c.total(ord[j]);
    let free = 0;
    for (const b of bins) free += c.free(b);
    const need = Math.ceil(Math.max(0, remTot - free) / c.cap);
    if (need > lb) lb = need;
  }
  return lb;
}

// Decision: can items be packed into <= K bins? First-feasible DFS.
function packable(items, K, ctx) {
  const ord = ctx.orderItems(items);
  const n = ord.length;
  if (n === 0) return true;
  if (K <= 0) return false;
  if (extraLB(ord, 0, [], ctx.constraints) > K) return false;
  const bins = [];
  let found = false;
  (function rec(i) {
    if (found) return;
    if (i === n) { found = true; return; }
    if (bins.length + extraLB(ord, i, bins, ctx.constraints) > K) return;
    const it = ord[i];
    for (let b = 0; b < bins.length && !found; b++) {
      if (ctx.canAdd(bins[b], it)) { ctx.add(bins[b], it); rec(i + 1); ctx.remove(bins[b], it); }
    }
    if (!found && bins.length < K) { bins.push(ctx.newBin(it)); rec(i + 1); bins.pop(); }
  })(0);
  return found;
}

function minBins(items, ctx) {
  const ord = ctx.orderItems(items);
  let m = extraLB(ord, 0, [], ctx.constraints);
  diag(`minBins: lower bound ${m}`);
  while (!packable(ord, m, ctx)) {
    if (++m > ord.length) fatal("minBins: infeasible");
    diag(`minBins: trying ${m}`);
  }
  return m;
}

// Lex-min sorted descriptor list over k-bin packings (k must be minimal).
function lexMinSorted(items, k, ctx, label) {
  const result = [];
  let R = [...items];
  for (let rem = k; rem > 0; rem--) {
    let chosen = null;
    let chosenSet = null;
    if (rem === 1) {
      if (!ctx.isSingleBin(R)) fatal(`${label}: remainder is not a single feasible bin`);
      chosen = { desc: ctx.describeBin(R) };
      chosenSet = new Set(R);
    } else {
      const cands = ctx.feasibleBins(R);
      let checks = 0;
      for (const B of cands) {
        const rest = R.filter((it) => !B.set.has(it));
        checks++;
        if (packable(rest, rem - 1, ctx)) { chosen = B; chosenSet = B.set; break; }
      }
      diag(`${label}: level ${k - rem + 1}/${k}: ${checks}/${cands.length} checks -> ${chosen ? chosen.desc : "NONE"}`);
    }
    if (!chosen) fatal(`${label}: no feasible bin at rem=${rem}`);
    result.push(chosen.desc);
    R = R.filter((it) => !chosenSet.has(it));
  }
  return result.sort(cmpStr);
}

// ---------------------------------------------------------------- multisize
function parseMultisize(text) {
  const items = [];
  const re = /^([A-Z0-9]+): size=(\d+)\s*$/gm;
  let m;
  while ((m = re.exec(text))) items.push({ name: m[1], size: +m[2] });
  const capM = /Bin sizes available \(unlimited supply\): \[([\d,\s]+)\]/.exec(text);
  if (!capM) fatal("multisize: no bin sizes parsed");
  const sizes = capM[1].split(",").map((s) => +s.trim()).filter(Boolean).sort((a, b) => a - b);
  const maxM = /Each bin holds at most (\d+) items/.exec(text);
  if (!maxM) fatal("multisize: no max-items parsed");
  // E6-7: domain invariant — sizes and bin capacities are non-negative.
  assertNonNegative(items.map((i) => i.size), "item size");
  assertNonNegative(sizes, "bin size");
  return { items, sizes, maxItems: +maxM[1] };
}

function makeMultisizeCtx(items, sizes, maxItems) {
  const maxCap = Math.max(...sizes);
  const constraints = [
    { total: () => 1, cap: maxItems, free: (b) => maxItems - b.count },
    { total: (it) => it.size, cap: maxCap, free: (b) => maxCap - b.load },
  ];
  const describeBin = (binItems) => {
    const load = binItems.reduce((s, it) => s + it.size, 0);
    const c = sizes.find((s) => s >= load);
    if (c === undefined) fatal("multisize: load exceeds all sizes");
    return `${c}:[${binItems.map((it) => it.name).sort(cmpStr).join(",")}]`;
  };
  return {
    constraints,
    orderItems: (arr) => [...arr].sort((a, b) => b.size - a.size || cmpStr(a.name, b.name)),
    newBin: (it) => ({ load: it.size, count: 1 }),
    canAdd: (b, it) => b.load + it.size <= maxCap && b.count < maxItems,
    add: (b, it) => { b.load += it.size; b.count++; },
    remove: (b, it) => { b.load -= it.size; b.count--; },
    describeBin,
    isSingleBin: (R) => R.length <= maxItems && R.reduce((s, it) => s + it.size, 0) <= maxCap,
    feasibleBins: (R) => {
      const out = [];
      for (const sub of subsetsUpTo(R, maxItems)) {
        const load = sub.reduce((s, it) => s + it.size, 0);
        if (load > maxCap) continue;
        out.push({ desc: describeBin(sub), set: new Set(sub) });
      }
      out.sort((a, b) => cmpStr(a.desc, b.desc));
      return out;
    },
  };
}

function solveMultisize(text) {
  const { items, sizes, maxItems } = parseMultisize(text);
  if (!items.length) fatal("multisize: no items parsed");
  const ctx = makeMultisizeCtx(items, sizes, maxItems);
  const m = minBins(items, ctx);
  diag(`multisize: min bins = ${m}`);
  const descs = lexMinSorted(items, m, ctx, "multisize");
  const answer = `${m}:${descs.join(";")}`;
  verifyMultisize(answer, { items, sizes, maxItems });
  return answer;
}

function verifyMultisize(answer, prob) {
  const { items, sizes, maxItems } = prob;
  const re = /^(\d+):(\d+:\[[A-Z0-9]+(,[A-Z0-9]+)*\];?)+$/;
  if (!re.test(answer)) fatal(`multisize: answer fails format regex: ${answer}`);
  const mm = /^(\d+):(.*)$/.exec(answer);
  const bins = mm[2].split(";").filter(Boolean).map((d) => {
    const b = /^(\d+):\[([A-Z0-9,]+)\]$/.exec(d);
    if (!b) fatal(`multisize: bad bin descriptor ${d}`);
    return { cap: +b[1], names: b[2].split(",") };
  });
  if (+mm[1] !== bins.length) fatal("multisize: bin count mismatch");
  const sizeOf = new Map(items.map((it) => [it.name, it.size]));
  const seen = [];
  for (const b of bins) {
    if (!sizes.includes(b.cap)) fatal(`multisize: capacity ${b.cap} not in sizes`);
    if (b.names.length > maxItems) fatal(`multisize: bin exceeds max items`);
    const sorted = [...b.names].sort(cmpStr);
    if (sorted.join(",") !== b.names.join(",")) fatal("multisize: names not sorted");
    const load = b.names.reduce((s, nm) => {
      if (!sizeOf.has(nm)) fatal(`multisize: unknown item ${nm}`);
      return s + sizeOf.get(nm);
    }, 0);
    if (load > b.cap) fatal("multisize: capacity violated");
    const minCap = sizes.find((s) => s >= load);
    if (minCap !== b.cap) fatal("multisize: bin capacity not minimal");
    seen.push(...b.names);
  }
  const exp = items.map((it) => it.name).sort(cmpStr).join(",");
  if (seen.sort(cmpStr).join(",") !== exp) fatal("multisize: item coverage wrong");
  const descs = bins.map((b) => `${b.cap}:[${b.names.join(",")}]`);
  if (cmpList([...descs].sort(cmpStr), descs) !== 0) fatal("multisize: bins not in sorted order");
  diag("multisize: verified OK");
}

// ------------------------------------------------------- multiconstraint
function parseMulticonstraint(text) {
  const items = [];
  const re = /^([A-Z0-9]+): weight=(\d+), volume=(\d+)\s*$/gm;
  let m;
  while ((m = re.exec(text))) items.push({ name: m[1], w: +m[2], v: +m[3] });
  const b = /Each bin: weight <= (\d+), volume <= (\d+), at most (\d+) items/.exec(text);
  if (!b) fatal("multiconstraint: no bin limits parsed");
  return { items, maxW: +b[1], maxV: +b[2], maxItems: +b[3] };
}

function makeMulticonstraintCtx(items, maxW, maxV, maxItems) {
  const constraints = [
    { total: () => 1, cap: maxItems, free: (b) => maxItems - b.count },
    { total: (it) => it.w, cap: maxW, free: (b) => maxW - b.w },
    { total: (it) => it.v, cap: maxV, free: (b) => maxV - b.v },
  ];
  const describeBin = (binItems) =>
    `[${binItems.map((it) => it.name).sort(cmpStr).join(",")}]`;
  return {
    constraints,
    orderItems: (arr) => [...arr].sort((a, b) => (b.w + b.v) - (a.w + a.v) || cmpStr(a.name, b.name)),
    newBin: (it) => ({ w: it.w, v: it.v, count: 1 }),
    canAdd: (b, it) => b.w + it.w <= maxW && b.v + it.v <= maxV && b.count < maxItems,
    add: (b, it) => { b.w += it.w; b.v += it.v; b.count++; },
    remove: (b, it) => { b.w -= it.w; b.v -= it.v; b.count--; },
    describeBin,
    isSingleBin: (R) =>
      R.length <= maxItems &&
      R.reduce((s, it) => s + it.w, 0) <= maxW &&
      R.reduce((s, it) => s + it.v, 0) <= maxV,
    feasibleBins: (R) => {
      const out = [];
      for (const sub of subsetsUpTo(R, maxItems)) {
        const w = sub.reduce((s, it) => s + it.w, 0);
        if (w > maxW) continue;
        const v = sub.reduce((s, it) => s + it.v, 0);
        if (v > maxV) continue;
        out.push({ desc: describeBin(sub), set: new Set(sub) });
      }
      out.sort((a, b) => cmpStr(a.desc, b.desc));
      return out;
    },
  };
}

function solveMulticonstraint(text) {
  const { items, maxW, maxV, maxItems } = parseMulticonstraint(text);
  if (!items.length) fatal("multiconstraint: no items parsed");
  const ctx = makeMulticonstraintCtx(items, maxW, maxV, maxItems);
  const m = minBins(items, ctx);
  diag(`multiconstraint: min bins = ${m}`);
  const descs = lexMinSorted(items, m, ctx, "multiconstraint");
  const answer = `${m}:${descs.join(";")}`;
  verifyMulticonstraint(answer, { items, maxW, maxV, maxItems });
  return answer;
}

function verifyMulticonstraint(answer, prob) {
  const { items, maxW, maxV, maxItems } = prob;
  const re = /^(\d+):(\[[A-Z0-9]+(,[A-Z0-9]+)*\];?)+$/;
  if (!re.test(answer)) fatal(`multiconstraint: answer fails format regex: ${answer}`);
  const mm = /^(\d+):(.*)$/.exec(answer);
  const bins = mm[2].split(";").filter(Boolean).map((d) => {
    const b = /^\[([A-Z0-9,]+)\]$/.exec(d);
    if (!b) fatal(`multiconstraint: bad bin descriptor ${d}`);
    return b[1].split(",");
  });
  if (+mm[1] !== bins.length) fatal("multiconstraint: bin count mismatch");
  const wOf = new Map(items.map((it) => [it.name, it.w]));
  const vOf = new Map(items.map((it) => [it.name, it.v]));
  const seen = [];
  for (const names of bins) {
    if (names.length > maxItems) fatal("multiconstraint: max items violated");
    const sorted = [...names].sort(cmpStr);
    if (sorted.join(",") !== names.join(",")) fatal("multiconstraint: names not sorted");
    let w = 0, v = 0;
    for (const nm of names) {
      if (!wOf.has(nm)) fatal(`multiconstraint: unknown item ${nm}`);
      w += wOf.get(nm); v += vOf.get(nm);
    }
    if (w > maxW) fatal("multiconstraint: weight violated");
    if (v > maxV) fatal("multiconstraint: volume violated");
    seen.push(...names);
  }
  const exp = items.map((it) => it.name).sort(cmpStr).join(",");
  if (seen.sort(cmpStr).join(",") !== exp) fatal("multiconstraint: item coverage wrong");
  const descs = bins.map((ns) => `[${ns.join(",")}]`);
  if (cmpList([...descs].sort(cmpStr), descs) !== 0) fatal("multiconstraint: bins not sorted");
  diag("multiconstraint: verified OK");
}

// ----------------------------------------------------------------- fragile
function parseFragile(text) {
  const items = [];
  const re = /^([A-Z0-9]+): size=(\d+), fragile-group=([A-Z0-9]+)\s*$/gm;
  let m;
  while ((m = re.exec(text))) items.push({ name: m[1], size: +m[2], group: m[3] });
  const capM = /Bin capacity (\d+)/.exec(text);
  if (!capM) fatal("fragile: no bin capacity parsed");
  const gM = /at most (\d+) items from the same group per bin/.exec(text);
  if (!gM) fatal("fragile: no fragile rule parsed");
  const pM = /Cannot-coexist pairs[^:]*:\s*([A-Z0-9\/,\s]+)\./.exec(text);
  const pairs = pM ? pM[1].split(",").map((s) => s.trim().split("/")) : [];
  const conflict = new Map(items.map((it) => [it.name, new Set()]));
  for (const [a, b] of pairs) {
    if (!conflict.has(a) || !conflict.has(b)) fatal(`fragile: pair references unknown item ${a}/${b}`);
    conflict.get(a).add(b);
    conflict.get(b).add(a);
  }
  return { items, cap: +capM[1], maxGroup: +gM[1], pairs, conflict };
}

function makeFragileCtx(items, CAP, maxGroup, conflict) {
  const constraints = [
    { total: (it) => it.size, cap: CAP, free: (b) => CAP - b.load },
  ];
  const groupOf = new Map(items.map((it) => [it.name, it.group]));
  const describeBin = (binItems) =>
    `[${binItems.map((it) => it.name).sort(cmpStr).join(",")}]`;
  // Feasibility of a subset as a single bin.
  const binOk = (sub) => {
    let load = 0;
    const gc = new Map();
    for (let i = 0; i < sub.length; i++) {
      const it = sub[i];
      load += it.size;
      if (load > CAP) return false;
      const g = gc.get(it.group) || 0;
      if (g >= maxGroup) return false;
      gc.set(it.group, g + 1);
      for (let j = 0; j < i; j++) {
        if (conflict.get(it.name).has(sub[j].name)) return false;
      }
    }
    return true;
  };
  return {
    constraints,
    orderItems: (arr) => [...arr].sort((a, b) => b.size - a.size || cmpStr(a.name, b.name)),
    newBin: (it) => ({ load: it.size, groups: new Map([[it.group, 1]]), names: new Set([it.name]) }),
    canAdd: (b, it) => {
      if (b.load + it.size > CAP) return false;
      if ((b.groups.get(it.group) || 0) >= maxGroup) return false;
      for (const nm of b.names) if (conflict.get(it.name).has(nm)) return false;
      return true;
    },
    add: (b, it) => {
      b.load += it.size;
      b.groups.set(it.group, (b.groups.get(it.group) || 0) + 1);
      b.names.add(it.name);
    },
    remove: (b, it) => {
      b.load -= it.size;
      const g = b.groups.get(it.group) - 1;
      if (g) b.groups.set(it.group, g); else b.groups.delete(it.group);
      b.names.delete(it.name);
    },
    describeBin,
    isSingleBin: binOk,
    feasibleBins: (R) => {
      const out = [];
      for (const sub of subsetsUpTo(R, R.length)) {
        if (!binOk(sub)) continue;
        out.push({ desc: describeBin(sub), set: new Set(sub) });
      }
      out.sort((a, b) => cmpStr(a.desc, b.desc));
      return out;
    },
  };
}

function solveFragile(text) {
  const prob = parseFragile(text);
  const { items, cap: CAP, maxGroup, conflict } = prob;
  if (!items.length) fatal("fragile: no items parsed");
  const ctx = makeFragileCtx(items, CAP, maxGroup, conflict);
  const m = minBins(items, ctx);
  diag(`fragile: min bins = ${m}`);
  const descs = lexMinSorted(items, m, ctx, "fragile");
  const answer = `${m}:${descs.join(";")}`;
  verifyFragile(answer, prob);
  return answer;
}

function verifyFragile(answer, prob) {
  const { items, cap: CAP, maxGroup, conflict } = prob;
  const re = /^(\d+):(\[[A-Z0-9]+(,[A-Z0-9]+)*\];?)+$/;
  if (!re.test(answer)) fatal(`fragile: answer fails format regex: ${answer}`);
  const mm = /^(\d+):(.*)$/.exec(answer);
  const bins = mm[2].split(";").filter(Boolean).map((d) => {
    const b = /^\[([A-Z0-9,]+)\]$/.exec(d);
    if (!b) fatal(`fragile: bad bin descriptor ${d}`);
    return b[1].split(",");
  });
  if (+mm[1] !== bins.length) fatal("fragile: bin count mismatch");
  const sOf = new Map(items.map((it) => [it.name, it.size]));
  const gOf = new Map(items.map((it) => [it.name, it.group]));
  const seen = [];
  for (const names of bins) {
    const sorted = [...names].sort(cmpStr);
    if (sorted.join(",") !== names.join(",")) fatal("fragile: names not sorted");
    let load = 0;
    const gc = new Map();
    for (const nm of names) {
      if (!sOf.has(nm)) fatal(`fragile: unknown item ${nm}`);
      load += sOf.get(nm);
      const g = gOf.get(nm);
      gc.set(g, (gc.get(g) || 0) + 1);
      if (gc.get(g) > maxGroup) fatal(`fragile: group ${g} over limit in one bin`);
    }
    if (load > CAP) fatal("fragile: capacity violated");
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++)
        if (conflict.get(names[i]).has(names[j]))
          fatal(`fragile: cannot-coexist pair ${names[i]}/${names[j]} in same bin`);
    seen.push(...names);
  }
  const exp = items.map((it) => it.name).sort(cmpStr).join(",");
  if (seen.sort(cmpStr).join(",") !== exp) fatal("fragile: item coverage wrong");
  const descs = bins.map((ns) => `[${ns.join(",")}]`);
  if (cmpList([...descs].sort(cmpStr), descs) !== 0) fatal("fragile: bins not sorted");
  diag("fragile: verified OK");
}

// -------------------------------------------------------------- knapsack2d
function parseKnapsack2d(text) {
  const crates = [];
  const re = /^([A-Z0-9]+): (\d+)x(\d+), value=(\d+)\s*$/gm;
  let m;
  while ((m = re.exec(text))) crates.push({ name: m[1], w: +m[2], h: +m[3], v: +m[4] });
  const c = /(\d+)x(\d+) container/.exec(text);
  if (!c) fatal("knapsack2d: no container dimensions parsed");
  return { crates, W: +c[1], H: +c[2] };
}

function rectsOverlap(cells, x, y, w, h) {
  for (const p of cells)
    if (x < p.x + p.w && p.x < x + w && y < p.y + p.h && p.y < y + h) return true;
  return false;
}

// Decision: can all of `cands` be placed alongside `cells` in WxH?
// Complete: each new rect tries x in {0} U right-edges, y in {0} U top-edges.
function allPlaceable(cands, cells, W, H) {
  const order = [...cands].sort((a, b) => b.w * b.h - a.w * a.h);
  const P = cells.map((p) => ({ ...p }));
  function rec(i) {
    if (i === order.length) return true;
    const c = order[i];
    const ors = c.w === c.h ? [[c.w, c.h]] : [[c.w, c.h], [c.h, c.w]];
    const xs = new Set([0]), ys = new Set([0]);
    for (const p of P) { xs.add(p.x + p.w); ys.add(p.y + p.h); }
    for (const [w, h] of ors)
      for (const x of xs) {
        if (x + w > W) continue;
        for (const y of ys) {
          if (y + h > H) continue;
          if (rectsOverlap(P, x, y, w, h)) continue;
          P.push({ x, y, w, h });
          if (rec(i + 1)) return true;
          P.pop();
        }
      }
    return false;
  }
  return rec(0);
}

function solveKnapsack2d(text) {
  const { crates, W, H } = parseKnapsack2d(text);
  if (!crates.length) fatal("knapsack2d: no crates parsed");
  const byName = [...crates].sort((a, b) => cmpStr(a.name, b.name));
  const n = byName.length;

  // Phase 1: maximum packable value (subsets in descending value order).
  const subs = [];
  for (let mask = 0; mask < 1 << n; mask++) {
    const cs = [];
    let v = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) { cs.push(byName[i]); v += byName[i].v; }
    subs.push({ cs, v });
  }
  subs.sort((a, b) => b.v - a.v);
  let V = 0;
  for (const s of subs) {
    if (s.v <= V) break;
    if (allPlaceable(s.cs, [], W, H)) { V = s.v; break; }
  }
  diag(`knapsack2d: max value V=${V}`);

  // Phase 2: lexicographically smallest output string among value-V packings.
  // Greedy over crates in name order: a crate is included iff some value-V
  // completion includes it (any "C..@.." segment sorts before any later
  // crate's segment, so inclusion always wins); its segment is the lex-min
  // feasible one ("NAME@x,y[R]" compared as raw strings, integer positions).
  const fixed = []; // {name,x,y,w,h,rot,v}
  const decided = new Set();

  function completionExists(extra) {
    const cells = fixed.map((f) => ({ x: f.x, y: f.y, w: f.w, h: f.h }));
    let baseV = fixed.reduce((s, f) => s + f.v, 0);
    if (extra) {
      cells.push({ x: extra.x, y: extra.y, w: extra.w, h: extra.h });
      baseV += extra.crate.v;
    }
    const rem = byName.filter((c) => !decided.has(c.name) && (!extra || c.name !== extra.crate.name));
    const order = [...rem].sort((a, b) => b.w * b.h - a.w * a.h);
    const suf = new Array(order.length + 1).fill(0);
    for (let i = order.length - 1; i >= 0; i--) suf[i] = suf[i + 1] + order[i].v;
    const P = cells.map((p) => ({ ...p }));
    function rec(i, val) {
      if (val >= V) return true;
      if (val + suf[i] < V) return false;
      if (i === order.length) return val >= V;
      const c = order[i];
      const ors = c.w === c.h ? [[c.w, c.h]] : [[c.w, c.h], [c.h, c.w]];
      const xs = new Set([0]), ys = new Set([0]);
      for (const p of P) { xs.add(p.x + p.w); ys.add(p.y + p.h); }
      for (const [w, h] of ors)
        for (const x of xs) {
          if (x + w > W) continue;
          for (const y of ys) {
            if (y + h > H) continue;
            if (rectsOverlap(P, x, y, w, h)) continue;
            P.push({ x, y, w, h });
            if (rec(i + 1, val + c.v)) return true;
            P.pop();
          }
        }
      if (rec(i + 1, val)) return true;
      return false;
    }
    return rec(0, baseV);
  }

  for (const c of byName) {
    let bestSeg = null, bestPl = null;
    const ors = c.w === c.h ? [[c.w, c.h, false]] : [[c.w, c.h, false], [c.h, c.w, true]];
    const fixedCells = fixed.map((f) => ({ x: f.x, y: f.y, w: f.w, h: f.h }));
    for (const [w, h, rot] of ors)
      for (let x = 0; x + w <= W; x++)
        for (let y = 0; y + h <= H; y++) {
          if (rectsOverlap(fixedCells, x, y, w, h)) continue;
          const seg = `${c.name}@${x},${y}${rot ? "R" : ""}`;
          if (bestSeg !== null && seg >= bestSeg) continue;
          if (completionExists({ crate: c, x, y, w, h, rot })) { bestSeg = seg; bestPl = { x, y, w, h, rot }; }
        }
    if (bestPl) fixed.push({ name: c.name, v: c.v, ...bestPl });
    decided.add(c.name);
  }
  const gotV = fixed.reduce((s, f) => s + f.v, 0);
  if (gotV !== V) fatal(`knapsack2d: greedy achieved value ${gotV} != max ${V}`);

  const answer = `${V}:${fixed.map((f) => `${f.name}@${f.x},${f.y}${f.rot ? "R" : ""}`).join(";")}`;
  verifyKnapsack2d(answer, { crates, W, H, V });
  return answer;
}

function verifyKnapsack2d(answer, prob) {
  const { crates, W, H, V } = prob;
  const re = /^\d+:([A-Z0-9]+@\d+,\d+R?(;[A-Z0-9]+@\d+,\d+R?)*)?$/;
  if (!re.test(answer)) fatal(`knapsack2d: answer fails format regex: ${answer}`);
  const cmap = new Map(crates.map((c) => [c.name, c]));
  const segs = answer.slice(answer.indexOf(":") + 1).split(";").filter(Boolean);
  const cells = [];
  let val = 0;
  const names = [];
  for (const s of segs) {
    const m = /^([A-Z0-9]+)@(\d+),(\d+)(R?)$/.exec(s);
    if (!m) fatal(`knapsack2d: bad segment ${s}`);
    const c = cmap.get(m[1]);
    if (!c) fatal(`knapsack2d: unknown crate ${m[1]}`);
    const rot = m[4] === "R";
    const w = rot ? c.h : c.w, h = rot ? c.w : c.h;
    const x = +m[2], y = +m[3];
    if (x + w > W || y + h > H) fatal(`knapsack2d: crate ${m[1]} out of bounds`);
    if (rectsOverlap(cells, x, y, w, h)) fatal("knapsack2d: overlap detected");
    cells.push({ x, y, w, h });
    names.push(m[1]);
    val += c.v;
  }
  if (val !== V) fatal(`knapsack2d: value ${val} != max ${V}`);
  if (cmpList([...names].sort(cmpStr), names) !== 0) fatal("knapsack2d: crates not sorted by name");
  if (new Set(names).size !== names.length) fatal("knapsack2d: duplicate crate");
  diag("knapsack2d: verified OK");
}

// ------------------------------------------------------------------ main
function main() {
  const args = parseArgs(process.argv.slice(2));
  const text = readFileSync(args.prompt, "utf8");
  const fmt = detectFormat(text);
  if (!fmt) fatal("unrecognized v9 packing format (expected multisize / knapsack2d / multiconstraint / fragile markers)");
  diag(`format: ${fmt}`);
  let answer;
  if (fmt === "multisize") answer = solveMultisize(text);
  else if (fmt === "knapsack2d") answer = solveKnapsack2d(text);
  else if (fmt === "multiconstraint") answer = solveMulticonstraint(text);
  else if (fmt === "fragile") answer = solveFragile(text);
  else fatal(`unhandled format: ${fmt}`);
  console.log(answer);
}

main();
