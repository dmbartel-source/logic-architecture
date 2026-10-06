#!/usr/bin/env node
// arg-check.mjs — Reasoning Runtime, Priority 4
// Implements §1.1 (argument structure) as executable code.
//
// The prose→argumentation bridge, first span: a JSON schema for argument
// chains that the pipeline validates structurally. Full NLP parsing of free
// prose is out of scope; the agent fills the structured form (judgment),
// the pipeline checks the structure (code).
//
// Chain schema:
// {
//   "claim": "the consequential claim",
//   "premises": [
//     {"id": "P1", "text": "...", "source": "observed|stated|derived|assumed"}
//   ],
//   "steps": [
//     {"id": "S1", "from": ["P1","P2"], "rule": "modus ponens", "to": "P3"}
//   ],
//   "conclusion": "P3"     // must be a premise id or "C"
// }
//
// Structural checks (§1.1):
//   1. Every premise has a valid source label.
//   2. Every `derived` premise is produced by exactly one step (`to`).
//   3. Every step names exactly one rule (no multi-rule smuggling).
//   4. Every step's `from` references existing premise ids.
//   5. The conclusion is reachable: every derived premise used in the chain
//      to the conclusion has its own producing step (no dangling derivations).
//   6. `assumed` premises are flagged (reported, not failed — they must be
//      surfaced per §1.1, and the report lists them for the label stage).
//
// Usage:
//   node arg-check.mjs --chain <chain.json>
//
// Output: JSON report to stdout. Exit 0 if structurally sound, 1 if defects,
//   2 on I/O errors.

import { readFileSync } from "node:fs";

const SOURCES = new Set(["observed", "stated", "derived", "assumed"]);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--chain") args.chain = argv[++i];
    else {
      console.error(`Unknown argument: ${argv[i]}`);
      process.exit(2);
    }
  }
  if (!args.chain) {
    console.error("Usage: node arg-check.mjs --chain <chain.json>");
    process.exit(2);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let chain;
  try {
    chain = JSON.parse(readFileSync(args.chain, "utf8"));
  } catch (e) {
    console.error(`I/O error: ${e.message}`);
    process.exit(2);
  }

  const defects = [];
  const warnings = [];
  const premises = new Map((chain.premises || []).map((p) => [p.id, p]));
  const producedBy = new Map(); // premise id -> step id

  // Check 1: source labels valid.
  for (const p of chain.premises || []) {
    if (!SOURCES.has(p.source)) {
      defects.push({ type: "BAD_SOURCE", premise: p.id, detail: `source "${p.source}" not in observed|stated|derived|assumed` });
    }
    if (p.source === "assumed") {
      warnings.push({ type: "ASSUMED_PREMISE", premise: p.id, detail: "must be surfaced in delivery, not buried (§1.1)" });
    }
  }

  // Check 3 & 4: steps name one rule and reference existing premises.
  for (const s of chain.steps || []) {
    if (!s.rule || typeof s.rule !== "string" || s.rule.trim() === "") {
      defects.push({ type: "UNNAMED_RULE", step: s.id, detail: "every step must name exactly one inference rule" });
    }
    if (/,|;|\band\b/i.test(s.rule || "")) {
      defects.push({ type: "MULTI_RULE_SUSPECT", step: s.id, detail: `rule "${s.rule}" looks like multiple rules — one rule per step (§1.1)` });
    }
    for (const f of s.from || []) {
      if (!premises.has(f)) {
        defects.push({ type: "DANGLING_REFERENCE", step: s.id, detail: `references unknown premise "${f}"` });
      }
    }
    if (s.to) {
      if (producedBy.has(s.to)) {
        defects.push({ type: "DOUBLE_PRODUCTION", premise: s.to, detail: `produced by both ${producedBy.get(s.to)} and ${s.id}` });
      }
      producedBy.set(s.to, s.id);
    }
  }

  // Check 2: every derived premise has a producing step.
  for (const p of chain.premises || []) {
    if (p.source === "derived" && !producedBy.has(p.id)) {
      defects.push({ type: "UNDERIVED_DERIVED", premise: p.id, detail: "marked derived but no step produces it" });
    }
  }

  // Check 5: conclusion reachable — walk back from conclusion through steps.
  const conclusion = chain.conclusion;
  if (conclusion) {
    const needed = new Set([conclusion]);
    const queue = [conclusion];
    const seen = new Set();
    while (queue.length > 0) {
      const id = queue.shift();
      if (seen.has(id)) continue;
      seen.add(id);
      const stepId = producedBy.get(id);
      if (stepId) {
        const step = (chain.steps || []).find((s) => s.id === stepId);
        for (const f of step.from || []) {
          if (!seen.has(f)) {
            needed.add(f);
            queue.push(f);
          }
        }
      }
    }
    // Every derived premise in the needed set must be produced (already checked
    // globally in check 2, but confirm the conclusion's chain specifically).
    for (const id of needed) {
      const p = premises.get(id);
      if (p && p.source === "derived" && !producedBy.has(id)) {
        defects.push({ type: "BROKEN_CHAIN", premise: id, detail: "in conclusion's chain but underived" });
      }
    }
    if (!premises.has(conclusion) && conclusion !== "C") {
      defects.push({ type: "UNKNOWN_CONCLUSION", detail: `conclusion "${conclusion}" is not a premise id` });
    }
  } else {
    defects.push({ type: "NO_CONCLUSION", detail: "chain has no conclusion" });
  }

  const report = {
    claim: chain.claim || "(unstated)",
    premises: premises.size,
    steps: (chain.steps || []).length,
    assumed_premises: (chain.premises || []).filter((p) => p.source === "assumed").map((p) => p.id),
    defects,
    warnings,
    verdict: defects.length === 0 ? "PASS" : "FAIL",
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.verdict === "PASS" ? 0 : 1);
}

main();
