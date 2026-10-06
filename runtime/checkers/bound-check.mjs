#!/usr/bin/env node
// bound-check.mjs — Reasoning Runtime, Priority 2
// Implements §5 mode 16 (inverted bound pruning) as executable code.
//
// The mode-16 bug: a branch-and-bound prune with the comparison flipped for
// the optimization direction silently discards optimal candidates while
// returning a valid-looking feasible answer.
//
// The §4 item 10 checklist as code — every prune states:
//   (a) objective direction (min/max)
//   (b) the bound and why it is valid (overestimate for max, underestimate for min)
//   (c) the exact prune condition
//   (d) the argument that the condition fires only when the bound proves
//       the branch cannot beat the incumbent.
//
// This checker performs:
//   STATIC (ADVISORY ONLY, never gates — per §19 f2-f3-fpr trial 2026-10-06):
//     regex heuristics over the prune source. Trial verdict: 3/3 false
//     positives on real correct prunes (strict `<` for max / `>` for min are
//     deliberate tie-break semantics, not direction errors), 0 recall on the
//     v5-pattern bug, and the old "prescribed correct pattern" (`bound <=
//     incumbent` for max) was dynamically WRONG — it prunes tie branches that
//     can win. Static findings are reported as smell, not proof.
//     Strict-vs-nonstrict is a TIE-BREAK SEMANTIC (whether equal-bound
//     branches are explored), not a direction error.
//   DYNAMIC (the gate): runs the prune function against test cases including
//     known-optimal branches; verifies optimal branches are never pruned.
//     Verdict FAIL iff pruned_optimal_branch or any case verdict is DEFECT/ERROR.
//
// Usage:
//   node bound-check.mjs --spec <spec.json> --prune <prune.js> --cases <cases.json>
//
// spec.json: {
//   "objective": "max"|"min",
//   "bound_kind": "upper"|"lower",       // upper bound for max, lower bound for min
//   "bound_description": "why this bound is valid"
// }
// prune.js: module exporting `shouldPrune(bound, incumbent)` → boolean
// cases.json: [
//   {"bound": 103, "incumbent": 85, "branch_contains_optimum": true,
//    "note": "branch can reach 103, incumbent is 85"},
//   ...
// ]
//
// Output: JSON report to stdout. Exit 0 if sound, 1 if defect, 2 on I/O errors.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--spec") args.spec = argv[++i];
    else if (argv[i] === "--prune") args.prune = argv[++i];
    else if (argv[i] === "--cases") args.cases = argv[++i];
    else {
      console.error(`Unknown argument: ${argv[i]}`);
      process.exit(2);
    }
  }
  if (!args.spec || !args.prune || !args.cases) {
    console.error(
      "Usage: node bound-check.mjs --spec <spec.json> --prune <prune.js> --cases <cases.json>"
    );
    process.exit(2);
  }
  return args;
}

// Static analysis (ADVISORY ONLY — never flips the verdict).
// Reports smell-level findings over the prune source. Per the f2-f3-fpr
// trial, strict `<` (max) / `>` (min) against the incumbent are the
// CORRECT deliberate pattern in real solvers (equal-bound branches may
// still win on tie-break); the old code flagged these as inverted and
// prescribed `<=`/`>=`, which is dynamically wrong. Keep findings neutral.
function staticCheck(source, objective) {
  const findings = [];
  // Look for comparison operators in prune-like expressions.
  // Advisory note only: strict-vs-nonstrict is a tie-break semantic
  // (whether equal-bound branches are explored), not a direction error.
  // For max, `bound < incumbent` prunes when the bound is BELOW the
  // incumbent — the correct direction for a max upper bound.
  // For min, `bound > incumbent` prunes when the bound is ABOVE the
  // incumbent — the correct direction for a min lower bound.

  if (objective === "max") {
    if (/if\s+.*<\s*\w*(best|incumbent)/i.test(source)) {
      findings.push({
        type: "STRICT_COMPARISON_ADVISORY",
        detail:
          "Maximization prune uses `<` against incumbent/best — advisory: for a max upper bound this is the correct direction (prunes when the bound is below the incumbent). Whether `<=` is safe depends on the tie-break: equal-bound branches can still win. Confirm via dynamic cases.",
      });
    }
  } else if (objective === "min") {
    if (/if\s+.*>\s*\w*(best|incumbent)/i.test(source)) {
      findings.push({
        type: "STRICT_COMPARISON_ADVISORY",
        detail:
          "Minimization prune uses `>` against incumbent/best — advisory: for a min lower bound this is the correct direction (prunes when the bound is above the incumbent). Whether `>=` is safe depends on the tie-break: equal-bound branches can still win. Confirm via dynamic cases.",
      });
    }
  }

  // Raw-score prune: pruning on partial score rather than a bound.
  if (/\b(partial_?score|score)\b/i.test(source) && !/\b(bound|upper|lower)\b/i.test(source)) {
    findings.push({
      type: "RAW_SCORE_PRUNE_ADVISORY",
      detail:
        "Advisory: prune appears to use a raw partial score rather than a bound. Pruning on the partial score (not an optimistic bound) can discard branches that could still improve — confirm via dynamic cases.",
    });
  }

  return findings;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let spec, cases;
  try {
    spec = JSON.parse(readFileSync(args.spec, "utf8"));
    cases = JSON.parse(readFileSync(args.cases, "utf8"));
  } catch (e) {
    console.error(`I/O error: ${e.message}`);
    process.exit(2);
  }

  const { objective, bound_kind, bound_description } = spec;
  if (!["max", "min"].includes(objective)) {
    console.error('spec.json: objective must be "max" or "min"');
    process.exit(2);
  }
  // Validate bound kind matches objective.
  const expectedBound = objective === "max" ? "upper" : "lower";
  const boundMismatch = bound_kind !== expectedBound;

  let shouldPrune;
  let pruneSource;
  try {
    pruneSource = readFileSync(args.prune, "utf8");
    const mod = await import(pathToFileURL(args.prune).href);
    shouldPrune = mod.shouldPrune || mod.default;
    if (typeof shouldPrune !== "function") {
      console.error("prune.js must export `shouldPrune(bound, incumbent)`");
      process.exit(2);
    }
  } catch (e) {
    console.error(`Prune load error: ${e.message}`);
    process.exit(2);
  }

  const report = {
    objective,
    bound_kind,
    bound_description: bound_description || "(not stated)",
    bound_kind_mismatch: boundMismatch,
    static_findings: staticCheck(pruneSource, objective),
    case_results: [],
    pruned_optimal_branch: false,
    verdict: "PASS",
  };

  if (boundMismatch) {
    report.verdict = "FAIL";
  }

  // Dynamic: run prune against each test case.
  for (const c of cases) {
    let pruned;
    try {
      pruned = !!shouldPrune(c.bound, c.incumbent);
    } catch (e) {
      report.case_results.push({ case: c.note || c, error: e.message, verdict: "ERROR" });
      report.verdict = "FAIL";
      continue;
    }
    // The critical check: if the branch may contain the optimum, it must NOT be pruned.
    // A branch "may contain the optimum" when the bound beats the incumbent
    // (for max: bound > incumbent means the branch could still win).
    const couldWin =
      objective === "max" ? c.bound > c.incumbent : c.bound < c.incumbent;
    const correct = c.branch_contains_optimum ? !pruned : true;
    // Also check: if the branch provably cannot win, pruning is correct (not required, but sound).
    const cannotWin =
      objective === "max" ? c.bound <= c.incumbent : c.bound >= c.incumbent;

    const caseVerdict = correct ? "OK" : "DEFECT";
    if (!correct) {
      report.pruned_optimal_branch = true;
      report.verdict = "FAIL";
    }
    report.case_results.push({
      note: c.note || "",
      bound: c.bound,
      incumbent: c.incumbent,
      pruned,
      could_win: couldWin,
      cannot_win: cannotWin,
      verdict: caseVerdict,
    });
  }

  // f2-f3-fpr verdict: static findings are ADVISORY and never flip the
  // verdict. The gate is the dynamic check: pruned_optimal_branch and
  // per-case DEFECT/ERROR verdicts only.

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.verdict === "PASS" ? 0 : 1);
}

main();
