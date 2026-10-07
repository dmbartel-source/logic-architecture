---
name: "logic-reasoning"
description: "Apply the Logic Architecture v1.10 reasoning discipline: strategy selection, structured argument, grounded verification with tooling, calibrated uncertainty labels, counterfactual checks, and adversarial review. Trigger on consequential factual questions, recommendations, code builds, or high-uncertainty requests — anywhere a wrong answer has cost."
---

# Logic Reasoning

## Purpose
Enforce reasoning quality control on consequential work: every consequential claim must be checkable, grounded in external evidence or tool traces, and labeled with honest uncertainty. Full specification: `~/workspace/architectures/logic-architecture-v1.10.md` (v1.10.0). Layers: 0 Foundations, 1 Core reasoning, 2 Guards, 3 Meta-reasoning, 4 Measurement, 5 Evolution.

## v1.10 notes
- **Mode 21 (new): verdict-preserving unfaithfulness.** An incorrect formalization executes successfully and emits the expected verdict — the trace is faithful to a wrong model, so verdict checking and trace-faithfulness oracles are blind to it. Detection: the T1/T2/T3 battery — T3 (verdict correctness) alone is insufficient; T1 (each prompt requirement's *content* present in the formalization) and T2 (independent constraint set from the prompt matches the solver's) must also pass. A large T3-vs-(T1/T2) gap is the VPU signature.
- **Mode 17, third detection leg: dropped-claims audit log.** Solvers log every considered requirement as ACCEPTED (used, with provenance) or DROPPED (with reason); the certificate survives fail-loudly paths. Detection rule: fluent output AND dropped_count > 0 → alarm. Catches latent drops (correct-by-luck outputs) that output-consistency checks cannot see.
- **§5 Family D** now (17, 20, 21): 17 *drops* requirements visibly, 20 is *unverifiable*, 21 *distorts but the verdict survives*.

## v1.9 notes (retained)
- **§5 family reorganization:** failure modes now grouped by causal mechanism — A Fabrication (1,2,3,19), B Selection (14,15,18), C Search pruning (16), D Elision & verifiability (17,20), E Calibration (7,8), F Process failures (4,5,6,9,10,11,12,13). New modes: 18 (non-canonical optimum selection), 19 (output-time deception), 20 (hollow convergence).
- **Builder's checklist (§18):** when constructing evaluations or generators, run the failure-mode catalog against your own work: bound-direction, tie-break comparison, accumulator audit, marginal-vs-total, constraint-soundness, validity+objective scoring (new item 6).
- **Literature gate (§19):** external ideas are candidates, not adoptions. Test before integrating (A/B vs baseline). New: locked operating points required for detector trials (8-field Operational Validity Contract).
- **Change policy:** integrate new mechanisms into existing sections; do not append. Before adding a guard, show why existing mechanisms don't cover it.
- **Requirement elision (mode 17, §5 Family D):** the dominant runtime failure pattern — silently dropping unparsed requirements instead of failing loudly. MUST refuse rather than default when a requirement can't be parsed. Detection is now two-layer: the procedural fail-loudly discipline plus the production dropped-claims audit log (v1.10 third leg).
- **§3.6 purpose-split:** formal uncertainty labels required for *predictions* (calibration needs them); natural-language uncertainty accepted for *non-predictions*; recording permitted at logging time rather than inline.
- **§16 step 3 (completeness):** after listing load-bearing vs decorative elements, verify each load-bearing element maps to the formalization.
- **§8.6 live estimation (new):** XConf-style recall runs alongside the bands-as-contract (not replacing). Bands are the target, recall is the estimate.

## Workflow

**0. Select the strategy (§13).** Before solving, classify in one line:
- **LOOKUP** → retrieve + extract (§4a). **COMPUTATION** → formalize, execute via tool, never mental-math consequential arithmetic. **SEARCH** → bounded brute force (cap stated) or guarded greedy. **DECOMPOSITION** → §2.1, or a §9 template if the task matches a known type. **JUDGMENT** → §4d, do not disguise as computation.
- **Template-fit test (§14):** state the task's inputs in the template's slot language; if any input must be distorted or shoehorned to fit, the template does not apply — decompose fresh. A false negative (fresh decomposition) costs effort; a false positive (misapplication) produces clean-looking wrong answers.
- If the strategy fails, log the misclassification and reclassify — don't push harder.

**1. Classify the claim.** Is it consequential (a reasonable person would act on it — a price, time, address, bug diagnosis, recommendation, experiment verdict)? If yes, the full discipline applies. If no, answer normally.

**2. Structure the argument.** For consequential claims, the chain must exist before delivery:
- Premises labeled by source: `observed` (tool output, fetched page, file read), `stated` (user-provided), `derived` (via a named rule), `assumed` (flag it — never bury it).
- Each inference step names its rule. No step combines two unstated rules.
- If you cannot write the chain, you do not have the claim.

**3. Run the inference guards.** Before delivering, check:
- Affirming the consequent: passing tests ≠ proven correct → say "no failing evidence found."
- Denying the antecedent: unverified ≠ disproven → say "unverified."
- Quantifier scope: name the domain of every universal ("all 8 zips," not "all files").
- Equivocation: one fixed meaning per key term per argument.
- Base rates: report denominators ("1 of 14 runs").
- Causal overreach: co-occurrence is a hypothesis, not a finding.

**4. Cross-check prose against traces — and chain the verification (§15).** For any "I verified / computed / checked / confirmed X":
- Tag mechanical claims inline as `[MC-n]` while drafting.
- Run `node ~/workspace/logic-tools/crosscheck.mjs --draft <file> --log <tool-log.json>`; resolve every UNMATCHED/PARTIAL tag (correct, actually run the tool, or cut).
- Manual element-by-element pass remains mandatory for consequential claims — the tool catches what the eye skips.
- **Verification chains:** for tasks with 3+ steps, verify per step; every handoff is a verification point. A step whose output cannot be verified is the weak link — everything downstream inherits at most `supported`. Never smuggle an unverified intermediate downstream as if verified (§5 mode 13).
- **Correlated verification (§5 mode 15):** a re-check that shares the original's implementation assumption cannot falsify that assumption. For each check, name what it is capable of falsifying; agreement between methods is evidence only about assumptions they don't share.

**5. Lint the wording.** Run `node ~/workspace/logic-tools/lint-claims.mjs --file <draft>` before delivery. Zero unresolved flags on consequential outputs. Shape-words ("verified," "confirmed," "guaranteed") must be §3.4 labels with cited traces or be relabeled.

**6. Label uncertainty — exactly one label, no blends:**
- **Verified:** full cross-check passes; trace cited.
- **Supported:** external evidence cited, full cross-check not performed/applicable.
- **Plausible:** consistent with evidence, none cited; reasoning shown.
- **Unknown:** cannot be established; state what would establish it.
- **Judgments carry labels (§3.6, new in v1.6):** every consequential judgment gets a strategy tag and uncertainty label at decision time.
- **Recalibrated labeling (§8.5, new in v1.5):** complete, checked reasoning earns `supported`, not `plausible`; reserve `plausible` for claims with a real gap in the reasoning.
- **Benchmark-mode delivery (§3.4):** bare-answer submissions ship a sidecar labels file (`{task-id, label, basis}` per answer) — uncertainty stays explicit when the format has no room for it.
- Consequential *predictions* get logged: `node ~/workspace/logic-tools/log-claim.mjs --claim "<text>" --label <label> [--category <cat>] [--checker-pass N --checker-fail N --tool-calls N]`; fill in `outcome` when known. The helper records `output_chars` (= `String(claim).length`, same definition as the runtime) at log time — retrospective feature extraction is impossible, and the R2 re-label trial needs these fields on the next ≥20 resolved manual claims.

**7. Counterfactual check (consequential decisions/predictions).** Before delivery: pre-mortem (assume the conclusion is wrong — what failed?), disconfirmation search (name the single most weakening observation; check it), sensitivity (smallest input change that flips the result — if an epsilon change in a `plausible` premise flips it, the label is wrong).

**8. Critic pass (consequential claims).** A separated critic (subagent or fresh context) receives ONLY claims + cited evidence, never the reasoning chain, with a neutral (non-adversarial) brief. Score accuracy, don't reward flaw-finding; triage substantive vs cosmetic findings before blocking. Address or rebut every substantive finding; unaddressed substantive findings block delivery.

**9. Budget effort.** Estimate in cost units before multi-step work: tool call = 1, browser task = 15, subagent = 25, user interruption = 50, wall-clock minute = 2. Never brute-force what structure can answer. If cost exceeds value, report the estimate instead of proceeding. Never spend a user interruption on what a tool call could settle.

**10. Distractor check (§16).** During strategy selection, name which prompt elements are load-bearing (they change the answer if removed) and which are decorative. Solve using only load-bearing elements; if the solution later needs a decorative one, it was misclassified — reclassify, don't smuggle.

## Output Contract
Consequential answers carry: the claim, its uncertainty label, the cited evidence/trace, flagged `assumed` premises, and (for decisions) the sensitivity condition — what would change the answer. Uncertainty smoothing (upgrading a label in delivery) is a defect, not a style choice.

## Operating Rules
1. Deterministic verifiers beat re-reading: run code, don't re-read it; `sha256sum`, don't assert integrity. A second prose pass is not verification.
2. Prefer the checking procedure whose failure is most informative: direct proof first; if the claim resists it, that resistance locates the weak premise — try contrapositive or contradiction.
3. Decompose large problems with clean subproblem interfaces; use the §9 template library for known task types (research / build / comparison / debugging) — but if the task doesn't fit the template's slots without distortion, decompose fresh.
4. Greedy choices are guilty until proven innocent: permitted only if reversible or provably non-foreclosing. Keep two candidate paths open on hard problems until evidence discriminates.
5. On high uncertainty: classify as missing-facts (look up if cheap), missing-premises (ask the single most informative question), or irreducible ("I don't know, and here is what would settle it").
6. The guards are themselves guarded: linter output is deterministic and not gradeable by charm; the critic never sees the draft's chain; calibration hit rates are computed, not asserted.
7. Bound-direction checklist (§4 item 10, §5 mode 16): every branch-and-bound prune states the objective direction and shows the prune fires only when the bound cannot beat the incumbent (max: prune only if optimistic_upper <= incumbent). A prune on a raw partial score is always suspect.
8. Ordering comparisons: when a spec defines a multi-key ordering, compare structured key tuples — never lexicographic order of serialized strings. The serialization format is for output; the comparison key is a separate object (§5 mode 14).
9. Secondhand process reports lose to direct artifact inspection: a claim about what a script/tool/subagent did is itself a grounded claim (§5 mode 12).
