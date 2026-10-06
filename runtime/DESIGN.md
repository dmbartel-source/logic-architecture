# Reasoning Runtime — Design (Phase 1)

**Date:** 2026-10-04
**Spec:** Logic Architecture v1.7 (`~/workspace/architectures/logic-architecture-v1.7.md`)
**Principle (from structure sweep):** "A discipline becomes executable exactly to the extent its stages are deterministic programs with pass/fail gates."

## What exists vs what's prose-only

### Already code (do not rebuild)
| Tool | Spec | What it does |
|---|---|---|
| `lint-claims.mjs` | §11.1 | Shape-words, unsurfaced assumptions, universal-without-domain |
| `crosscheck.mjs` | §7.2 | MC-tag vs tool-log matching |
| `calibrate.mjs` | §8 | Label hit-rate reporting |
| `hash.mjs` | — | Canonical JSON + SHA-256 |
| `envelope.mjs` / `cli.mjs` | — | Ed25519 signed envelopes |

### Prose-only (pipeline targets)
| Spec | Mechanism | Code opportunity |
|---|---|---|
| §13 | Strategy selection | Classification is judgment; the *record format* and *interface* are code |
| §1.1 | Argument chains | Premises with source labels + named rules as a data structure |
| §3.4/§3.6 | Uncertainty labels | Label assignment rules + sidecar generation as code |
| §5 mode 14 | Tie-break comparison | **Equivalence checker**: spec key order vs code comparator |
| §5 mode 16 | Bound-direction | **Direction checker**: prune condition vs objective/bound |
| §15 | Verification chains | Chain structure (numbered steps, per-step verification status) as code |
| §11.2 | Critic protocol | Orchestration as code; the critic itself remains judgment |

## Pipeline architecture

```
┌───────────┐   ┌───────┐   ┌────────┐   ┌───────┐   ┌──────┐
│ formalize │──▶│ solve │──▶│ verify │──▶│ label │──▶│ seal │
└───────────┘   └───────┘   └────────┘   └───────┘   └──────┘
     │               │            │            │           │
   task.json    answer.json  report.json  sidecar.json envelope.json
```

### Stage 1: formalize
- **Input:** `task.json` — `{id, description (natural language), consequence level}`
- **Output:** `formal.json` — `{strategy, premises[], constraints[], success_criteria, load_bearing[], decorative[]}`
- **Judgment/code split:** The agent performs the formalization (judgment), but the pipeline validates the output schema (code). A formalization missing `strategy` or with empty `premises` fails the gate.
- **Gate:** schema-complete. All required fields present and non-empty.
- **Spec:** §13 (strategy selection), §1.1 (premises with source labels), §16 (load-bearing vs decorative).

### Stage 2: solve
- **Input:** `formal.json`
- **Output:** `answer.json` — `{answer, trace[], tools_used[]}`
- **Judgment/code split:** For COMPUTATION strategy, the pipeline can execute a solver script deterministically. For other strategies, the agent solves but must record the trace in the structured format.
- **Gate:** answer present in the required format (format regex from task spec).
- **Spec:** §2 (algorithmic strategies), §4 (operational protocols).

### Stage 3: verify
- **Input:** `answer.json` + `formal.json`
- **Output:** `report.json` — `{checks[{name, result, detail}], overall}`
- **Deterministic checkers run here (all code, no judgment):**
  1. `lint-claims` — shape-words, assumptions, universals (§11.1)
  2. `crosscheck` — MC-tags vs tool log (§7.2) *(requires tool log input)*
  3. `tiebreak-check` — **NEW**: spec key order vs comparator equivalence (§5 mode 14)
  4. `bound-check` — **NEW**: prune direction vs objective/bound (§5 mode 16)
  5. `verifier-comb` — **NEW**: combine checkers, track falsified assumptions (§5 mode 15)
- **Gate:** all checkers pass, OR failures explicitly acknowledged with reason. Unacknowledged failures block.
- **Spec:** §3 (verification), §5 (failure modes), §11 (adversarial testing), §15 (chains).

### Stage 4: label
- **Input:** `report.json` + `answer.json`
- **Output:** `sidecar.json` — `{task_id, label, basis, strategy_tag}`
- **Judgment/code split:** The agent assigns the label (judgment), but the pipeline enforces §3.4 rules as code: `verified` requires all checkers passed; `supported` requires cited evidence; the basis must be non-empty. A `verified` label with failing checkers is rejected by the pipeline.
- **Gate:** label present, basis non-empty, label consistent with verification report.
- **Spec:** §3.4 (vocabulary), §3.6 (judgments carry labels), §8 (calibration logging).

### Stage 5: seal
- **Input:** all stage artifacts
- **Output:** `envelope.json` — signed Ed25519 envelope over the artifact hashes
- **Pure deterministic.** Uses existing `hash.mjs` + `envelope.mjs`. Never fails (hashing is total).
- **Spec:** evidence toolkit standard.

## New components (build order)

### Priority 1: tie-break equivalence checker (mode 14)
**Value:** HIGH — catches the v3-sched-002 class (serialization-order bugs).
**Feasibility:** HIGH — pure deterministic comparison logic.
**Spec:** Given a spec key order `[(field, direction), ...]` and a comparator function, verify equivalence.
**Implementation:** `tiebreak-check.mjs`
- Input: `{spec_order: [["start","asc"],["name","asc"]], comparator: <fn>, candidates: [...]}`
- For each pair of candidates: compare via spec order (tuple comparison) vs via comparator. Any disagreement = FAIL with the disagreeing pair.
- Also detects serialized-string comparison: if comparator stringifies before comparing, flag as suspect (mode 14 pattern).
- This is the "two-line proof" from mode 14 as executable code.

### Priority 2: bound-direction checker (mode 16)
**Value:** HIGH — catches the v5 inverted-pruning class.
**Feasibility:** HIGH — the §4 item 10 checklist as code.
**Spec:** Given `{objective: "min"|"max", bound_fn, prune_condition, incumbent}`, verify the prune fires only when the bound proves the branch cannot win.
**Implementation:** `bound-check.mjs`
- Input: `{objective, bound_type: "upper"|"lower", prune_code: <string>, test_cases: [...]}`
- Static check: parse the prune condition, verify the comparison direction matches (for max: prune when `bound <= incumbent`; for min: prune when `bound >= incumbent`).
- Dynamic check: run the prune against test cases including known-optimal branches; verify optimal branches are never pruned.
- Flags `prune on raw partial score` (not a bound) as defect.

### Priority 3: verifier-combination library (mode 15)
**Value:** MEDIUM — tracks which assumptions each verifier falsifies.
**Feasibility:** HIGH — bookkeeping + logic.
**Spec:** Each verifier declares `falsifies: [assumption_ids]`. The library computes coverage: which assumptions are falsified by at least one *independent* verifier (one that doesn't share the assumption's implementation).
**Implementation:** `verifier-comb.mjs`
- Input: `{verifiers: [{name, falsifies[], shares_impl_with[]}], assumptions: [...]}`
- Output: coverage report; flags assumptions with zero independent falsifiers.

### Priority 4: prose→argumentation bridge (§1.1)
**Value:** HIGH — makes §1.1 chains machine-checkable.
**Feasibility:** MEDIUM — structured template the agent fills; full NLP parsing is out of scope.
**Spec:** A JSON schema for argument chains: `{premises: [{id, text, source}], steps: [{from[], rule, to}], conclusion}`. The pipeline validates: every `derived` premise has a producing step; every step names a rule; no step combines two unstated rules.
**Implementation:** `arg-check.mjs` — validates chain structure, not content.

### Deferred
- Differential/correlated-verification checker: overlaps with verifier-comb; revisit after Priority 3.
- Open-set claim × independent-log verifier: needs log infrastructure; lower feasibility.
- Verbalized-uncertainty calibration, measured critic protocols: already ahead per sweep; no build needed.

## Interfaces for judgment stages

Where the spec requires agent judgment, the pipeline defines the interface but doesn't implement the judgment:

```json
// formalize output (agent fills, pipeline validates)
{
  "strategy": "COMPUTATION | SEARCH | LOOKUP | DECOMPOSITION | JUDGMENT",
  "strategy_basis": "one line: why this strategy",
  "premises": [{"id": "P1", "text": "...", "source": "observed|stated|derived|assumed"}],
  "constraints": ["..."],
  "success_criteria": "...",
  "load_bearing": ["..."],
  "decorative": ["..."]
}

// label output (agent assigns, pipeline validates consistency)
{
  "task_id": "...",
  "label": "verified|supported|plausible|unknown",
  "basis": "one line naming the evidence",
  "strategy_tag": "§13 tag"
}
```

## Usage

```
node pipeline.mjs --task <task-file.json> [--tools-log <log.json>]
```

Runs formalize → solve → verify → label → seal. Each stage writes its artifact to `./runs/<task-id>/`. The pipeline stops at the first failing gate and reports which gate failed and why.

For stages requiring agent judgment (formalize, solve for non-COMPUTATION, label), the pipeline can run in `--assist` mode: it validates inputs/outputs and runs deterministic checkers, but pauses for the agent at judgment points.

## Resumption notes

- This is Phase 1 (Design). Implementation starts with the pipeline skeleton + Priority 1 (tie-break checker).
- Existing tools are NOT modified. New code lives in `~/workspace/reasoning-runtime/`.
- The `runs/` directory is gitignored-equivalent (ephemeral); `DESIGN.md` and source are durable.
- Next session: implement `pipeline.mjs` skeleton, then `tiebreak-check.mjs`.
