#!/usr/bin/env node
// canonical-label.mjs — structural canonical labeling via Weisfeiler-Lehman
// color refinement.
//
// Purpose (Mode 18 trial): provide tie-break keys that are pure functions of
// a problem's abstract structure — invariant under input reordering AND under
// bijective renaming of identifiers. A solver that tie-breaks on canonical
// labels instead of raw names selects the same structural optimum regardless
// of surface form.
//
// API:
//   canonicalLabel(nodes, opts) -> Map(id -> {color, rank})
//     nodes: [{id, attrs: {...}, out: [{to, attrs}], in: [{from, attrs}]}]
//       - id: original identifier string
//       - attrs: intrinsic attributes (numbers/strings/booleans)
//       - out/in: directed edges with optional attributes
//     Returns map from id to {color: <stable color id>, rank: <total order>}.
//
// Guarantees:
//   - Isomorphism-equivariant: if two problems are related by a bijective
//     renaming, corresponding entities get the same color.
//   - Deterministic: same input -> same output, always.
//   - Total order: ranks are a permutation of 0..n-1, assigned by
//     (color, id) sort. NOTE: the id tie-break among same-colored entities is
//     NOT rename-equivariant, but same-colored entities are structurally
//     symmetric (automorphic), so any choice among them yields structurally
//     equivalent solutions. Callers that need strict string identity should
//     check the WL-signature of their solutions, not just the output string.
//
// WL refinement is isomorphism-equivariant but not complete: it may fail to
// distinguish some non-isomorphic structures. For the small problems here
// (<=16 entities) it is more than adequate; all entities in the observed
// Mode 18 cases are fully distinguished.

function stableKey(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number" || typeof v === "boolean") return JSON.stringify(v);
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stableKey).join(",") + "]";
  if (typeof v === "object") {
    const keys = Object.keys(v).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableKey(v[k])).join(",") + "}";
  }
  return String(v);
}

export function canonicalLabel(nodes) {
  const n = nodes.length;
  const idx = new Map(nodes.map((nd, i) => [nd.id, i]));
  // Initial colors from intrinsic attributes.
  let colors = nodes.map((nd) => stableKey(nd.attrs || {}));
  // Map color string -> compact integer for readability (not required).
  const compress = (arr) => {
    const uniq = [...new Set(arr)].sort();
    const mp = new Map(uniq.map((c, i) => [c, i]));
    return arr.map((c) => mp.get(c));
  };
  let cur = compress(colors);
  for (let iter = 0; iter < n + 1; iter++) {
    const next = nodes.map((nd, i) => {
      const outSig = (nd.out || [])
        .map((e) => [stableKey(e.attrs || {}), cur[idx.get(e.to)]].join("@"))
        .sort().join(";");
      const inSig = (nd.in || [])
        .map((e) => [stableKey(e.attrs || {}), cur[idx.get(e.from)]].join("@"))
        .sort().join(";");
      return `${cur[i]}|out[${outSig}]|in[${inSig}]`;
    });
    const nxt = compress(next);
    let same = true;
    for (let i = 0; i < n; i++) if (nxt[i] !== cur[i]) { same = false; break; }
    cur = nxt;
    if (same) break;
  }
  // Total order: sort by (color, id). The id tie-break is deterministic;
  // same-colored entities are structurally symmetric.
  const order = nodes
    .map((nd, i) => [cur[i], nd.id, i])
    .sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  const rank = new Map();
  order.forEach(([c, id], r) => rank.set(id, { color: c, rank: r }));
  return rank;
}

// Structural signature of a solution described as a sorted list of items,
// where each item maps to entity ids. Used for canonical comparison of
// candidate optima: two solutions with the same signature are structurally
// identical (up to automorphism); different signatures = genuinely different
// structural choices.
//
//   solutionSignature(items, labelOf, itemKey)
//     items: array of solution items (e.g. edge descriptors "A->D")
//     labelOf: Map(id -> {color, rank}) from canonicalLabel
//     itemKey: (item) -> array of entity ids involved, in a canonical role order
//   Returns a string comparable with < for lexicographic ordering.
export function solutionSignature(items, labelOf, itemKey) {
  const sigs = items.map((it) => {
    const ids = itemKey(it);
    const cols = ids.map((id) => {
      const l = labelOf.get(id);
      if (!l) throw new Error(`canonical-label: unknown entity ${id}`);
      return l.color;
    });
    return cols.join(":");
  });
  sigs.sort();
  return sigs.join("|");
}

// Compare two solutions by structural signature (primary) — returns -1/0/1.
// Does NOT fall back to names; caller decides the residual tie-break.
export function compareSignature(sigA, sigB) {
  return sigA < sigB ? -1 : sigA > sigB ? 1 : 0;
}

// ── Tie-break precedence guard (Pass³ regression fix) ──
// detectTieBreak(text) -> { stated: boolean, rule: string|null }
//
// Scans prompt text for an explicit "Tie-break:" statement.
//
// Precedence rule: an explicit prompt-stated tie-break ALWAYS takes precedence
// over canonical (WL structural) tie-breaking. Canonical labels are only the
// fallback when the prompt states no tie-break rule. (The Pass³ trial found the
// Mode 18 canonical follow-up overriding a prompt-stated "(start, name)" rule —
// a spec-compliance bug: explicit prompt instructions must win.)
export function detectTieBreak(text) {
  const m = /Tie-break:\s*([^\n]+)/i.exec(text || "");
  if (!m) return { stated: false, rule: null };
  return { stated: true, rule: m[1].trim() };
}

// True when the stated rule is a (start, name)-style lexicographic rule,
// e.g. "lexicographically smallest (start, name) sequence" or
// "lexicographically smallest sorted (start-time, job-name) sequence".
export function isStartNameRule(rule) {
  return !!rule && /\(\s*start[^)]*,\s*(job-?)?name\s*\)/i.test(rule);
}

// True when the stated rule asks for lexicographically-smallest ordering,
// e.g. "lexicographically smallest sorted change list".
export function isLexSmallestRule(rule) {
  return !!rule && /lexicographically smallest/i.test(rule);
}
