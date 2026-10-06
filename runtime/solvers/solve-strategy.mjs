#!/usr/bin/env node
// solve-strategy.mjs — Reasoning Runtime, Phase 6 (+ v10 format support, workstream E3).
// Heuristic strategy classifier for "strategy classification" tasks.
// Graceful partial automation: keyword-signal scoring, NOT a proof.
// Output is labeled `plausible` by the batch runner, never `supported`.
//
// The v10 format names the strategy taxonomy in the prompt:
//   "Which strategy is this? Output ONLY one of: divide-and-conquer | brute-force | greedy | dynamic-programming."
// The solver parses that option list and emits the winning token verbatim.
// NOTE: this is deliberately NOT the §13 tag taxonomy (LOOKUP/COMPUTATION/...).
// The v10 bank's answer vocabulary for these tasks is the paradigm tokens
// (confirmed in the bank builder, builders-v10-judgment.py); scoring compares
// against those answers case-insensitively.
// Legacy v8/v9 format (no option list) falls back to the §13 tags:
//   LOOKUP | COMPUTATION | SEARCH | JUDGMENT.
//
// Usage: node solve-strategy.mjs --prompt <file>
// Prints the strategy token on stdout; diagnostics to stderr.
//
// Scoring: each listed strategy accumulates points from signal phrases.
// The highest score wins; ties broken by a fixed priority order.
// Mode-17 spirit: fail loudly (exit 1) if no signal fires — never emit a vacuous verdict.

import { readFileSync } from "node:fs";

function getPrompt(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") return readFileSync(argv[++i], "utf8");
  }
  console.error("Usage: node solve-strategy.mjs --prompt <file>");
  process.exit(2);
}

// "Output ONLY one of: a | b | c." -> ["a","b","c"]; null if absent.
function parseOptions(text) {
  const m = text.match(/Output ONLY one of:\s*([^\n]+)/i);
  if (!m) return null;
  return m[1].split("|").map((s) => s.trim().replace(/[.\s]+$/, "")).filter(Boolean);
}

// Signal phrases for the v10 taxonomy. Weighted: specific phrases beat generic words.
const V10_SIGNALS = {
  "divide-and-conquer": [
    [/break .* into \d+ chunks/i, 3],
    [/solve each .* independently/i, 3],
    [/merge the results/i, 3],
    [/split .* into .*parts?/i, 2],
    [/\bchunks?\b/i, 2],
    [/\bsubproblems?\b/i, 2],
    [/divide and conquer/i, 3],
  ],
  "brute-force": [
    [/try all|exhaustive/i, 3],
    [/\ball possible\b/i, 3],
    [/enumerate/i, 2],
    [/brute[- ]force/i, 3],
  ],
  greedy: [
    [/at each step/i, 3],
    [/take the (largest|smallest|best|cheapest)/i, 3],
    [/never reconsider/i, 3],
    [/locally optimal/i, 2],
    [/\bgreedy\b/i, 3],
  ],
  "dynamic-programming": [
    [/table of (optimal )?values/i, 3],
    [/reusing smaller solutions/i, 3],
    [/optimal values for every/i, 3],
    [/\bsub-budget\b/i, 2],
    [/memoiz/i, 2],
    [/\bdynamic programming\b/i, 3],
  ],
};

// Legacy §13 signals (used only when the prompt carries no option list).
const LEGACY_SIGNALS = {
  LOOKUP: [
    [/dosing table|formulary|reference table|lookup table/i, 3],
    [/\btable\b.*\blists?\b|\blists?\b.*\btable\b/i, 3],
    [/needs? the table value|from the table|in the table/i, 3],
    [/\btable\b/i, 1],
    [/look ?up|retriev/i, 2],
    [/listed|tabulated/i, 1],
    [/database|directory|chart/i, 1],
  ],
  COMPUTATION: [
    [/\bsum\b.*\bsafety factor\b|\btotal\b.*\bcomput/i, 3],
    [/must compute|compute the|calculat/i, 3],
    [/\bsum\b/i, 2],
    [/\btotal\b/i, 1],
    [/formula|appl(y|ied)/i, 1],
    [/does not affect the total|order does not matter/i, 2],
  ],
  SEARCH: [
    [/assign .* to .*minimiz|minimiz.*assign/i, 4],
    [/needs? the optimal|optimal assignment|best assignment/i, 3],
    [/\bassign\b/i, 2],
    [/minimiz|maximiz/i, 2],
    [/\boptimal\b/i, 2],
    [/depends on how/i, 1],
    [/capacit/i, 1],
  ],
  JUDGMENT: [
    [/trade-?off.*no agreed|no agreed.*weight/i, 4],
    [/choose between/i, 3],
    [/set a precedent|explicitly debating/i, 3],
    [/trade-?off/i, 2],
    [/recommend|should we|which is better/i, 2],
    [/no agreed|subjective|values? conflict/i, 2],
  ],
};

// Tie-break priorities. v10: prefer the exact/exhaustive strategy on ties
// (greedy is inexact, so it sorts last). Legacy: §13's cheapest-first order.
const V10_PRIORITY = ["brute-force", "divide-and-conquer", "dynamic-programming", "greedy"];
const LEGACY_PRIORITY = ["LOOKUP", "COMPUTATION", "SEARCH", "JUDGMENT"];

function classify(prompt) {
  const options = parseOptions(prompt);
  // Never score the option list itself: a strategy name can self-match a
  // signal (e.g. /brute[- ]force/ on the listed option).
  const scoringText = prompt.replace(/^.*Output ONLY one of:.*$/gim, "");
  let signals, priority, candidates;
  if (options) {
    // Score only the options the prompt lists; emit the token verbatim.
    signals = {};
    for (const opt of options) signals[opt] = V10_SIGNALS[opt] || [];
    candidates = options;
    priority = V10_PRIORITY;
  } else {
    signals = LEGACY_SIGNALS;
    candidates = LEGACY_PRIORITY;
    priority = LEGACY_PRIORITY;
  }

  const scores = {};
  const hits = {};
  for (const c of candidates) {
    scores[c] = 0;
    hits[c] = [];
    for (const [re, weight] of signals[c]) {
      const m = scoringText.match(re);
      if (m) {
        scores[c] += weight;
        hits[c].push(m[0].slice(0, 40));
      }
    }
  }
  // Winner: highest score; ties broken by priority order.
  const ordered = [...candidates].sort((a, b) => priority.indexOf(a) - priority.indexOf(b));
  let best = ordered[0];
  for (const s of ordered) {
    if (scores[s] > scores[best]) best = s;
  }
  return { label: best, scores, hits, top: scores[best] };
}

const prompt = getPrompt(process.argv.slice(2));
const { label, scores, hits, top } = classify(prompt);
console.error(`[solve-strategy] scores=${JSON.stringify(scores)} winner=${label} hits=${JSON.stringify(hits[label])}`);
if (top === 0) {
  console.error("[solve-strategy] FATAL: no strategy signals fired; refusing to guess");
  process.exit(1);
}
console.log(label);
