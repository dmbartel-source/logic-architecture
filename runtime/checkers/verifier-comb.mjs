#!/usr/bin/env node
// verifier-comb.mjs — Reasoning Runtime, Priority 3
// Implements §5 mode 15 (correlated verification) as executable code.
//
// The mode-15 lesson: "Agreement between methods is evidence only about the
// assumptions they do NOT share." Two "independent" verifications that share
// an implementation assumption will agree while both being wrong.
//
// Each verifier declares which assumptions it can falsify. The library
// computes coverage: which assumptions are falsified by at least one verifier
// that does NOT share the assumption's implementation (independent).
// A re-check sharing the original step's implementation (same key function,
// same serialization, same library call) is labeled weak on that assumption.
//
// Usage:
//   node verifier-comb.mjs --plan <plan.json>
//
// plan.json: {
//   "assumptions": [
//     {"id": "A1", "description": "comparison key matches spec order",
//      "implementation": "key-fn-v1"}           // which implementation embodies it
//   ],
//   "verifiers": [
//     {"name": "primary-solve", "falsifies": ["A1", "A2"],
//      "implementation": "key-fn-v1"},           // shares impl with A1 → weak on A1
//     {"name": "independent-resolve", "falsifies": ["A1"],
//      "implementation": "hand-check"}
//   ]
// }
//
// A verifier is INDEPENDENT on assumption X iff verifier.implementation !==
// assumption.implementation. Coverage requires at least one independent
// falsifier per assumption.
//
// Output: JSON report to stdout. Exit 0 if all assumptions have independent
//   coverage, 1 if any are uncovered or only weakly covered, 2 on I/O errors.

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--plan") args.plan = argv[++i];
    else {
      console.error(`Unknown argument: ${argv[i]}`);
      process.exit(2);
    }
  }
  if (!args.plan) {
    console.error("Usage: node verifier-comb.mjs --plan <plan.json>");
    process.exit(2);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let plan;
  try {
    plan = JSON.parse(readFileSync(args.plan, "utf8"));
  } catch (e) {
    console.error(`I/O error: ${e.message}`);
    process.exit(2);
  }

  const assumptions = plan.assumptions || [];
  const verifiers = plan.verifiers || [];

  const report = {
    assumptions: assumptions.length,
    verifiers: verifiers.length,
    coverage: [],
    verdict: "PASS",
  };

  for (const a of assumptions) {
    const falsifiers = verifiers.filter((v) => (v.falsifies || []).includes(a.id));
    const independent = falsifiers.filter(
      (v) => v.implementation !== a.implementation
    );
    const weak = falsifiers.filter(
      (v) => v.implementation === a.implementation
    );

    let status;
    if (independent.length > 0) {
      status = "COVERED";
    } else if (weak.length > 0) {
      status = "WEAK"; // only same-implementation re-checks (mode-15 pattern)
      report.verdict = "FAIL";
    } else {
      status = "UNCOVERED";
      report.verdict = "FAIL";
    }

    report.coverage.push({
      assumption: a.id,
      description: a.description,
      status,
      independent_falsifiers: independent.map((v) => v.name),
      weak_falsifiers: weak.map((v) => v.name),
      note:
        status === "WEAK"
          ? "Only same-implementation verifiers — agreement here is not evidence (mode 15)."
          : status === "UNCOVERED"
            ? "No verifier falsifies this assumption."
            : undefined,
    });
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.verdict === "PASS" ? 0 : 1);
}

main();
