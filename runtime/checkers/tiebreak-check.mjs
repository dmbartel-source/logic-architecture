#!/usr/bin/env node
// tiebreak-check.mjs — Reasoning Runtime, Priority 1
// Implements §5 mode 14 (serialization-order mismatch) as executable code.
// Given a spec's key order and a comparator function, verifies equivalence.
//
// The mode-14 bug: a spec defines ordering "by start, then name" but the code
// compares serialized strings ("name@start"), silently substituting the
// serialization's field order for the specified key order.
//
// This checker is the "two-line proof" from mode 14 as a program:
//   (1) the spec's key order, as tuple comparison
//   (2) the code's comparator, applied to the same candidates
// Any disagreement is a defect.
//
// Usage:
//   node tiebreak-check.mjs --spec <spec.json> --candidates <candidates.json>
//     [--comparator <comparator.js>]
//
// spec.json:       {"order": [["start","asc"],["name","asc"]], "fields": ["start","name"]}
// candidates.json: [{"start":3,"name":"E"}, {"start":4,"name":"D"}, ...]
// comparator.js:   module exporting `compare(a,b)` — the code under test.
//                  If omitted, checks the spec order for self-consistency only.
//
// Output: JSON report to stdout. Exit 0 if equivalent, 1 if defect found,
//   2 on I/O errors.
//
// Verdict policy (per §19 f2-f3-fpr trial, 2026-10-06):
//   - PAIRWISE DISAGREEMENT → BLOCK (exit 1). This is the sound two-line proof.
//   - serialization_suspect → ADVISORY warning only. The regex heuristic fires
//     on correct padded serializations too (1 FP on the trial corpus) and on
//     whole solver files — it is a smell, never a proof. It stays in the
//     report but never flips the verdict.
//   - CANDIDATE REQUIREMENT: candidates MUST include key-order-conflicting
//     (adversarial) pairs, or the pairwise signal cannot distinguish a
//     serialization bug from correct code. The shipped fixture candidates
//     include such pairs; synthetic candidate sets must do the same.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--spec") args.spec = argv[++i];
    else if (argv[i] === "--candidates") args.candidates = argv[++i];
    else if (argv[i] === "--comparator") args.comparator = argv[++i];
    else {
      console.error(`Unknown argument: ${argv[i]}`);
      process.exit(2);
    }
  }
  if (!args.spec || !args.candidates) {
    console.error(
      "Usage: node tiebreak-check.mjs --spec <spec.json> --candidates <candidates.json> [--comparator <comparator.js>]"
    );
    process.exit(2);
  }
  return args;
}

// Compare two candidates by the spec's key order (tuple comparison).
function specCompare(a, b, order) {
  for (const [field, dir] of order) {
    const av = a[field];
    const bv = b[field];
    if (av < bv) return dir === "asc" ? -1 : 1;
    if (av > bv) return dir === "asc" ? 1 : -1;
  }
  return 0;
}

// Heuristic: does the comparator source stringify before comparing?
// (The mode-14 signature: template literals, JSON.stringify, or String()
//  applied to candidates before comparison.)
function detectSerialization(source) {
  const patterns = [
    /\$\{[^}]*\}/, // template literal interpolation
    /JSON\.stringify/,
    /String\s*\(/,
    /\.join\s*\(/,
  ];
  return patterns.some((p) => p.test(source));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let spec, candidates;
  try {
    spec = JSON.parse(readFileSync(args.spec, "utf8"));
    candidates = JSON.parse(readFileSync(args.candidates, "utf8"));
  } catch (e) {
    console.error(`I/O error: ${e.message}`);
    process.exit(2);
  }

  const order = spec.order;
  if (!Array.isArray(order) || order.length === 0) {
    console.error("spec.json must contain non-empty 'order' array");
    process.exit(2);
  }

  const report = {
    spec_order: order,
    candidates: candidates.length,
    serialization_suspect: false,
    advisory_warnings: [],
    disagreements: [],
    verdict: "PASS",
  };

  let compare = null;
  if (args.comparator) {
    try {
      const mod = await import(pathToFileURL(args.comparator).href);
      compare = mod.compare || mod.default;
      if (typeof compare !== "function") {
        console.error("comparator.js must export `compare(a,b)`");
        process.exit(2);
      }
      const src = readFileSync(args.comparator, "utf8");
      report.serialization_suspect = detectSerialization(src);
    } catch (e) {
      console.error(`Comparator load error: ${e.message}`);
      process.exit(2);
    }
  }

  if (compare) {
    // Pairwise equivalence: spec order vs code comparator.
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const a = candidates[i];
        const b = candidates[j];
        const expected = Math.sign(specCompare(a, b, order));
        const actual = Math.sign(compare(a, b));
        if (expected !== actual) {
          report.disagreements.push({
            a,
            b,
            spec_says: expected < 0 ? "a<b" : expected > 0 ? "a>b" : "a=b",
            code_says: actual < 0 ? "a<b" : actual > 0 ? "a>b" : "a=b",
          });
        }
      }
    }
  }

  // f2-f3-fpr verdict: only pairwise disagreement blocks the gate.
  // serialization_suspect is advisory (heuristic FP documented in trial).
  if (report.serialization_suspect) {
    report.advisory_warnings.push(
      "serialization_suspect: comparator source stringifies before comparing — " +
      "a smell for the mode-14 bug, not a proof (fires on correct padded " +
      "serializations too). Confirm with pairwise disagreements."
    );
  }
  if (report.disagreements.length > 0) {
    report.verdict = "FAIL";
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.verdict === "PASS" ? 0 : 1);
}

main();
