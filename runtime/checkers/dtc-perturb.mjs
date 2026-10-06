#!/usr/bin/env node
// dtc-perturb.mjs — §19 DTC adoption (2026-10-06): deterministic prompt
// perturbations for the disagreement-count fragility feature.
//
// H2 (Divergent Token Confidence, arXiv:2609.38070) adaptation: our "models"
// are independent solving attempts of the same task. The trial (98 tasks,
// v9+v10) showed disagreement-count strictly dominates the flat `supported`
// label as a fragility discriminator: the single disagreement event coincided
// exactly with a real mode-18 defect (v10-select-003 positional tie-break),
// zero false flags.
//
// Adopted scope: the pipeline runs each task's solver on 2 perturbed prompts
// (line-shuffle + token-shuffle, seeded/deterministic). Any successful
// perturbed attempt that disagrees with the primary answer → downgrade
// supported→plausible + review flag. Perturbation code shared with the trial
// (trial-dtc/dtc-run.mjs) — semantics-preserving for regex-parsed solvers.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic 32-bit seed from a task id (stable across re-runs).
export function seedFor(taskId, salt) {
  let h = salt >>> 0;
  const s = String(taskId);
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 2654435761);
  }
  return h >>> 0;
}

// Perturbation 1: shuffle prompt lines with a seeded PRNG. Semantics-preserving
// for regex-parsed solvers; exposes input-order (mode-18) sensitivity for
// prompts with one entity per line (e.g. select candidates).
export function perturbLines(prompt, seed) {
  const lines = prompt.split("\n");
  if (lines.length < 2) return prompt;
  const rnd = mulberry32(seed);
  const idx = lines.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.map((i) => lines[i]).join("\n");
}

// Perturbation 2: within-line item-token shuffle. Finds non-overlapping
// attribute-bundle tokens (knapsack items "K: value=15, weight=6", route edges
// "A-B (3)") and permutes the tokens among their original positions, leaving
// all surrounding prose untouched. Semantics-preserving by construction:
// items are pure attribute bundles whose identity travels with the token.
const TOKEN_RES = [
  /[A-Za-z0-9]+:\s*(?:value|skill)=\d+(?:,\s*weight\d*=\d+)?/g,
  /[A-Za-z0-9]+:\s*\d+(?:\.\d+)?,\s*\d+(?:\.\d+)?/g,
  /[A-Z]+-[A-Z]+ \(\d+(?:\.\d+)?\)/g,
];
export function perturbTokens(prompt, seed) {
  const rnd = mulberry32(seed);
  return prompt.split("\n").map((line) => {
    for (const re of TOKEN_RES) {
      const matches = [...line.matchAll(re)];
      if (matches.length < 2) continue;
      const toks = matches.map((m) => m[0]);
      for (let i = toks.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [toks[i], toks[j]] = [toks[j], toks[i]];
      }
      let k = 0;
      const out = line.replace(new RegExp(re.source, "g"), () => toks[k++]);
      return out;
    }
    return line;
  }).join("\n");
}
