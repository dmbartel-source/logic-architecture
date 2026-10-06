# Architecture Findings — Candidate Drivers for Logic Architecture v1.8

**Date:** 2026-10-05
**Source:** Reasoning runtime build (Phases 1–6), blind adjudications, batch bank runs.
**Status:** CANDIDATE findings. The spec (`~/workspace/architectures/logic-architecture-v1.7.md`) is NOT modified. These are documented for a future version driven by empirical evidence, per §19 (every candidate requires a baseline-vs-treatment trial).

Each finding has: the observed pattern, where it bit us, the runtime's mechanical response, and what a spec change could look like.

---

## F1. Silent requirement-dropping (the dominant failure mode)

**Observed:** Across Phases 4–5, the most common solver defect was not wrong computation but *silently ignoring* prompt requirements the parser didn't understand: waypoint constraints (route-002/006), k-th enumeration qualifiers (route-004), unparseable objectives falling back to distance (route-003), unbuilt links treated as traversable (distract-003).

**Where it bit:** 4 of 7 Phase-4 misses; the v5-sched-001 bank bug had the same shape on the generator side (prompt/generator precedence mismatch).

**Runtime response:** Solvers now `FATAL` on unparseable objectives/qualifiers instead of defaulting. Adjudicators' recommendation, implemented: "fail loudly, implement rules literally."

**Candidate spec change:** Promote to a named failure mode (mode 17?): *requirement elision* — any problem element present in the prompt but absent from the formalization is a defect, detectable mechanically by a coverage check (prompt noun-phrases vs formalized constraints). This is stronger than §16's load-bearing/decorative split: it's not about importance, it's about *acknowledgment*. A requirement may be deliberately set aside, but never silently.

**Evidence needed for adoption:** A/B trial — solver with elision-check vs without, on a bank with planted unparseable requirements. Measure: does the check catch elisions without false positives on decorative text?

---

## F2. Tie-break serialization (mode 14 confirmed in the wild)

**Observed:** The v3-sched-002 bug (comparing `${name}@${start}` strings instead of structured keys) is not a one-off. The runtime's `tiebreak-check.mjs` catches it via two independent signals: (a) serialization heuristic (stringify-before-compare), (b) pairwise disagreement between spec-order tuple comparison and the comparator.

**Where it bit:** v3-sched-002 (historical), v8-sched-001/004 (two-stage tie-break implemented as triple-lexicographic — same family: the code's comparison doesn't match the prompt's stated rule).

**Runtime response:** `tiebreak-check.mjs` is now wired into real scheduling task files (Phase 4), not just fixtures.

**Candidate spec change:** §5 mode 14 already covers this, but the runtime suggests strengthening: the *two-line proof* (spec order vs comparator equivalence on all pairs) should be a MANDATORY gate for any solver implementing a tie-break, not an advisory check. The v8-sched-001/004 bugs would have been caught at build time.

**Evidence needed:** Already have positive cases (catches real bugs). Need negative-case data: false-positive rate on correct comparators.

---

## F3. Bound-direction errors (mode 16 confirmed in the wild)

**Observed:** The v5 inverted-pruning bug (`if -score < best` in a maximization) recurs as a *class*: any branch-and-bound solver can invert the prune direction. `bound-check.mjs` catches it statically (comparison direction vs objective) and dynamically (optimal branch pruned in test cases).

**Where it bit:** v5-sched-003 (historical), caught in fixture testing.

**Runtime response:** `bound-check.mjs` exists and is tested; not yet wired into all BNB solvers' build process.

**Candidate spec change:** Merge with F2's lesson: §4's bound-direction checklist (item 10) should be executable as a pre-commit gate for any new BNB solver, the same way tiebreak-check is. The spec's prose checklist becomes a program.

---

## F4. Distractor-induced pruning (new variant)

**Observed:** v8-distract-002: a "correction" in the prompt ("use 0.85 not 0.9") was itself the distractor; the solver applied it and pruned the correct computation. This is distinct from ignoring distractors — it's *obeying a distractor that masquerades as a correction*.

**Where it bit:** Phase 5 adjudication.

**Runtime response:** Per-task solver with explicit distractor handling; §16 load-bearing/decorative split applied first.

**Candidate spec change:** §16 (distractor resistance) could gain a sub-case: *correction-shaped distractors* — prompt elements that claim to correct other elements. The discipline: corrections must be validated against the primary computation, not trusted on authority of being labeled "correction." This connects to §19's "no mechanism enters on authority alone" — the same principle applied to prompt elements.

**RESOLVED 2026-10-06 (trial `trials/f4-correction-probes/`, ADOPT):** the discipline is empirically supported — baseline 8/16 (0/8 on items with bogus corrections), disciplined joint-validation 16/16, cost parity. Key refinement: validation must be JOINT over all corrections (power set vs stated subtotal), not per-correction. Proposed v1.9 §16 sub-case text drafted in the trial report. Note the E2 v10 work: v10's F4 items are heterogeneous (rate sheets, ledgers, scale tickets) with no stated subtotal, so the mechanism generalized to corroboration/contradiction evidence sets; fail-loud-on-inconclusive preserved. Sealed v1.8 spec NOT modified.

---

## F5. The formalism-transfer gap (§3.6, from v1.7 transfer review)

**Observed:** v1.7 transfer review scored 5/12 (below v1.6's 7.5/12). Strategy tags: 1/4. Formal uncertainty labels: 0/4. Verification discipline: 4/4. The *substance* of §3.6 transfers (grounded reasoning, limits, natural-language uncertainty) but the *formal tags and label vocabulary* do not.

**Runtime response:** The pipeline enforces label consistency as code (§3.4), but the Phase 6 JUDGMENT work found that heuristic solvers are more honest with `plausible` than `supported` — the label vocabulary works when it's tied to *evidence strength*, not when it's a required tag on every judgment.

**Candidate spec change:** Lighten §3.6: natural-language uncertainty equivalents count; OR move formal tagging from decision time to logging time (the pipeline's sidecar already does this — the label is assigned after verification, not during reasoning). The meta-finding: formalism that fights natural expression loses; formalism that *records* natural reasoning wins.

---

## F6. Calibration labels need evidence-strength grounding

**Observed:** Phase 6 wired heuristic solvers (critique, strategy-classification) with `plausible` labels instead of `supported`. This was not a concession — it was the *correct* label per §3.4's evidence-strength semantics. The pipeline's label gate (rejecting `verified` when checkers fail) worked as designed.

**Candidate spec change:** None needed — this validates §3.4 as written. Noted here because the runtime is the first *executable* confirmation that the label vocabulary is sound when tied to evidence strength.

---

## F7. Performance as a correctness-adjacent concern

**Observed:** pack-002 (2D packing) took ~105s with naive branch-and-bound. Optimization attempts: memoization OOM'd (state space too fine-grained); fractional-knapsack bound + greedy incumbent is the viable path. The lesson: *the choice of bound is a correctness-adjacent decision* — a bound that's too loose doesn't produce wrong answers, but it makes verification (re-running the solver) impractical, which undermines §15's verification chains.

**Candidate spec change:** §10 (effort cost model) could note: solver performance bounds are part of the verification contract. A solver that takes 100x longer than the task's time budget can't be re-verified, which is a §15 chain weakness.

---

## Summary for v1.8 triage

| ID | Finding | Spec area | Trial needed? |
|----|---------|-----------|---------------|
| F1 | Silent requirement-dropping → mode 17 (elision check) | §5, §16 | Yes: A/B on planted elisions |
| F2 | Tie-break check as mandatory gate | §5 mode 14 | **RESOLVED 2026-10-06 (trial f2-f3-fpr):** adopted with redesign — pairwise disagreement BLOCKS the gate; serialization heuristic demoted to ADVISORY (1 FP on trial corpus, fires on correct padded serializations). Candidates must include key-order-conflicting (adversarial) pairs, documented in checker header. Corpus now 0 FP / 8 with retained recall on the v3-sched-002 pattern. Code changed in `tiebreak-check.mjs`; fixture candidates upgraded with adversarial pairs. |
| F3 | Bound check as pre-commit gate | §4 item 10, §5 mode 16 | **RESOLVED 2026-10-06 (trial f2-f3-fpr):** adopted with redesign — gate on DYNAMIC check only (`pruned_optimal_branch` / case verdicts); all static `*_SUSPECT` findings demoted to advisory. Trial showed 3/3 FP on real correct prunes and the old "prescribed correct pattern" (`bound <= incumbent` for max) was dynamically wrong (prunes tie branches). Backwards detail messages fixed; strict-vs-nonstrict documented as tie-break semantic, not direction error. Code changed in `bound-check.mjs`; corpus now 3/3 correct prunes PASS, v5-pattern bug still FAILs. |
| F4 | Correction-shaped distractors | §16 | **RESOLVED 2026-10-06 (trial f4-correction-probes):** ADOPT. 16-item probe bank (bogus/valid/double/control); baseline (apply-all-corrections) 8/16 with 0/8 on bogus items — failure reproduces; disciplined (joint power-set validation vs stated subtotal) 16/16, cost parity. Key finding: correction validation must be JOINT, not per-memo (independent validation fails compositional double-memo items). Proposed v1.9 spec text drafted in trial report; sealed v1.8 spec not modified. |
| F5 | §3.6 formalism-transfer gap | §3.6 | Yes: transfer re-test with lightened rule |
| F6 | Label vocabulary validated | §3.4 | No: confirmation, not a change |
| F7 | Performance as verification contract | §10, §15 | No: note, not a rule change |

**Strongest v1.8 candidates:** F1 (new failure mode with mechanical detection) and F5 (transfer-review-driven, already queued as a v1.8 driver in the v1.7 acceptance record).
