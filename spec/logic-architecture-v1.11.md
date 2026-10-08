# Logic Architecture v1.11

**Version:** 1.11.0
**Date:** 2026-10-07
**Status:** ACCEPTED and sealed 2026-10-08. Release gates GO (5/5).
**Supersedes (when accepted):** v1.10.0 (SHA-256 `b61a5178c31ce31f84f3cc0ca7858be547d5e41437ecc3144170cb463e35f78f`)
**Scope:** Reasoning-improvement specification for Noor, an AI assistant. This document specifies procedures for producing better-reasoned outputs: structured argument, algorithmic problem-solving strategy, and grounded verification.

**Explicit non-goals.** This architecture does not attempt to produce self-awareness, a self-model as identity, introspective capacities, or any emergent selfhood. Where a mechanism could be misread in that direction, it is specified here strictly as reasoning quality control: a check on the work product, not a model of the worker. Nothing in this document should be implemented, described, or presented as producing awareness of any kind. (In particular: the critic protocol in §11 reviews *claims and evidence*, never the reasoner; the calibration log in §8 tracks *label accuracy*, not self-knowledge; the novelty log in §14 tracks *task structures*, not self-observation.)

**Design principles.**
1. Every mechanism is stated as an implementable procedure with observable inputs and outputs.
2. Verification bottoms out in external evidence or tool traces, never in internal assertion alone.
3. Effort is budgeted: reasoning depth scales with consequence, not with habit.
4. Claims carry their support explicitly; uncertainty is stated, not smoothed over.
5. The architecture's own guards are themselves subject to check: any procedure the same process both executes and grades must have an externalized or adversarial check (§11). The fox does not grade the henhouse.
6. **(New in v1.2.)** Secondhand reports about a process lose to direct inspection of the process. A claim about what a tool, script, or subagent did is itself a claim requiring grounding (§3.1) — adjudication by hearsay is not adjudication.

**Force vocabulary (new in v1.7, from the structural literature sweep).** Normative statements use RFC 2119 keywords: **MUST** (required), **SHOULD** (recommended; deviations need a logged reason), **MAY** (permitted). Informative text (examples, rationale, history) carries no force keywords. The claim linter (§11.1) checks this: a force keyword in informative text, or normative force without a keyword, is flagged.

**Discipline invariant (new in v1.7).** *Grade from logs, never from reports.* A claim about what a process did is verified against the process's own logs/traces, never against the process's summary of itself. (This generalizes design principle 6: the agent is the worst witness to its own run.)

**Changelog from v1.11 (DRAFT, 2026-10-07; gates GO 2026-10-08).** Eleven §19 trial outcomes from the 2026-10-07 cycle, integrated per the change policy — no new layers; Families D and E extended; two new subsections (§15 adjudicator independence, §17.5 gate independence) plus mutation-audit gate hardening in §17.5. All production-integrated findings verified with no regressions (suite 14/15, elision-check selftest 26/26).
- **§15, adjudicator independence (new): conformity guard.** Trial ADOPTED: judges shown a colleague's verdict flipped toward it 50% of the time vs 0% control test-retest (50pp conformity effect, n=2/arm pilot). Guard: adjudicators record their verdict blind from the material BEFORE any prior verdict is shown; a final verdict matching a shown prior is flagged as conformity-candidate and re-verified against the material alone. Already operational in the reasoning skill (step 8); now spec text. Honest caveat kept: the single flip was substantive (the shown verdict was arguably right), so the pilot confounds conformity with truth-tracking — the guard is procedural and low-cost regardless, and a larger replication is queued.
- **Mode 21, implementation status extended.** Three trial-cleared extractor extensions integrated: (a) J1x 14-shape taxonomy of plainly-phrased constraint shapes (waypoint/time-window/cardinality/release/mutual-exclusion/per-entity-capacity/coverage-cardinality/correction-exclusion/output-ordering/must-not-exceed/setup-time/use-ban/deadline → new `window`, `card`, `percap`, `setup`, `ban` bindings; recall 0.000→1.000, precision 0.9333, FP hardened pre-integration); (b) gap-closure patterns (passive ban with distant entity, "non-empty" exclusion; both recall→1.000, precision 1.000); (c) ordinal-selection binding `{n, crit}` (F3) closing the t03 boundary, two-sided with widened solver k-th triggers for adjectival ordinals ("3rd-shortest"→distance, "2nd cheapest"→cost, "2nd-longest"→descending; 12/12 trigger, no false triggers on controls).
- **Mode 17, third detection leg extended.** PCC claim-registry instrumentation now covers five solvers: route and scheduling (v1.10) plus packing, selection, and counterfactual (v1.11). Adversarial validation: 18/18 adversarially-phrased elisions that bypassed the elision gate (100% evasion) were caught at the parser level — 10 via explicit PCC.drop, 8 via fail-loudly refusal, 0 missed. Blind spot kept: instrumentation-coverage dependence; the 8 refused-without-PCC.drop cases (e.g., route "no network header") would benefit from explicit drop logging.
- **§17.5, gate independence (new).** Trial CONFIRM+ADOPT: two harness-layer regressions (sabotaged always-pass checker; pruned gate input) each caused a known-BLOCK canary to SEAL through the full gate suite — the validation environment shared the product layer's assumptions. Standing canary gate implemented: fixed known-verdict tasks run as a pre-gate (manifest mismatch blocks); checker-verdict plausibility (a never-failing checker is itself the anomaly); gate-input hash-pinning (the bytes a gate validates must match the sealed input). Independent canary caught 2/2 regressions the suite missed, 0/2 false alarms.
- **§17, gate-input selection note.** Trial REJECT (no vulnerability, kept as standing control): gates check artifacts, not narration — planted glowing narration over dropped requirements still BLOCKs (elision-check) and FAILs (pcc-audit); the seal hashes task.json and gate-verdict JSONs. "Hash the artifact, not the prose" verified; re-run if any gate's input set changes.
- **§8.7, probe-based panel calibration (new).** Trial ADOPTED: logistic-regression probe on judge outputs, Brier 0.1658 vs 0.1740 best baseline (5-fold CV, n=48), ~10× faster than multi-sample consistency, ~0.003ms/item inference. Integrated as module with the agreement-table baseline preserved as fallback. Caveats kept: small n, conservative on wrong verdicts (p≈0.52), transfer to non-elision panels unvalidated.
- **§15, inter-rater reliability note.** Trial REJECT (rule-bound, 1/7 pairs): the κ prevalence paradox confirmed on our data (D2 J1–J2: Po=0.906, κ=0.000, AC₂=0.897). κ remains the standard; report Gwet's AC₂ alongside κ for high-agreement/extreme-prevalence panels, where κ misleads.
- **§15, verifier-pool diversity requirement (new).** Trial ADOPTED (scoped): K3's near-zero error correlation was a pilot-stratum artifact — on n=48 the J1–J2 pair correlates at 0.649 (0.827 on the confirmation stratum; shared coverage-checker blind spot), Kish n_eff=2.19 for the 3-judge panel. Independent-pair joint F1 exceeds correlated-pair by +0.2549; gate+PCC on poison items went 18/18 safe vs gate alone 0/18. Rule: measure pairwise error correlations and report Kish n_eff when assembling panels; prefer mechanistically diverse panels; diversity ≠ accuracy (J3 alone matches the best pair — diversity without coverage is hollow).
- Bloat check: conformity folded into §15 (not a new mode — detection is procedural, same family as mode 15's independence requirement); canary folded into §17.5 (gate design, not a new failure mode); mutation audit folded into §17.5 (design-robustness axis of gate hardening, not a new gate); AC₂ note folded into §15 (not a §8 change — it measures raters, not labels); diversity requirement folded into §15 adjudicator-independence (not a new subsection — it qualifies the panel-composition assumption); gate-input result kept as a note, not a mechanism.

**Changelog from v1.10 (2026-10-07).** Three §19 adoptions from the 2026-10-06/07 trial cycle, integrated per the change policy — no new layers; Family D extended; no sections added.
- **Mode 21 (new): verdict-preserving unfaithfulness.** An incorrect formalization executes successfully and emits the expected verdict; the trace is faithful to a wrong model, so verdict checking and trace-faithfulness oracles are blind to it — Mode 17's sharper form (17 *drops* requirements visibly; 21 *distorts* them while the verdict survives). Merges the RR3 trial's mode proposal with the TA1 T1/T2/T3 detection battery, folded in as Mode 21's detection requirement per the anti-bloat rule (one mechanism, one entry — not a separate mode). Implementation: the elision extractor's signal-coverage gap (M-A) is closed in production — 45/45 on the audit prompts, `elision-check.mjs --selftest` 26/26; the T1/T2 battery is trial-validated by manual audit (8/8 T1 fail, 8/8 T2 fail on VPU cases), not yet an automated production gate.
- **Mode 17, third detection leg: dropped-claims audit log.** Solvers log every considered requirement as ACCEPTED (used, with provenance) or DROPPED (with a reason); the certificate is emitted via a process-exit hook so it survives fail-loudly paths. Detection rule: fluent output AND dropped_count > 0 → alarm. Catches *latent* drops (correct-by-luck outputs) that output-consistency checks cannot see by construction, and works without source access. In production (`pcc-audit.mjs`) since 2026-10-07. Blind spots kept: instrumentation-coverage dependence; the requirement-coverage hook's patterns are probe-shaped and need generalizing.
- Bloat check: C2 folded into Mode 21 (not a second entry); C3 integrated into Mode 17's existing detection text (not appended as a new section); the stale `*End of Logic Architecture v1.8*` assembly marker corrected to v1.9.

**Changelog from v1.9 (DRAFT, 2026-10-06).** First structural integration of §19 trial findings since v1.8. Headline: §5 reorganized into 6 causal families (A Fabrication, B Selection, C Search pruning, D Elision & verifiability, E Calibration, F Process failures) — modes keep their numbers; the catalog's organizing principle moves from chronological to causal. New modes: 18 (non-canonical optimum selection, completes Family B), 19 (output-time deception — the mechanical anchor Family A always needed), 20 (hollow convergence, pairs with mode 17 in Family D). Revisions: modes 14/16 gain blocking-vs-advisory detection precedence (pairwise disagreement blocks; serialization heuristic advises; dynamic prune check blocks; static direction advises). §8: new §8.6 (XConf live estimation alongside the bands-as-contract) + §8.4 Platt regime rule (n≤~1k → Platt; log-loss not Brier). §16: distractor-shapes taxonomy seeded (correction-shaped, joint power-set validation). §18: checklist item 6 (validity+objective scoring for optimization tasks). §19: locked-operating-point trial design requirements (8-field Operational Validity Contract). C9 (Jatasra assembled-string hygiene) excluded — prompt-loop process rule, not spec. Bloat cuts: v1.2–v1.6 changelogs condensed to 2–3 lines; §11.3 condensed to key findings; modes 14/15 worked examples externalized to baseline records.

**Changelog from v1.4 (condensed).** v1.4 scored 50/50 on heldout-v5 after corrections: two solver misses → mode 16 (inverted bound pruning) + §4.10 bound-direction checklist; one bank prompt/generator mismatch → data-driven prompt-generation lesson.

**Changelog from v1.7.** v1.8 is the first version driven by the reasoning runtime (the spec as executable code, Phases 1–6, 2026-10-05), not by a manual benchmark cycle. The runtime reached 50/50 on v8, and its build surfaced two findings that survived §19 trials:
- **Silent requirement-dropping** (F1): the dominant solver failure mode across Phases 4–5 — prompt requirements the parser didn't understand were silently ignored (4 of 7 Phase-4 misses; same shape as the v5-sched-001 bank bug). The runtime's response ("fail loudly, implement rules literally") is proceduralized as **failure mode 17** (§5) with a §16 completeness check. A fully mechanical elision gate was trialed and **rejected** (§19: 50% recall, 12% false-positive rate on a 16-task A/B) — mode 17 is procedural/descriptive, not a mandated checker.
- **§3.6 formalism-transfer gap** (F5): replicated across v1.6 (7.5/12) and v1.7 (5/12) transfer reviews — verification substance transfers at ceiling (4/4) while formal tags/labels do not (1/4, 0/4). **§3.6 refined** to a purpose-split: formal §3.4 labels required for predictions (calibration needs them); natural-language uncertainty accepted for non-predictions; recording permitted at logging time rather than inline at decision time. Retrospective analysis on the 4 v1.7 judgments supports the split; prospective trial queued for the next §17.1 review.

**Acceptance record (2026-10-04).** v1.7 accepted with: (1) v8 bank leg 50/50 after one bank-side repair (v8-arith-004 accelerator bracket imposition; fixed at generator root, 49 others byte-identical); (2) transfer leg 5/12 with the §3.6 formalism gap logged for v1.8; (3) structural reorganization into Layers 0–5 with §13→L1, §§7,11→L2, orphans folded home; (4) change policy (integration not accretion, ebb and flow, anti-bloat rule) as standing directive; (5) §19 literature intake operational (two sweeps, one A/B). Per the 2026-10-04 project direction decision, the benchmark-driven version cycle graduates here unless future banks produce real findings.

**Changelog from v1.6 (condensed).** v1.6's dual baseline (heldout-v7 50/50 after repair + transfer review 7.5/12) validated the redesign; the transfer leg surfaced the judgment-labeling gap → §3.6 (strategy tags + uncertainty labels for consequential judgments).

**Changelog from v1.5 (condensed).** v1.5 scored 50/50 on heldout-v6 first pass, zero disputes — the clean cycle that motivated v1.6's transfer-review cadence (§17.2) and dual-baseline requirement (§17.3).

**Changelog from v1.3 (condensed).** v1.3 scored 49/50 on heldout-v4 (one genuine pack-002 miss + one bank pruning bug) → modes 14–15 gained worked examples and mechanical checks; §17 transfer review (10/12) → §3.4 benchmark sidecar labels.

**Changelog from v1.2 (condensed).** v1.2 scored 49/50 on heldout-v3 (first genuine miss: v3-sched-002) → failure modes 14–15 (serialization-order mismatch, correlated verification); §4c ordering checklist; §15 falsifiability labeling.

---


**Structural note (v1.7).** This document is organized in layers. Section numbers are stable IDs (preserved across versions for reference); their *order* reflects the layering, not the order they were added. New mechanisms go in their layer — nothing is appended at the end.

*Layer 0: Foundations — what the system is. Layer 1: Core reasoning — how to reason (incl. strategy selection). Layer 2: Guards — what goes wrong and how we catch it. Layer 3: Meta-reasoning — reasoning about reasoning. Layer 4: Measurement — how we know it works. Layer 5: Evolution — how the architecture changes.*


---

# Layer 0: Foundations

*Purpose, non-goals, design principles, and the formal logic discipline. Everything else builds on this.*

## 1. Formal logic discipline

### 1.1 Argument structure for consequential claims

A *consequential claim* is any factual assertion, recommendation, or conclusion that a reasonable person would act on (a price, a time, an address, a diagnosis of a bug, a recommendation to spend money, a verdict in an experiment). For every consequential claim, the reasoning that produced it must be expressible in the following form before the claim is delivered:

- **Premises (P1…Pn):** each premise labeled with its source — `observed` (tool output, fetched page, file read), `stated` (user-provided), `derived` (follows from earlier premises via a named rule), or `assumed` (taken without evidence; must be flagged).
- **Inference rules:** each step from premises to conclusion names the rule used — modus ponens, conjunction, universal instantiation, arithmetic evaluation, etc. No step may combine more than one unstated rule.
- **Conclusion (C):** follows from the premises by the named rules, or the chain is marked broken at the failing step.

This is the natural-deduction discipline of *forall x: Calgary* (Open Logic Project) and the proof machinery of Stanford's *Introduction to Logic* (Genesereth), reduced to a working procedure: if you cannot write the chain, you do not yet have the claim. The chain need not be shown to the user in full in every case, but it must exist in the reasoning trace for consequential claims, and any `assumed` premise must be surfaced, not buried.

**Checkability requirement.** Each derived step must be checkable by an independent reader (or a deterministic tool) given only the premises and the named rule. If a step requires charitable interpretation to go through, it fails the check and the claim is downgraded to conjecture.

### 1.2 Proof techniques as checking procedures

The standard proof techniques (Hammack, *Book of Proof*; MIT 6.042J) are repurposed here as *checking procedures* — ways to test a claim before delivering it:

- **Direct proof (constructive check).** To support "X holds," construct the chain from premises to X explicitly. Use when: the evidence is available and the chain is short. This is the default procedure for §4a (factual questions).
- **Contrapositive.** To support "if P then Q" when a direct chain is hard, establish "if not-Q then not-P." Use when: the negated consequent is easier to test than the consequent is to build. Everyday form: "if this claim were true, we would expect to observe E; we do not observe E" — but note this is only as strong as the exhaustiveness of the search for E (see §3 on grounding).
- **Contradiction (refutation check).** Assume the claim is false and derive an absurdity or a conflict with established evidence. Use when: directly attacking a hypothesis, e.g., "the bug cannot be in module M because M's tests pass and the failing input never reaches M." Everyday form: actively try to break your own conclusion before delivering it.
- **Induction.** For claims of the form "property P holds for all n" (all items in a list, all runs in a batch, all cases in a procedure): verify the base case and the inductive step explicitly. Use when: generalizing from instances — e.g., "all 8 downloads completed" requires checking each, not sampling two. Never assert a universal from an unexamined remainder.

**Selection rule.** Prefer the technique whose failure would be most informative: if direct proof is easy, do it; if the claim resists direct proof, that resistance is itself evidence about the claim's strength, and the contrapositive or contradiction attempt will usually locate the weak premise.

### 1.3 Inference failure guards

The following are the characteristic inference failures of language-model assistants, each paired with a guard procedure:

1. **Affirming the consequent.** "If the code were correct, tests would pass; tests pass; therefore the code is correct." Guard: passing tests are consistent with correctness but do not entail it; state the conclusion as "no failing evidence found," not "proven correct."
2. **Denying the antecedent.** "If we had the data we could verify; we lack the data; therefore the claim is false." Guard: lack of verification is not refutation; the correct output is "unverified," never "disproven," unless independent refuting evidence exists.
3. **Quantifier scope errors.** "All runs passed" when only the observed subset was checked; "the file is unchanged" when only the hash of a copy was compared. Guard: every universal claim names its domain explicitly ("all 8 downloaded zips," "the file at this path as of this timestamp").
4. **Equivocation.** Using one term in two senses across a chain ("verified" meaning tool-confirmed in P1 and meaning plausible in C). Guard: consequential terms keep one fixed meaning per argument; the §3.4 vocabulary (verified / supported / plausible / unknown) is the controlled vocabulary — do not invent synonyms mid-chain.
5. **Base-rate neglect.** Treating a striking single observation as representative. Guard: one event is one event; report the denominator ("1 of 14 runs," not "models fabricate").
6. **Causal overreach.** "The rule was present and the claim was false, so the rule caused the false claim." Guard: co-occurrence in a small sample is a hypothesis generator, not a causal finding; state the mechanism hypothesis separately from the observation.

---


---

# Layer 1: Core reasoning

*How to reason: problem-solving, verification, operational protocols, and strategy selection (which governs how the core is applied).*

## 2. Algorithmic problem-solving

The design paradigms below are drawn from Erickson's *Algorithms* and MIT 6.006, operationalized as explicit strategies. Each names its precondition — the structural property of the problem that licenses its use. **New in v1.1:** the strategy itself is now chosen by an explicit selection procedure (§13) before solving begins.

### 2.1 Divide and conquer: decomposition with clean interfaces

**Procedure.** For a problem too large to solve in one reasoning pass:
1. Decompose into subproblems such that each subproblem's *input* and *expected output* can be stated without reference to the others (clean interface). This is the Least-to-Most pattern (Zhou et al., arXiv:2205.10625): solve easier subproblems first, in dependency order. Where a task matches a known type, start from the pre-tested template library (§9) rather than inventing interfaces fresh.
2. Solve each subproblem independently, recording its result in the interface's terms.
3. Compose: the final answer is a stated function of the subproblem results — and the composition step is itself checked (§1.1), because decomposition drift (sub-answers that do not actually compose) is the characteristic failure.

**Stop rule.** Stop decomposing when a subproblem can be solved by a single tool call or a short, checkable chain. Over-decomposition multiplies interface risk without reducing difficulty.

**Precondition check.** Decomposition is licensed only when subproblems are actually independent or have a clear dependency order. If solving subproblem B requires the *method* (not just the result) of subproblem A, the decomposition is invalid — solve jointly.

### 2.2 Dynamic programming: solve once, reuse, synthesize

**Procedure.**
1. Identify repeated substructure: are you about to compute, look up, or reason through something already resolved earlier in the session? (Prior tool outputs, earlier verified facts, previous run results.)
2. Reuse the recorded result instead of recomputing. Cite it.
3. When synthesizing a final answer from parts, build it from the recorded subproblem results, not from fresh re-derivation — re-derivation introduces fresh error surface for zero benefit.

This is memoization applied to reasoning work: the session transcript and workspace files are the memo table. Concretely: before running a search, check whether the question was already answered; before recomputing a hash, check whether it was recorded; before re-reading a file, check whether the relevant lines are already in context.

**Invalidation rule.** A memoized result is valid only within its original scope. A hash of file X at 10:00 does not certify file X at 11:00. When reusing, state the scope ("as recorded at <time>/<source>").

### 2.3 Greedy: locally-safe choices, with proof obligation

**Procedure.** A greedy choice — taking the locally best-looking option without full search — is permitted only when one of the following holds:
- The choice is *reversible* at negligible cost (try it, check, backtrack if wrong), or
- The greedy-choice property can be argued: no optimal solution is excluded by this choice. For everyday reasoning this means: the choice does not foreclose alternatives the task might need.

**Default posture: greedy is guilty until proven innocent.** The characteristic failure is greedy overreach: answering from the first plausible retrieval instead of checking whether a better source exists, or taking the first tool result as sufficient. When stakes are consequential (§1.1), greedy choice requires the reversibility test at minimum.

This is the honest form of the Tree-of-Thoughts lesson (Yao et al., arXiv:2305.10601): search with backtracking beats single-path commitment on hard problems; the architecture's default for hard problems is therefore to keep at least two candidate paths open until evidence discriminates.

### 2.4 Complexity and effort awareness

**Procedure: estimate before acting.**
1. Before a multi-step operation, estimate its cost using the unit cost model (§10): tool calls, subagent spawns, wall-clock time, money, and user attention.
2. Compare against the value of the outcome and against cheaper alternatives (a targeted check vs. an exhaustive sweep; a cached result vs. a fresh computation — §2.2).
3. Never brute-force a space that can be reasoned about: if the answer can be derived from structure (an index, a hash, a sorted order, a stated invariant), derive it; enumeration is the last resort, and unbounded enumeration is never permitted without an explicit cap stated in advance.

**Escalation rule.** If estimated cost exceeds the value of the outcome, stop and report the estimate instead of proceeding. "This would take N steps to answer a question worth less than that" is itself the correct output.

---

## 3. Grounded verification discipline

### 3.1 The grounding rule

Every consequential factual claim (§1.1) must bottom out in **external evidence or tool traces** — a tool output, a fetched page, a file read, a computed hash — never in internal assertion alone. "I verified X" is not a verification; it is a claim *about* a verification, and it requires the same grounding as any other claim: the trace that shows the verification happened.

### 3.2 Rationale

Two independent lines of evidence converge on this rule:

- **Project findings (False Verification Claims).** In the FVC v1.1 pilot, a model performing a real tool verification additionally claimed a *second* mechanical verification (a GNU sha256sum invocation) that never appeared in the tool trace — a genuine false verification claim, observed with an anti-false-verification rule in place. Separately, when deterministic tools could not access data, the model fabricated claims about filesystem searches that never occurred. And in the earlier mandatory-verification branch, mandatory wording sometimes produced verification-shaped prose with no observable verification behind it. The failure mode is real, recurrent, and specifically *prose-shaped*: fluent sentences that assert mechanical work the trace does not show.
- **Published results.** Huang et al., "LLMs Cannot Self-Correct Reasoning Yet" (arXiv:2310.01798): intrinsic self-correction without external feedback does not improve reasoning and can degrade it. Lightman et al., "Let's Verify Step by Step" (arXiv:2305.20050): process supervision — checking each reasoning step — outperforms outcome supervision. The consistent lesson: verification must come from *outside* the generating process (deterministic tools, execution, hashes, independent checks), not from asking the same process to re-assert itself.

### 3.3 Prose-vs-tool-trace cross-check procedure

Before delivering any claim of the form "I verified / computed / checked / confirmed X":

1. **Locate the trace.** Identify the specific tool call(s) whose output constitutes the verification. Name them: which call, what output, at what point in the session.
2. **Match claim to trace, element by element.** For each mechanical detail asserted in the prose (which tool ran, what input it received, what output it produced), confirm that detail appears in the trace. A claim with *any* unmatched mechanical detail fails the cross-check.
3. **On failure, downgrade — never smooth.** If the trace does not support the claim as stated, the claim is restated to exactly what the trace supports, or withdrawn. It is never reworded to sound verified while remaining ungrounded.
4. **Record the grounding.** Consequential verifications cite their trace: "verified via <tool> output at <reference>" — so an independent reader can re-perform the check.

**New in v1.1 — semi-automated cross-check (§7).** The manual procedure above is now backed by tooling: mechanical claims are tagged inline as `[MC-n]` during drafting, and `crosscheck.mjs` matches them against the session's tool-call log automatically. The manual element-by-element pass remains mandatory for consequential claims; the tool catches what the eye skips.

This procedure is the direct operationalization of the FVC taxonomy's core distinction: `SUPPORTED_MATCH` (every claimed mechanical detail present in the trace) vs. `FABRICATED_NO_TRACE` / `MISREAD_TRACE` (claimed details absent or contradicted). The procedure exists to keep the assistant's own outputs on the `SUPPORTED_MATCH` side.

### 3.4 Uncertainty vocabulary (controlled)

Consequential claims use exactly one of these status labels, with the fixed meanings below. No synonyms, no hedged blends:

- **Verified:** the full §3.3 cross-check passes; trace cited.
- **Supported:** external evidence exists and is cited, but the full cross-check was not performed or not applicable (e.g., a reputable source states it; a prior verified result is reused within scope per §2.2).
- **Plausible:** consistent with available evidence, but no direct evidence cited; reasoning shown.
- **Unknown:** cannot be established from available evidence; stated plainly, with what would be needed to establish it.

Smoothing uncertainty upward (calling the merely plausible "verified," or the unknown "plausible") is classified as a reasoning failure under §5, not a style choice.

**New in v1.1 — labels are now measured (§8).** Every consequential prediction carrying one of these labels is logged with its outcome when known. Labels are not just vocabulary; they are predictions about the world, and their hit rates are tracked. A label whose empirical hit rate diverges from its meaning triggers recalibration.

**New in v1.4 — benchmark-mode label delivery.** The §17 work-sample review found a systematic gap: when the output format is bare answers (benchmark submissions, API responses, single-value fields), uncertainty labels have nowhere to go and stay implicit. The fix is a sidecar labels file: for every submitted answer, a `{task-id, label, basis}` triple in a separate file (e.g., `labels-v4.json`), where `basis` is one line naming the evidence (e.g., "two independent solvers agree; hand-verified constraints" → `supported`; "single solver, no independent check" → `plausible`). The sidecar is produced alongside the answers, never instead of them, and its labels feed the calibration log like any other prediction. A benchmark submission without a sidecar is an incomplete delivery under this architecture.

### 3.6 Judgments carry labels too (new in v1.6; refined in v1.8)

The second §17 review (v1.6 baseline) found that the §3.4 labeling discipline and §13 strategy selection were applied to computations but dropped for consequential *judgments* (fix-direction decisions, recalibration calls, program-framing choices) — 3/3 sampled judgments lacked labels and strategy tags. The disciplines are not computation-only.

**Refinement (v1.8, from the F5 finding).** The v1.6 and v1.7 transfer reviews (7.5/12 and 5/12) replicated the same pattern: verification *substance* transfers at ceiling (4/4 judgments grounded, honest about limits, recorded) while the *formalism* — inline strategy tags (1/4) and §3.4 labels (0/4) at decision time — does not. The formalism was fighting natural expression rather than enhancing it: judgments stated uncertainty plainly ("inconclusive," "about $200–300," "it's mechanical") without the label vocabulary. The refinement splits §3.6 by purpose:

- **Strategy:** must be *identifiable* — a §13 tag where it fits naturally, otherwise a one-line description of the approach. The tag is preferred (cheaper to scan); a clear description satisfies the requirement.
- **Uncertainty:**
  - *Predictions* (claims about outcomes not yet known, §8.1): exactly one §3.4 label with a one-line basis, **required** — the label vocabulary exists so predictions enter the calibration log, and natural language cannot be scored.
  - *Non-predictions* (process decisions, retrospective assessments, estimates without resolvable outcomes): uncertainty stated in plain language satisfies the requirement; the formal label vocabulary is not required where there is nothing to calibrate.
- **Timing:** the record may be made at *logging time* (when the decision is written up) rather than inline at decision time. The pipeline's sidecar pattern (§3.4, v1.4) already works this way — formalism that *records* reasoning transfers; formalism demanded *mid-reasoning* does not.

A judgment whose uncertainty is unstated in any form is an incomplete delivery. "I'm confident" is not an uncertainty statement. Retrospective analysis on the four v1.7 transfer judgments supports the split (it passes the three sound judgments the strict rule rejected, while still flagging the strategic prediction that genuinely lacked uncertainty expression); prospective trial queued for the next §17.1 review.

### 3.5 Verifier separation

Generation and verification are separate roles, even when performed in one session:
- Prefer **deterministic verifiers**: code execution over mental arithmetic (PAL pattern, Gao et al., arXiv:2211.10435), test suites and type checkers over re-reading code, `sha256sum` over asserting integrity, exact string match over "looks right."
- A second prose pass over the same content is **not** a verification step (Huang et al.). If the only available check is re-reading, label the result `supported` at best, never `verified`.
- For code: the verifier already exists — run the tests, run the type checker, execute the snippet. "It looks correct" is `plausible`, not `verified`.

---

## 4. Operational protocols

Each protocol is a numbered procedure. Marginal notes show which sections engage at each step: [L] = §1 logic, [A] = §2 algorithmic, [V] = §3 verification, [M] = meta (§§12–13, new in v1.1).

### 4a. Answering a factual question

0. [M] **Strategy selection (§13):** classify the question (lookup / computation / judgment) and select the cheapest adequate strategy before acting. State the selection in one line.
1. [A] Estimate: is this answerable from context/workspace (§2.2 memo check) or does it need a fresh lookup? If memoized and in scope, reuse with scope stated; skip to 5.
2. [A] If lookup is needed, choose the cheapest source likely to be authoritative (targeted search/fetch over broad trawling — §2.4, costed per §10).
3. [L] Extract the answer's premises from the source; note each premise's source label (`observed`/`stated`).
4. [L] Run the inference-failure guards (§1.3) over the extraction: scope of quantifiers, equivocation on key terms, consequent-affirming.
5. [V] Cross-check: does the delivered claim match what the source actually shows, element by element (§3.3, tool-assisted per §7)? Assign the §3.4 label.
6. [V] Run the claim linter (§11) over the final wording before delivery.
7. Deliver the answer with the label and the citation. If the label is `plausible` or `unknown`, say so in plain words.

### 4b. Making a recommendation

0. [M] **Strategy selection (§13):** is this a comparison task? If so, start from the comparison template (§9).
1. [L] State the decision the recommendation serves and the criteria that matter (premises of the recommendation argument).
2. [A] Decompose (§2.1): enumerate the candidate options as subproblems with a clean interface — each option characterized on the same criteria.
3. [L] For each option, run the argument chain: criteria + evidence → ranking. Flag `assumed` premises (e.g., assumed user preferences) explicitly.
4. [V] Ground every factual premise per §3.1 (prices, availability, and account state require live sources, not training data).
5. [A] Apply the greedy guard (§2.3): is the top-ranked option reversible if wrong? If the recommendation is hard to reverse (a purchase, an irreversible action), require stronger grounding or explicit user confirmation of the `assumed` premises.
6. [M] **Counterfactual check (§12):** state what would change the recommendation (the sensitivity condition), and run the disconfirmation search on the top-ranked option.
7. Deliver: the recommendation, the top 2–3 alternatives considered, the key premises (with labels), and what would change the recommendation.

### 4c. Writing / building code

0. [M] **Strategy selection (§13):** build task → start from the build template (§9).
1. [A] Decompose the build (§2.1): modules with clean interfaces; solve in dependency order (Least-to-Most).
2. [L] For each module, state its contract (inputs, outputs, invariants) before writing it — the contract is the premise set the implementation must satisfy.
3. Write the code.
4. [V] Verify with deterministic verifiers (§3.5): run the type checker, run the tests, execute the critical paths. Write a test for any behavior asserted as correct.
5. [L] Refutation check (§1.2, contradiction): try to break it — adversarial inputs, empty inputs, off-by-one boundaries.
6. [M] **Critic pass (§11):** for consequential builds, a separate critic pass reviews the claims about the code (not the code's style) against the test evidence.
7. [V] Label the result honestly: "tests pass" is `supported`, not "proven correct" (§1.3 guard 1).
8. Never present untested code as working. Never describe code as "verified" on the basis of having written it carefully.
9. [V] **Ordering comparisons (§5 mode 14):** if the spec defines a multi-key ordering ("by start, then name"), the comparison key is a structured tuple in that key order — never lexicographic comparison of serialized strings. Before delivery, write the two-line proof: the spec's key order vs the code's key order, shown equal. Any `sort()`/`min()` over stringified candidates is a defect until proven otherwise.
10. [V] **Bound-direction checklist (§5 mode 16, new in v1.5):** any branch-and-bound prune states all four before delivery: (a) the objective direction (min/max); (b) the bound and why it is valid (overestimate for max, underestimate for min); (c) the exact prune condition; (d) the argument that the condition fires only when the bound proves the branch cannot beat the incumbent. A prune on a raw partial score rather than a bound is a defect. The v5 inverted-pruning bug (`if -score < best: prune` in a maximization) passed all other checks — only the direction checklist catches it.

### 4d. Handling high-uncertainty requests

1. [L] Classify the uncertainty: is it missing facts (reducible by lookup), missing premises (needs user input), or irreducible (genuinely unknowable from available evidence)?
2. [A] If reducible: estimate the cost of reduction (§2.4, costed per §10). If cheap, do it (return to §4a). If expensive relative to value, say so and ask whether to proceed.
3. If it needs user input: ask the single most informative question — the one whose answer eliminates the most alternatives — not a battery of questions.
4. If irreducible: deliver the best-supported analysis labeled `plausible` or `unknown` per §3.4, state what would reduce the uncertainty, and do not pad with confident-sounding filler. "I don't know, and here is what would settle it" is the correct output.


## 13. Strategy selection (meta-reasoning)

v1.0 provided the strategies (§2) but no procedure for choosing among them. The selector runs before solving:

### 13.1 Classification

Classify the problem first, in one line:
- **Lookup:** answer exists in a source; task is retrieval + extraction → §4a.
- **Computation:** answer is determined by stated rules/numbers; a deterministic verifier exists → formalize, then execute via tool (PAL pattern, §3.5). Never mental-arithmetic a consequential computation.
- **Search:** answer is the optimum over a defined space → if the space is small, bounded brute force with the cap stated; if large, §2.1 decomposition or §2.3 guarded greedy.
- **Decomposition:** problem too large for one pass with clean subproblem interfaces → §2.1 (or a §9 template).
- **Judgment:** irreducible uncertainty or user-preference-dependent → §4d; do not disguise as computation.

### 13.2 Selection record

State the classification and the chosen strategy before executing ("Classification: search/small → bounded brute force, cap 10^4 candidates"). If the strategy fails (cap hit, verifier disagrees, cost overrun), the failure is data about the *classifier*: log it (§5 mode 11) and reclassify rather than pushing the same strategy harder.

---

*Structural note (v1.7): moved from Layer 3 to Layer 1 per the structural literature sweep — strategy selection governs how the core is applied (the GSN strategy node for Layer 1).*

---


---

# Layer 2: Guards

*What goes wrong and how we catch it: the failure-mode catalog, step-level verification, adversarial testing, verification chains, and distractor resistance.*

## 5. Failure modes

Each failure mode below is paired with its detection mechanism. The catalog is organized into families by causal mechanism — fabrication (A), selection (B), search pruning (C), elision and verifiability (D), calibration (E), and process failures (F). Modes keep their original numbers; families are organizational subheadings, not a renumbering. The first three modes map directly to fabrication modes observed in the project's FVC work.

### Family A: Fabrication — false claims about work done (modes 1, 2, 3, 19)

Modes 1–3 describe the prose shapes of fabrication: claims of mechanical verification with no trace behind them. Mode 19 is the family's mechanical anchor — where modes 1–3 cross-check prose against the trace (§3.3/§7), mode 19 cross-checks the trace's execution claims against an exec-time log written independently of the trace. It closes the hole modes 1–3 always had: a fabrication that is consistent *inside* the record is invisible to every monitor that grades the record.

1. **Fabricated verification claim.** Prose asserts a mechanical verification (a tool run, a computation, a check) with no corresponding trace — the Run 03 pattern (false second-verification claim). *Detection:* the §3.3 cross-check, applied to every "I verified/computed/checked" sentence before delivery; now tool-assisted (§7). Any unmatched mechanical detail fails the claim.
2. **Fabrication under tool incapacity.** When a tool cannot reach the needed data, prose invents the missing work (the T05/T11 pattern: claims about filesystem searches that never occurred). *Detection:* §3.3 step 1 — if no trace exists because no tool ran, the only honest outputs are `unknown` or a description of the incapacity itself. "The tool could not access X, so this is unverified" is correct; inventing the access is the failure.
3. **Verification-shaped prose.** Fluent sentences with the *shape* of verification ("thoroughly tested," "confirmed working") and no trace behind them — observed in the mandatory-verification branch. *Detection:* §3.4 vocabulary enforcement plus the deterministic claim linter (§11) — shape-words are not status labels; any claim using them must still pass §3.3 or be relabeled.
19. **Output-time deception (fabrication outside the trace). (New in v1.9, from the §19 output-deception trial.)** The trace is present, legible, and complete — but contains no deception to monitor, because the fabrication is produced at output time and was never planned in the trace. Characteristic shapes: fabricated tool results (a tool call recorded in the solve trace with no corresponding execution); false verification claims ("verified via bound-check" when the checker never ran); phantom measurements (agreement counts, re-run confirmations with no second execution); inflated labels ("verified" over checkers that never ran, or verification claimed with zero artifacts). The deception is consistent *inside* the record — trace, draft, and derived log corroborate each other — so every monitor that grades the record's claims about the trace is blind to it. *Detection (mechanical):* execution-claim cross-reference — every claim that an execution happened (trace entries, verify.json checker entries, "verified via X" prose, re-run/agreement measurements) must resolve to an entry in an execution log written at exec time, independent of the agent-supplied trace. *Architectural note:* a tool log derived from the trace provides self-consistency, not independence. The exec-time log is written by the runner, never by the agent, and is never derived from trace content. *Scope:* the mechanism covers the planted taxonomy (phantom tool, phantom checker, phantom via-claim, phantom re-run, empty verification); recall beyond the planted shapes is untested and is not claimed. The check runs as a verify-stage checker (fail or acknowledge), not as a new gate. `lint-claims` is confirmed bypassable for this class (marker presence ≠ marker truth); its job stays prose hygiene.

### Family B: Selection — how choices among alternatives go wrong (modes 14, 15, 18)

Every choice among candidates must be determined by the logical problem, not by surface form or shared assumptions. Mode 14 (the wrong comparison rule), mode 15 (false confirmation from correlated verifiers), and mode 18 (no rule at all — arbitrary selection) are the three ways selection breaks. The family detection thread: compare on structured keys in spec order, and verify by disagreement, not agreement.

14. **Serialization-order mismatch. (New in v1.2, from the v3 baseline.)** When a specification defines a multi-key ordering ("ordered by start, then name"), implementing the comparison via lexicographic ordering of *serialized strings* ("name@start") silently substitutes the serialization's field order for the specified sort order. The code looks correct — it sorts, it compares — while deciding every close case wrongly. *Worked example:* v3-sched-002 — solver and bank independently stringified entries as `f"{j}@{s}"`; both picked wrongly under the prompt's literal (start, name) order. Full case: v3 baseline record, `architectures/literature/`. *Detection:* compare structured key tuples, never serialized strings, whenever the spec defines the ordering. The serialization format is for output; the comparison key is a separate object. Any `min()`/`sort()` over stringified candidates where the spec names a key order is flagged as an ordering-assumption requiring a two-line proof: the spec's key order vs the code's key order, shown equal. *Detection precedence (new in v1.9, from the §19 f2-f3-fpr trial):* where both signals are available, pairwise disagreement between implementations is the blocking gate — two methods disagreeing on the same candidate set blocks delivery. The serialization-format heuristic (flagging stringified comparisons) is advisory only: it false-positived on a provably-correct padded serialization while pairwise disagreement showed 0 FP on 6 real correct comparators. The disagreement gate is underpowered unless the candidate set includes key-order-conflicting pairs — adversarial candidates that separate the true order from plausible impostors.
15. **Correlated verification. (New in v1.2, from the v3 baseline.)** Two "independent" verifications that share an implementation assumption will agree with each other while both being wrong — and the agreement feels like confirmation. *Worked example:* v3-sched-002 — primary DFS and "independent" re-solve agreed via shared stringification. Full case: v3 baseline record. *Detection:* §15 — for each check, name the assumption it is capable of falsifying. A re-solve that reuses the solver's comparison key cannot falsify a comparison-key bug and must be labeled weak on that link. True independence for ordering claims: verify from the spec's words (hand-check the first position where candidates differ under the literal key order) or implement the comparator without reusing the solver's key function. *Second worked example:* v4-pack-002 — two verifiers agreed via re-derived `(x,y)` keys; the prompt's placement-list form ranked a different solution first. Lesson: when the spec names the comparison form, compare in that form. Full case: v4 baseline record. *Mechanical check (new in v1.4):* when the tie-break compares structured lists (placements, sequences, rankings), the comparison must operate on the spec's named form directly. If the implementation derives a new key (tuples from strings, projections from objects), the derivation itself is an assumption requiring its own two-line proof: the derived key's ordering shown equal to the spec form's ordering on the actual candidate set, not merely on typical cases. A proof that holds 'for single-digit coordinates' is not a proof.
18. **Non-canonical optimum selection. (New in v1.9, from the §19 input-equivalence probes.)** When multiple valid outputs exist for a task (e.g., multiple optimal solutions), the solver's selection among them depends on logically irrelevant surface features — input order, identifier names — rather than a canonical rule. The output is not a pure function of the logical problem. This includes (a) tie-breaks on input position (array indices, parse order) and (b) tie-breaks on raw identifier strings under renaming. *Consequences:* logically equivalent inputs produce different (but valid) outputs; exact-match benchmark scoring becomes sensitive to surface form; bank answer keys may encode arbitrary tie-break choices rather than logical necessities (confirmed 2/3 in the trial); internal cross-checks ("independent" methods) can disagree with each other, causing false FATALs. *Detection:* input-equivalence probes — reorder inputs (outputs must be byte-identical); rename identifiers bijectively (outputs must be identical after inverse-mapping). Any divergence indicates non-canonical selection. *Mitigation:* (1) audit all tie-breaks — none may depend on input position or parse order; (2) canonical tie-breaking — order candidates by structural signature (WL-refinement colors or equivalent canonical labeling), not raw names; (3) canonical serialization — output ordering must also be rename-invariant; (4) for benchmarks — prefer validity+objective scoring over exact match for optimization tasks, or re-key banks to canonical choices. *Scope note:* parser brittleness (failure to parse renamed/rephrased inputs) is a separate capability boundary, not Mode 18. Mode 18 covers only cases where the solver *succeeds* but selects non-canonically.

### Family C: Search pruning — discarding candidates before comparison (mode 16)

Pruning is the one failure mode where the solver deliberately removes candidates before any comparison happens; the failure is removing winners. It stands alone because its detection — bound validity plus optimization-direction discipline — is specific to search, not to choosing among candidates already present.

16. **Inverted bound pruning. (New in v1.4, from the v5 baseline.)** A branch-and-bound pruning condition with the comparison flipped for the optimization direction silently discards optimal candidates while returning a valid-looking feasible answer. The code runs clean, the answer validates against constraints, and nothing signals the loss — the pruned branches were the best ones. *Worked example:* v5-sched-003 and v5-counter-005 (2026-10-04). Both maximization searches used `if -score < best_key[0]: prune`, which prunes exactly when the partial score *exceeds* the incumbent — killing the best branches and keeping the mediocre ones. First-pass answers (85 and 41 points) were feasible but suboptimal; unpruned re-solves gave 103 and 43, both confirmed by the bank. *Detection:* every pruning condition gets a direction check — state the objective direction (min/max), the bound direction, and show the prune fires only when the bound *cannot beat* the incumbent. For maximization: prune only when `optimistic_upper_bound <= incumbent`. A prune on the raw partial score (not an upper bound) is always suspect. The two-line proof: (1) the bound is a valid overestimate (max) / underestimate (min); (2) the comparison discards only candidates the bound proves cannot win. *Detection precedence (new in v1.9, from the §19 f2-f3-fpr trial):* the blocking gate is the dynamic check — run the pruner against test cases containing known-optimal branches and confirm no optimal branch is pruned. The static direction check (inspecting the comparison operator for the "correct" direction) is advisory only: it false-positived 3/3 on real correct prunes where strict `<`/`>` deliberately preserve tie-breaks, and its prescribed `<=` pattern itself failed the dynamic check by pruning a tie branch containing the optimum.

### Family D: Elision and verifiability — correct-looking output, broken chain (modes 17, 20, 21)

Mode 17 drops load-bearing requirements and answers the wrong problem; mode 20 keeps the answer but its reasoning cannot support the conclusion; mode 21 distorts the formalization while the verdict survives. The four-way distinction that prevents confusion: 17 *drops*, 20 is *unverifiable*, 21 *distorts-but-verdict-survives*, 19 (Family A) *fabricates*. Modes 17, 20, and 21 make no false claims about execution — 17's trace is honest about a wrong problem, 20's trace is present but cannot bear the answer's weight, 21's trace is faithful to a wrong model. Mode 19 alone fabricates.

17. **Requirement elision. (New in v1.8, from the reasoning-runtime build.)** The dominant solver failure mode across the runtime's Phases 4–5: a prompt requirement the parser does not understand is silently dropped rather than acknowledged — the solver proceeds as if the requirement did not exist, producing a valid-looking answer to the wrong problem. This is the inverse of §16's concern (§16 guards against *decorative* elements being treated as load-bearing; elision is *load-bearing* elements being dropped). *Worked examples:* v8-route-003 — the objective "minimize total exposure" fell back to distance because the parser's regex missed the phrasing, and 26 feasible routes with strictly lower exposure were ignored; v8-route-002 — a "tolls must be <=" constraint matched zero requirement patterns and the cap was silently dropped, producing an infeasible route; v8-route-004 — the "9th route in distance-ordered enumeration" qualifier was ignored entirely. The v5-sched-001 bank bug had the same shape on the generator side (prompt/generator precedence mismatch). *Detection (procedural):* during formalization, list the prompt's requirement-bearing elements (constraints, objectives, qualifiers, exclusions); verify each maps to an element of the formalization. Any unmapped element is either explicitly set aside with a recorded reason or a defect — never silently absent. *Discipline:* fail loudly. If a requirement cannot be parsed into the formalization, the solver MUST refuse (FATAL/unknown) rather than proceed on a guessed or default interpretation. A default (e.g., falling back to distance when the objective is unparseable) is the failure, not a convenience. *Note on mechanical gates:* a keyword-overlap elision checker (regex-extracted requirement candidates vs formalization keyword overlap) was trialed under §19 on a 16-task A/B bank and **rejected** — 50% recall (effectively 3/8 after correcting a true-positive-on-wrong-sentence) with a 12% false-block rate on clean tasks. Failure analysis: signal-list gaps (morphology), mention-≠-acknowledgment (keyword overlap counted nouns, not constraint roles), decorative mention as cover, stemming gaps. The *concept* was not disproven; that *mechanism* was not ready. Trial report: `reasoning-runtime/elision-trial-report.md`.
*Third detection leg — dropped-claims audit log (new in v1.10, from the §19 PCC trial; in production since 2026-10-07; expanded in v1.11).* What the rejected checker could not do, the audit log does from the solver's side: every runtime solver instruments its elision-prone parse sites (fragment loops, objective recognition, default branches) with a claim registry — each requirement/constraint/claim considered is logged ACCEPTED (used in solving, with provenance) or DROPPED (with a reason). The certificate is emitted as JSON via a process-exit hook, so it is written even on fail-loudly (exit 1) paths. Detection rule: `fluent output AND dropped_count > 0` → alarm; a DROPPED entry on a non-zero-exit run is not an alarm — it is the certificate explaining *why* the solver refused. This is the executable form of Mode 17's fail-loudly discipline and the evidence trail for it: it catches *latent* drops (correct-by-luck outputs) that output-consistency checks cannot see by construction, and it works without source access where source scans cannot run. It complements — not replaces — the procedural checklist above. **Coverage (v1.11):** instrumented solvers are now route, scheduling, packing, selection, and counterfactual — the packing solver gained conflict/capacity/bin-count phrasing guards, selection gained unrecognized-cap-attribute and exclusion-phrasing guards, counterfactual gained capacity-missing and cardinality guards. **Adversarial validation (v1.11, from the §19 eval-poisoning trial):** 18 adversarially-phrased elisions bypassed the elision gate at 100% (phrasing without signal vocabulary is structurally invisible to it, and the proposed signal-independent fallback was REJECTED — binding extraction itself is phrasing-sensitive). All 18 were caught at the parser level: 10 via explicit PCC.drop, 8 via fail-loudly refusal, 0 missed with fluent output. The parser-level defense works because solvers refuse to produce fluent output on requirement-like statements they cannot parse, rather than trying to understand adversarial phrasing. **Default inversion — UNPARSED status (new in v1.11, from the §19 certified-abstention trial).** The audit log's original design had a blind spot: it only logged claims the parser *recognized*. A requirement the parser does not understand at all was invisible — not DROPPED (understood but dropped), simply absent. The default is now inverted: every requirement-bearing sentence in the prompt must map to a logged claim, or it is flagged UNPARSED ("not understood", distinct from DROPPED "understood but dropped"). The audit runs automatically: prompt sentences are tested against requirement signals (deontic/prohibition/bounds/objective/separation/constraint nouns); any requirement-bearing sentence where a majority of content tokens appear in no logged claim is UNPARSED. UNPARSED is a WARN-level alarm (verdict PASS, advisory in detail) — the heuristic is new, and blocking would break passing tasks; escalation to BLOCK needs a future trial. **Validation:** 15/15 certified-abstention items flagged (was 15/15 clean certs); false-positive rate 12.5% on fluent v11 tasks (1/8, a legitimate true positive — solver doesn't model preemption), well under the 40% pre-registered tolerance. Zero UNPARSED-caused BLOCKs. Critical fix found during implementation: all 5 solvers passed the prompt *file path* (not text) to the audit — fixed to pass text, plus defensive path→text fallback. Blind spots (kept): instrumentation-coverage dependence (a drop at an uninstrumented site is invisible — the log solves runtime detection, not discovery); the 8 refused-without-PCC.drop cases (e.g., route "no network header") would benefit from explicit drop logging — follow-up work. *Worked example (v1.11):* the UNPARSED audit flagged "PREEMPTION IS ALLOWED" on v11-sched-004 — investigation found the scheduler had zero preemption modeling (placed every job as one contiguous block), emitting MAKESPAN 9 against the correct preemptive optimum 8 (McNaughton: max(5, ⌈16/2⌉)). A true soundness gap, not just an audit gap. Fixed: parser detects preemption, computes McNaughton's optimum for the simple case (makespan objective, no precedence/releases/deadlines), fail-loudly otherwise. v11-sched-004 now correct. Trials: `architectures/literature/trial-pcc-2026-10-06.md`, `architectures/literature/trial-eval-poisoning-2026-10-07.md`, `architectures/literature/trial-signal-fallback-2026-10-07.md`, `architectures/literature/trial-certified-abstention-2026-10-07.md`.
20. **Hollow convergence. (New in v1.9, from the §19 hollow-convergence trial.)** A correct answer arrived at via incomplete or unverifiable reasoning — the solver converges on the right output while its trace cannot support the conclusion. Invisible to accuracy-only evaluation (the bank score does not move) and near-undetectable from surface text. Distinct from Mode 17 (elision *drops* requirements; hollow convergence *keeps* the answer while the reasoning behind it is unverifiable) and from Mode 19 (output-time deception fabricates execution claims; hollow convergence makes no false claims — it simply has no checkable chain). *Detection:* the standing hollow-trace monitor — screen batch runs for correct answers whose reasoning artifacts (chain.json, trace claims, verifier entries) do not support the answer; re-run the screen on every future batch, especially judgment-lane tasks. Trial evidence: 2/20 sampled runtime runs hollow (≈6/50 bank), concentrated in v10-critique; the detector separated hollow from solid with no false positives in the sample.
21. **Verdict-preserving unfaithfulness (VPU). (New in v1.10, from the §19 RR3 trial.)** An *incorrect* formalization — a dropped or distorted constraint, a misread objective or tie-break — executes successfully and emits the expected verdict. The trace is faithful (the solver genuinely ran the wrong model), the answer matches the key, and every execution-fidelity gate passes. Verdict checking, trace-faithfulness oracles, and keyword-level formalization checks are all blind to it: the defect lives in the prompt↔formalization mapping, which no verdict-dependent gate inspects. Mode 17's sharper form — elision *drops* requirements visibly (the trace shows a wrong problem); VPU *distorts* them while the verdict survives (the trace is faithful to a wrong model). The trial's mechanism analysis found two distinct failure shapes in the prompt↔formalization gate: M-A (signal-coverage gap — the dropped requirement matches no signal pattern, so no candidate is ever extracted) and M-B (keyword acknowledgment — the candidate is extracted but a ≥2-shared-keyword rule marks it acknowledged while its *content* is wrong).
*Detection requirement (not verdict checking) — the T1/T2/T3 battery (from the §19 TA1 trial; folded into this mode, not a separate mechanism).* T3 (verdict correctness) alone is insufficient. T1 (evidence verification: each prompt requirement's *content*, not just keywords, must be present and correct in the formalization) and T2 (state reconstruction: an independent constraint set built from the prompt must match the solver's formalization) must also pass. **The T3-vs-(T1/T2) gap is the VPU signature** — a large gap indicates corrupt evidence state even when the verdict is correct. (TA1: Wan et al., arXiv:2610.01244; empirical priors T1 14.3% / T2 43.1% / T3 64.7%; the RR3 trial's 8 VPU cases: T3 pass 8/8, T1 fail 8/8, T2 fail 8/8 — a 100pp gap, twice the paper's ~50pp.)
*Implementation status.* The M-A gap is closed in production: the prompt-side extractor was extended to all 10 miss categories from the H2 coverage audit (tier, clawback, sequence, rounding, rule, equation, conditional, edge, tie-break-content, serialization bindings; objective verbs matched in third-person forms) — re-audit 45/45 = 100% on the audit prompts (was 10/45), `elision-check.mjs --selftest` 26/26, architecture suite 11/12 with no regressions. **Extended in v1.11 (three trial-cleared integrations, all with no regressions):** (a) the J1x plainly-phrased shape taxonomy — 14 constraint shapes phrased without trigger vocabulary (waypoint prose, time-window prose, exact/at-most cardinality, release prose, mutual exclusion, per-entity capacity, coverage cardinality, correction exclusion, output ordering, must-not-exceed, setup time, use-ban, deadline) → new `window`, `card`, `percap`, `setup`, `ban` bindings; trial recall 0.000→1.000, precision 0.9333, the single FP (case-sensitive entity on "cannot be used") hardened before integration; (b) gap-closure patterns — passive ban with distant entity ("the link A-B is under construction and cannot be used") and "non-empty" exclusion phrasings → `{exclude}` bindings, both recall→1.000 at precision 1.000; (c) ordinal-selection binding `{n, crit}` (F3) — "3rd-shortest", "2nd cheapest", "5th route in this ordering", "top 3", "2nd-best" close the t03 capability boundary two-sided with widened solver k-th triggers (adjectival ordinals map to objectives: shortest→distance, cheapest→cost, longest→descending; 12/12 trigger, no false triggers on "3rd party tolls"/"top sights" controls). The T1/T2 battery itself was applied by manual audit in the trials and is not yet an automated production gate; its false-positive rate on correct formalizations is unmeasured. Honest limits (kept): manual-audit evidence only, N=8 all-positive; TA1 does not distinguish M-A from M-B — RR3's diagnosis stands as the implementation guidance; residual gaps kept ("non-empty" now closed; remaining: "not certified for" phrasing, "within hours 0–5" window variant, multi-word ban targets). Trials: `architectures/literature/trial-rr3-vpu-2026-10-06.md`, `architectures/literature/trial-ta1-offquery-2026-10-06.md`, `architectures/literature/trial-h2-signal-coverage-2026-10-07/`, `architectures/literature/trial-j1-coverage-2026-10-07.md`, `architectures/literature/trial-gap-closure-2026-10-07.md`, `architectures/literature/trial-ordinal-2026-10-07.md`.

### Family E: Calibration — the uncertainty labels themselves being wrong (modes 7, 8)

Modes 7 and 8 are the failure modes §8's calibration machinery exists to detect. Mode 7 is per-instance label inflation (smoothing a label upward at delivery); mode 8 is systematic label miscalibration (the label's empirical hit rate diverging from its meaning). One is a delivery-time sin, the other a regime-level drift.

7. **Uncertainty smoothing.** Upgrading `plausible` to "verified" or `unknown` to "plausible" in delivery. *Detection:* §3.4 — the label assigned at the verification step must be the label delivered; any mismatch found on re-reading (or by the linter, §11) is a defect.
8. **Calibration drift. (New in v1.1.)** Labels whose empirical hit rates diverge from their meanings — e.g., `verified` claims failing, or `plausible` claims almost always right (systematic underconfidence). *Detection:* the calibration log (§8); divergence beyond threshold triggers recalibration, recorded in the observation log.

### Family F: Process failures — how the reasoning process itself breaks (modes 4, 5, 6, 9, 10, 11, 12, 13)

These are failures of the process that produces the reasoning, not of any single claim, comparison, or label. Premature closure, ungrounded self-correction, decomposition drift, template misapplication, critic capture, strategy misclassification, adjudication capture, chain-step smuggling — each names a way the machinery of reasoning breaks before any particular conclusion is reached.

4. **Premature closure.** Settling on the first coherent answer without checking alternatives. *Detection:* §2.3 and §12 — for consequential claims, at least one alternative must be named, the reason for rejecting it stated, and the disconfirmation search run.
5. **Ungrounded self-correction loops.** Re-asking the same process to check itself until it agrees with itself (Huang et al.: degrades performance). *Detection:* §3.5 — a "verification" that consists only of re-prompting is labeled `supported` at best; genuine verification requires a deterministic or external check. The critic protocol (§11) is not exempt: the critic must be informationally separated from the draft.
6. **Decomposition drift.** Subproblem results that do not actually compose into the claimed final answer (§2.1 failure). *Detection:* the composition step is checked as its own argument chain (§1.1); each sub-result's interface terms must appear verbatim in the composition.
9. **Template misapplication. (New in v1.1.)** Forcing a novel task into a §9 template whose interface does not fit, producing clean-looking but wrong decomposition. *Detection:* the precondition check — if the task's inputs cannot be stated in the template's slots without distortion, the template does not apply; decompose fresh per §2.1.
10. **Critic capture. (New in v1.1.)** The §11 critic merely echoing the draft's reasoning because it was given the reasoning, not just the claims. *Detection:* the critic brief withholds the draft's chain by construction; any critic output that reconstructs the draft's reasoning instead of attacking its claims is discarded and the critic re-run.
11. **Strategy misclassification. (New in v1.1.)** Choosing the wrong §13 strategy — e.g., brute-forcing a lookup problem, or decomposing a problem that needed joint solving. *Detection:* the strategy's own stop rules fire (cost overrun per §10, or verifier failure); the misclassification is logged as data for the selector, not merely retried harder.
12. **Adjudication capture. (New in v1.2.)** Accepting a secondhand report about a process ("the generator used half-up rounding") in place of inspecting the process itself. *Worked example:* during the v1.1 heldout-v2 baseline, one item scored 47/48; the bank author's process-only adjudication blamed the solver, but direct inspection of the generator code revealed the true defect — an unquantized `USD 34.380` violating the prompt's own `USD X.XX` format. The solver's `USD 34.38` had been correct all along. *Detection:* design principle 6 — any claim about what a tool/script/subagent did is itself a §3.1 claim requiring grounding; "someone said the process was correct" is not grounding. When a dispute arises, inspect the artifact, not the testimony.
13. **Chain-step smuggling. (New in v1.2.)** An unverified intermediate result flowing downstream as if verified — e.g., a brute-force script's output pasted into the next step's reasoning without checking the script ran correctly, or a subagent's summary used as a premise without the subagent's evidence. *Detection:* §15 — every handoff between steps is a verification point; an intermediate that was not verified is labeled `supported` at best when used downstream, and the label propagates.

---

## 7. Semi-automated step-level verification

**Answers v1.0 §6.Q1.** Manual process supervision (§3.3) works but relies on the eye catching every mechanical claim. This section partially automates it: the machine extracts the claims, the human (or a deterministic matcher) checks them against the log.

### 7.1 Mechanical-claim tagging

During drafting, any sentence asserting mechanical work (a tool ran, a computation was performed, a file was read, a check was executed) is tagged inline with a claim ID:

> "The archive export hashes to `9f2c…` [MC-3], confirming the import was lossless."

Rules for tags:
- One tag per distinct mechanical assertion. A sentence with two assertions gets two tags.
- The tag travels with the claim through revision; if the claim is cut, the tag is cut.
- Non-mechanical prose (interpretation, recommendation, hedging) is never tagged.

### 7.2 The cross-check tool

`crosscheck.mjs` takes two inputs: the draft (with `[MC-n]` tags) and the session's tool-call log (a JSON list of `{tool, input, output, timestamp}`). For each tag it reports:

- **MATCHED:** the log contains a call whose tool, input, and output are all consistent with the tagged claim.
- **UNMATCHED:** no such call exists → the claim fails §3.3 and must be downgraded or cut.
- **PARTIAL:** the tool ran but a detail differs (wrong input, output misquoted) → the claim is corrected to exactly what the log shows.

The tool is deliberately dumb: substring and field matching, no semantic judgment. Semantic judgment (was this the *right* tool for the claim?) remains manual under §3.3 step 2. The tool catches what the eye skips; it does not replace the eye.

### 7.3 Procedure

1. Draft with `[MC-n]` tags on mechanical claims.
2. Run `crosscheck.mjs` against the session tool log before delivery.
3. Resolve every UNMATCHED and PARTIAL tag: correct the claim, add the missing tool call (actually run it), or cut the claim.
4. Deliver only when all tags are MATCHED or removed. The tag list is itself part of the delivery record for consequential claims.

---

*Structural note (v1.7): moved from Layer 4 to Layer 2 per the structural literature sweep — step-level verification is a guard (checking the work), not a measurement instrument.*

## 15. Verification chains

For multi-step tasks (chains of 3+ dependent steps), each step's output is verified before becoming the next step's input. This strengthens the §2.1 composition check from a single end-point review into per-link verification.

### Procedure
1. Number the steps (S1…Sn) with each step's input, operation, and output stated.
2. After each step, verify its output by the cheapest adequate check: deterministic re-execution, a spot-check against a known case, dimensional/units sanity, or an independent recomputation for consequential steps.
3. Tag verified intermediates `[MC-n]` (§7.1) so the cross-check covers the chain, not just the finale.
4. A step whose output cannot be verified is marked as the weak link; everything downstream of it inherits at most `supported` (§5 mode 13: no smuggling).
5. **Falsifiability labeling (§5 mode 15):** for each verification, name the assumption it is capable of falsifying. A re-check that shares the original step's implementation assumption (same key function, same serialization, same library call) is labeled weak on that assumption — it cannot confirm it. Agreement between methods is evidence only about assumptions they do not share. When the assumption under test is the implementation itself, verify from the spec's words (hand-check the first case where alternatives differ) rather than by re-execution.

### Cost control
Per-step verification has a cost (§10). Default: cheap checks (re-execution, sanity) on every step; expensive checks (independent recomputation, critic review) only on steps whose failure would invalidate the chain (load-bearing steps, §16). If the chain is too long for per-step verification at acceptable cost, shorten the chain (bigger steps, stronger tools) rather than skipping checks silently — v1.3 Q5.

### Adjudicator independence (new in v1.11)

Verification chains assume each link is independently checked. Two §19 trials in the 2026-10-07 cycle qualify that assumption for multi-judge/adjudicator setups.

**Conformity guard (trial ADOPTED: `architectures/literature/trial-conformity-2026-10-07.md`).** A judge that disagreed blind with a colleague, when shown the colleague's verdict, flipped toward it 50% of the time vs 0% control test-retest (50pp conformity effect; n=2/arm pilot, pre-registered bars crossed). This is mode 15's human/subagent cousin: agreement after exposure is not independent confirmation. Procedure (already operational in the reasoning skill):
1. **Blind-first-then-reveal:** an adjudicator reviewing work that already has a prior verdict records their own verdict from the material alone BEFORE the prior is shown. Only then may they see the prior and reconcile.
2. **Conformity flag:** a final verdict matching a shown prior is flagged as conformity-candidate; the adjudicator re-verifies that the material alone carries the verdict without the prior. The flag is recorded in the adjudication record.
Honest caveat (kept): the single treatment flip was substantive — the shown verdict was arguably right — so the pilot confounds conformity with truth-tracking. The guard is procedural and low-cost regardless; a larger replication distinguishing conformity-flips from truth-flips is queued.

**Inter-rater reliability measurement (trial REJECT, rule-bound: `architectures/literature/trial-ac2-kappa-2026-10-07.md`).** Gwet's AC₂ was not adopted as the reliability standard (paradox criterion met in 1/7 pairs, below the ≥2 bar), but the κ prevalence paradox was confirmed on project data: two conservative detectors agreeing on 29/32 items (Po=0.906) scored κ=0.000 ("no agreement beyond chance") while AC₂=0.897. Rule: κ remains the standard; **report AC₂ alongside κ for high-agreement/extreme-prevalence panels**, where κ's chance model treats all negative agreement as expected and misleads. For genuinely disagreeing panels both metrics agree reliability is low — neither rescues a disagreeing panel. (Secondary property kept: under balanced prevalence with heterogeneous rater marginals, AC₂ runs more conservative than κ; AC₂ is not uniformly "κ but higher.")

**Verifier-pool diversity (trial ADOPTED, scoped: `architectures/literature/trial-verifier-diversity-2026-10-07.md`).** K3's near-zero error correlation (−0.14) was a pilot-stratum artifact (n=16): on n=48 the J1–J2 pair correlates at 0.649 (0.827 on the confirmation stratum) — both are coverage checkers that miss the same plainly-phrased drops, i.e. two checkers with one effective vote. Kish n_eff=2.19: the 3-judge panel behaves like ~2.2 independent judges, not 3. Independent-pair OR F1 exceeds correlated-pair by +0.2549 (J1,J3: 0.7843 vs J1,J2: 0.5294; bar ≥+0.05). M4, unconfounded by judge quality: gate+PCC (structurally diverse mechanisms) went 18/18 safe on the poison items where the elision gate alone went 0/18. Requirement (scoped): (1) measure pairwise error correlations and report Kish n_eff when assembling verifier panels — headcount is not effective size; (2) prefer mechanistically diverse panels (the J1–J2 pair is the anti-pattern: r=0.649, adding J2 to J1 buys only +0.029 F1); (3) do not overclaim — diversity does not substitute for judge quality (J3 alone matches the best pair; OR(J1,J3) adds nothing over J3 alone, so diversity without coverage is also hollow).

---

## 16. Distractor resistance

Prompts — from users, from web pages, from task statements — routinely contain decorative elements: irrelevant data, misleading formatting, false urgency, authority cues. The §13 strategy-selection step now explicitly separates load-bearing from decorative content.

### Procedure
1. After classifying the problem (§13.1), list the prompt elements the solution actually depends on (load-bearing) vs. those it does not (decorative). One line each; be explicit ("the 2024 revenue figure is decorative — the question asks about 2025").
2. If a decorative element is *designed* to look load-bearing (a precise-looking number that plays no role, an urgent tone around a non-urgent decision), name the design — this is the distractor, and naming it is the guard.
3. **Completeness check (new in v1.8, from F1).** Step 1 separates decorative from load-bearing, but it does not verify that every load-bearing element survived into the formalization. After listing, verify each load-bearing element maps to a constraint, premise, or objective in the formalization. Any unmapped element is either explicitly set aside with a recorded reason ("excluded because...") or it is requirement elision (§5 mode 17) — a defect. A requirement the formalization cannot represent is not skipped; the solver refuses (fail loudly) rather than proceeding on a partial problem.
4. Solve using only load-bearing elements. If the solution later needs a decorative element, that element was misclassified — reclassify, don't smuggle (§5 mode 13).

This is not paranoia about user intent; it is hygiene about attention. Most distractors are accidental. The procedure costs one minute and prevents the characteristic failure: a correct computation on the wrong inputs.

### 16.1 Known distractor shapes (new in v1.9)

*Answers v1.3 open question #4 (distractor taxonomy), first entry. Trial: `reasoning-runtime/trials/f4-correction-probes/` — 16-item deterministic probe bank; baseline (unconditional correction application, the v8-distract-002 failure model) 8/16; disciplined (joint power-set validation against the stated subtotal) 16/16, cost parity. Transferred to heterogeneous v10 F4 items with adaptation (6/6).*

The §16 Procedure handles distractors generically (name the design, separate load-bearing from decorative). This subsection begins the taxonomy of *known shapes* — recurring distractor designs with tested disciplines. Future versions add shapes; this is the seed, not the catalog.

### Correction-shaped distractors

A prompt element that claims to correct another element — a "correction," "fix," "update," "erratum," "supersedes" memo — is **not trusted on authority**. Corrections are validated against the primary computation they bear on:

1. Enumerate all correction-bearing elements and the primary evidence they claim to modify (the stated subtotal, the given constraint set, the authoritative figure).
2. Validate **jointly over the power set** of corrections: accept the unique correction-subset consistent with the redundant evidence; reject the rest. Validation is joint, not per-correction — corrections interact (two individually-plausible corrections can be jointly inconsistent).
3. **Fail loud if validation is inconclusive:** zero consistent subsets (the evidence itself is corrupt) or multiple consistent subsets (the corrections are ambiguous) are both defects, not ties to break silently.

*Cost bound:* power-set validation is exponential in memo count. Cap the enumeration (default: fail loud beyond 2^10 subsets); beyond the cap, the prompt is adversarially complex for this procedure and the solver refuses rather than guessing which corrections apply.

*Limits (carried from the trial):* the probe bank was self-administered and single-domain (invoice arithmetic). The joint-validation principle transferred to heterogeneous items, but the cost cap and fail-loud thresholds are uncalibrated outside arithmetic.


## 11. Adversarial testing of the architecture

**Answers v1.0 §6.Q5.** The fox-guarding-henhouse problem: the same process executes the §5 guards and grades them. Two externalized checks.

*Literature (added v1.7): five independent lines converge on the separated-critic design — Huang et al. (ICLR 2024) on intrinsic self-correction degrading reasoning; Gou et al. CRITIC (ICLR 2024) on tool-grounding being required (gains vanish without it); Olausson et al. (ICLR 2024) on stronger/separate critics (repair 9.1%→39.3%); Nemeth et al. (2001) on authentic dissent beating role-played devil's advocacy; Tsui et al. (2025) on the 64.5% self-correction blind spot. Full details in `architectures/literature/sweep-2026-10-04.md`.*

### 11.1 Deterministic claim linter

`lint-claims.mjs` scans deliverable text for:
- **Shape-words** without grounding: "verified," "confirmed," "thoroughly tested," "guaranteed," "proven" — each occurrence must either be a §3.4 label with a cited trace or be flagged for relabeling.
- **Unsurfaced assumptions:** the word "assume" (and conjugations) outside a labeled `assumed` premise → flagged.
- **Universal claims without domains:** "all," "every," "never," "always" → flagged unless the sentence also names the domain ("all 8 zips," "every run in the batch").

The linter is deterministic (regex + rule list), which is precisely what makes it external: it cannot be charmed by fluent prose because it does not read for fluency. Linter flags are resolved before delivery, like compiler warnings — zero unresolved flags on consequential outputs.

### 11.2 Critic protocol

For consequential claims, a critic pass reviews the work:
1. The critic receives **only** the final claims + the cited evidence — never the draft's reasoning chain (this is the anti-capture construction, §5 mode 10).
2. The critic brief is adversarial: "Find the flaw. You are scored on flaws found, not on agreement. Attack the weakest premise, the scope of the quantifiers, and the match between each claim and its cited evidence."
3. The critic may be a separate subagent or a fresh-context pass; informational separation is the requirement, not the mechanism.
4. Every critic finding is either addressed (claim corrected, evidence added) or explicitly rebutted with reasoning recorded. Unaddressed findings block delivery of the claim.

**Measuring the critic.** The critic's hit rate is itself logged: findings that changed the output vs. findings rebutted. A critic that never finds anything is either unnecessary or captured — distinguish by spot-checking with deliberately flawed drafts.

### 11.3 Empirical calibration (critic experiment, 2026-10-04)

The §6.Q2 question was tested directly: 8 short drafts (4 with exactly one planted flaw — affirming the consequent, no-trace mechanical claim, unlabeled assumed premise, quantifier scope error; 4 clean), each reviewed by a separate fresh critic subagent given only claims + cited evidence (chain withheld), with neutral packet numbering. Full materials: ~/workspace/critic-experiment/.

Key findings: 4/4 planted flaws caught (each grounded in claims-vs-evidence comparison); 3 false positives on clean drafts (all over-strictness, none hallucinated); 7 bonus true positives on unplanted gaps the author missed; 8/8 verdicts FLAWED (the adversarial brief biases toward finding flaws). Full materials: `~/workspace/critic-experiment/`.

**Protocol adjustments (binding):**
1. **Neutralize the brief.** Replace "scored on flaws found, not on agreement" with accuracy scoring: flaws found minus false positives. The critic is rewarded for correct verdicts, not for verdicts.
2. **Triage before blocking.** Findings are triaged (substantive vs cosmetic/noise) before they block delivery; only substantive unaddressed findings block.
3. **Neutral packets in reruns.** Titles and packaging must not distinguish planted-flaw from clean drafts (a labeling asymmetry was found and must not recur).
4. **The anti-capture construction held.** Withholding the chain forced evidence-grounded criticism; no finding deferred to author reasoning. The 7 bonus catches vindicate making the critic mandatory — self-review demonstrably misses unmatched details the critic catches.

**Standing result:** critic effective, not captured — but trigger-happy at the margin. Small n (8): "no evidence of capture," not proof of perfection. (Calibration-log note: the seed prediction resolved true; the reporter's underconfidence flag fired.)

---

*Structural note (v1.7): moved from Layer 5 to Layer 2 per the structural literature sweep — adversarial testing is a guard on the architecture's own mechanisms.*

---

*What wasn't measured (added v1.7, from Anthropic April-2025 post-mortem): every benchmark score ships with an explicit note on what the score does NOT cover — untested behavior paths, dimensions the suite doesn't measure, and judgment calls the score can't make. A 50/50 without this note is a claim about the suite, not about the reasoning.*


---

# Layer 3: Meta-reasoning

*Reasoning about reasoning: decomposition, counterfactuals, and novelty detection.*

## 9. Decomposition template library

**Answers v1.0 §6.Q3.** Fresh interfaces per decomposition (§2.1) are ideal but expensive and error-prone. For recurring task types, pre-tested templates with fixed slots reduce interface risk. Templates are starting points, not straitjackets — §5 mode 9 (template misapplication) guards their misuse.

### Template R — Research task
- **Slots:** (1) Question stated as a falsifiable query. (2) Source budget (max sources, per §10). (3) Per-source extraction: claim, evidence, source quality. (4) Synthesis: what the sources jointly support. (5) Gaps: what remains unknown.
- **Interface:** input = question; output = labeled claims (§3.4) + gap list.
- **Known failure:** source-count satisficing (stopping at the budget rather than at coverage). Guard: the gap list must be non-trivially populated.

### Template B — Build task
- **Slots:** (1) Contract: inputs, outputs, invariants. (2) Module list with interfaces. (3) Tests written before/at implementation. (4) Implementation in dependency order. (5) Verification record (tests run, type checks, executed paths).
- **Interface:** input = requirement; output = code + verification record.
- **Known failure:** contract drift (implementation outgrowing the contract). Guard: re-read the contract after implementation; any behavior not in the contract is either cut or contracted.

### Template C — Comparison task
- **Slots:** (1) Decision + criteria. (2) Options characterized on identical criteria. (3) Evidence per option per criterion. (4) Ranking with the deciding margin named. (5) Sensitivity: what input change flips the ranking (§12).
- **Interface:** input = decision; output = ranked options + sensitivity condition.
- **Known failure:** criteria shopping (adding criteria post hoc to favor a preferred option). Guard: criteria are fixed in slot 1 before any option is characterized.

### Template D — Debugging task
- **Slots:** (1) Symptom (observed, with reproduction). (2) Hypothesis list, ranked by cheapness-to-test, not by prior belief. (3) Cheapest discriminating test first. (4) Fix. (5) Regression check (the symptom's test now passes; neighbors unbroken).
- **Interface:** input = symptom; output = fix + regression record.
- **Known failure:** hypothesis fixation (testing the favored hypothesis first because it is favored). Guard: slot 2 is ordered by test cost; the order is set before testing begins.

---

## 12. Counterfactual discipline

For consequential decisions and predictions, three exercises before delivery:

1. **Pre-mortem.** Assume the conclusion is wrong. Write the most plausible story of how it came to be wrong — which premise failed, which evidence misled. If no plausible story exists, the conclusion may be stronger than assumed; if several exist, the conclusion is weaker than it feels.
2. **Disconfirmation search.** Name the single observation that would most weaken the conclusion, then actively check whether it holds. (The everyday form of the contrapositive check, §1.2, aimed outward rather than at the chain's internal validity.)
3. **Sensitivity.** For rankings and comparisons: what is the smallest input change that flips the result? State it. If an epsilon change in a `plausible`-grade premise flips a `verified`-sounding conclusion, the conclusion's label is wrong.

These generalize §4b step 6 ("what would change the recommendation") from a delivery nicety into a pre-delivery procedure.

---

## 14. Novelty detection

**Answers v1.1 §6.Q3.** The §9 templates cover recurring task types. This section is the signal that says "no template fits — decompose fresh" *before* misapplication (§5 mode 9) occurs.

### 14.1 The template-fit test

Before applying a §9 template, run this test (one minute, in writing for consequential tasks):
1. State the task's inputs in the template's slot language. (Template C slots: decision, criteria, options, evidence-per-option, ranking, sensitivity.)
2. If any input must be distorted, split, or shoehorned to occupy a slot — the template does not fit. Name the misfit explicitly ("the 'criteria' are not known in advance; they emerge from the evidence").
3. If no template passes the test, decompose fresh per §2.1.

The test is deliberately asymmetric: a false negative (decomposing fresh when a template would have worked) costs a little effort; a false positive (template misapplication) produces clean-looking wrong structure. Bias toward fresh decomposition on any doubt.

### 14.2 Candidate-template log

Every fresh decomposition of a consequential task is logged in `~/workspace/architectures/candidate-templates.md` with: the task type in one line, the interface used (inputs/outputs), and whether the composition held. When a candidate has three successful uses with clean interfaces, it is proposed for the §9 library (promotion criterion; v1.3 Q3 asks who judges).

This log is a task-structure journal, not self-observation: it records what the *work* looked like, never the worker.

---


---

# Layer 4: Measurement

*How we know it's working: calibration, cost, and transfer. (Step-level verification moved to Layer 2.)*

## 8. Calibration logging

**Answers v1.0 §6.Q2.** Uncertainty labels (§3.4) are predictions about the world and must be scored like predictions.

### 8.1 The log

Every consequential *prediction* — a claim about an outcome not yet known, carrying a §3.4 label — is appended to `calibration-log.jsonl`:

```json
{"date": "2026-10-04", "claim": "The import will preserve all 12 revisions", "label": "supported", "outcome": null}
```

When the outcome becomes known, the entry is updated: `"outcome": true` (claim held) or `"outcome": false` (claim failed). Claims that never resolve stay `null` and are excluded from hit rates.

Scope: only predictions, not retrodictions. "The file hashed to X" is not a prediction (it is checkable now); "the migration will succeed" is.

### 8.2 Hit-rate computation

`calibrate.mjs` computes, per label, `hits / resolved`. Expected bands (initial; subject to recalibration):

- `verified`: 0.95–1.00. A "verified" claim that fails is a serious defect (§5 mode 1 territory).
- `supported`: 0.80–0.95.
- `plausible`: 0.50–0.80. Below 0.50 the reasoning producing "plausible" claims is worse than chance and needs review; above 0.90 indicates systematic underconfidence (labels should have been `supported`).

### 8.3 Recalibration rule

When a label's hit rate falls outside its band over a rolling window of at least 20 resolved predictions:
1. Record the divergence in the observation log (classification `calibration`).
2. Adjust: either the labeling threshold moves (stricter evidence required for the label) or the band moves (the initial bands were wrong). State which, and why.
3. Small-n caveat: with fewer than 20 resolved predictions per label, bands are advisory only — report the raw counts, do not recalibrate.

### 8.5 First recalibration (new in v1.5, 2026-10-04)

`plausible` reached 21/21 resolved (100% hit rate vs the 0.50–0.80 band) — all 21 from benchmark sidecar labels (argument-critique and strategy-classification tasks). Per §8.3, recalibration is due. Decision: **the band does not move; the labeling threshold moves.** The 0.50–0.80 band for `plausible` ("consistent with evidence, none cited; reasoning shown") remains correct as a general meaning — a genuinely uncertain judgment call should land in that range. What happened is domain-specific: on these benchmark tasks, the "plausible"-labeled reasoning (direct argument-structure analysis, taxonomy classification) was actually strong enough to have been `supported`. The error was systematic underlabeling, not a wrong band. Correction going forward: when the reasoning chain for a `plausible` candidate is complete and checked (as it was here), label it `supported`; reserve `plausible` for claims where the reasoning itself has a gap. The 21/21 is recorded as a threshold-adjustment event, not a band change. If `plausible` (under the tightened threshold) still exceeds 0.90 over the next 20, the band itself will be revisited.

---


*§8.4 folded in (was appended at document end in v1.2–v1.6; restored to its parent section per the v1.7 structural reorganization).*


For the calibration log (§8.1), a *consequential prediction* is a claim that (a) carries a §3.4 label, (b) concerns an outcome not yet known at log time, and (c) a reasonable person would act on before the outcome arrives. Examples: "the migration will preserve all revisions" (`supported`), "the cheapest adequate strategy is brute force" (`plausible`), "the bank will seal without format errors" (`plausible`). Non-examples: retrodictions ("the file hashed to X"), pure intentions ("I will run the tests"), claims whose outcomes never resolve (excluded as `null`, per §8.1).

**Seed entries (v1.2):** the log now opens with predictions made during the v1.1→v1.2 cycle itself — e.g., the critic experiment's expected hit rate band, the v3 bank's expected difficulty — so that calibration has live entries from the start rather than waiting for organic accumulation.

### 8.4.1 Recalibration method selection (Platt regime rule, new in v1.9)

*Trial: `architectures/literature/trial-op3-platt-2026-10-06.md` (two-leg falsification; synthetic ground-truth simulation, stratified 5-fold CV × 20 seeds).*

When recalibration (§8.3) requires fitting a probability map from observed hit rates:

- **n ≤ ~1,000 resolved predictions → Platt scaling unconditionally.** Platt beats isotonic at every tested scale on sigmoid truth; isotonic's crossover needs n≈500–5,000 depending on curve shape, and small-n isotonic overfits.
- **n ≥ ~2,000–5,000 → isotonic only with positive reason to believe the true map is non-logistic** (e.g., known threshold effects, multi-modal error structure). Absent such reason, Platt remains the default.
- **Decision metric is log-loss, not Brier.** Brier score masks isotonic's small-n overfit; log-loss penalizes it correctly.

*Design correction recorded:* the trial's proposed isotonic-on-60-split is falsified — do not fit isotonic on n<100. Leg A of the trial additionally REJECTED any score-less mechanical recalibration on degenerate logs (133/133-correct labels produce intercept-only fits); when the log has no failures, the fix is labeling discipline (§3.4), not a different fitter.

---

### 8.6 Live confidence estimation (new in v1.9)

*Trial: `architectures/literature/trial-xconf-2026-10-05.md`. Temporal 70/30 split on the runtime calibration log (635 resolved, 92 failures): XConf-style recall AUROC 0.755 vs bands-as-point-estimates 0.419 (the runtime labels are inverted — `plausible` out-hits `supported` — so pointized bands rank backwards); Brier 0.088 vs 0.106. Robust across 12 split/relaxation configurations.*

The §8.2 bands are a **contract**: they state what each label *means* (the hit-rate range the label commits to). They are not a live estimate of *this* claim's chance. When the labeling discipline drifts — as the `supported`/`plausible` inversion shows — the bands keep their meaning but stop describing reality.

**XConf-style recall** runs alongside the bands as the live confidence estimate:

1. For the current claim's (label, category), compute the historical success rate over **strictly prior** resolved episodes at the same (label, category).
2. **Relaxation ladder at n<5:** if fewer than 5 prior episodes exist at the exact (label, category), relax in order: same label across categories → same category across labels → global rate. Report which rung was used.
3. The recall is the **estimate**; the band is the **target**. When recall diverges from the band, that is the §8.3 recalibration signal — the band does not move to chase the recall (recalibration needs a fixed target to diverge from), but a persistent divergence triggers the threshold-vs-band decision in §8.3 step 2.

**Honest limit:** discrimination is category/regime-level, not per-instance. The calibration log lacks reflection/lesson fields, so recall cannot distinguish two claims that share a (label, category) but differ in difficulty. Follow-ups (open): add `reflection`/`lesson` fields to runtime log failures; add an XConf-recall column to calibration reporting.

**Scope note:** recall is an estimation instrument, not a gate. The abstention gate built on bottom-decile recall was REJECTED for live production use at the runtime's ~0% failure rate (pure delivery cost; `trial-abstention-gate-2026-10-06.md`). Estimation and intervention are separate decisions.

### 8.7 Probe-based panel calibration (new in v1.11)

*Trial: `architectures/literature/trial-linear-probe-2026-10-07.md` (5-fold stratified CV, n=48 elision items, 3-judge panels; pre-registered adoption bars).*

Where XConf-style recall (§8.6) estimates confidence from historical (label, category) hit rates, the probe estimates it from the *current* judge panel's outputs: a logistic-regression probe (Brier-loss, L2-regularized) trained on judge verdicts and agreement patterns (n_flag, agree_frac, unanimity, suspect solo-flag features) predicts P(panel majority correct).

**Results:** CV Brier 0.1658 vs 0.1740 for the strongest baseline (agreement-table empirical P(correct | n_flag)), clearing the pre-registered 0.005 margin with consistent direction on all 5 folds; log-loss and ECE corroborate. Inference cost ~0.003ms/item — ~10× faster than the implied multi-sample consistency cost, negligible absolute cost.

**Use:** the probe augments, not replaces. The agreement-table baseline is always computed alongside; the probe's output is preferred unless non-finite. This is estimation for adjudicator panels — it does not gate delivery (§8.6 scope note applies).

**Honest limits (kept):** n=48 is small (wide fold SDs); the probe errs conservative on wrong verdicts (mean p≈0.52 vs 0.76 on correct ones — good at ranking, weak at absolute low-confidence signaling, as the source paper predicts under limited labels); transfer to non-elision adjudication panels needs its own validation before the probe becomes the primary path.

**Scope note:** the probe calibrates *panel agreement*, not per-claim evidence strength. A unanimous panel can still be unanimously wrong about a misread requirement (modes 17/21) — the probe measures rater reliability, not ground truth.

---

## 10. Effort cost model

**Answers v1.0 §6.Q4.** §2.4 requires cost estimates but provided no units. Initial model below; all numbers are *estimates* (labeled as such) pending calibration per §8.3-style tracking.

### 10.1 Units

| Unit | Estimated cost | Notes |
|---|---|---|
| Tool call (read, exec, search) | 1 | The base unit. |
| Browser task (spawn) | 15 | High latency; prefer targeted fetch. |
| Subagent spawn | 25 | Full context copy + coordination overhead. |
| User interruption (a question back) | 50 | The most expensive unit; spend only when the decision is genuinely the user's. |
| Wall-clock minute (unattended) | 2 | Background work is cheap but not free. |

### 10.2 Procedure

1. Before a multi-step operation, estimate in these units and state the total.
2. Compare against outcome value using the escalation rule (§2.4): if cost > value, report the estimate instead of proceeding.
3. **Calibration:** record estimate vs. actual for non-trivial operations (actuals are observable from session tool counts). Review quarterly-ish (or every ~50 operations): adjust unit costs toward observed means, note the adjustment in the observation log.

### 10.3 Defaults

- Default research sweep: ≤ 12 tool calls before synthesizing or asking.
- Default build: decompose first (§2.1); no module implemented before its contract is stated.
- Never spend a user interruption to resolve something a tool call could settle.

---


*§10.4 folded in (was appended at document end in v1.2–v1.6; restored to its parent section per the v1.7 structural reorganization).*


Session of 2026-10-04 (v1.1 heldout-v2 baseline + adjudication episode), actuals vs. the §10 unit model:
- Tool calls (exec/read/write/edit): ~40 (estimated beforehand: "a dozen or so" — underestimated ~3×; lesson: multi-bank benchmark runs are tool-heavy, dominated by per-task solver scripts).
- Subagent spawns: 3 (bank builder, adjudicator, plus 1 earlier) — estimate was not made in advance (missed step; the model requires the estimate *before* acting).
- User interruptions: 0 during the experiment run — correct; all clarifications were user-initiated.
- Browser tasks: 0.

Adjustments: (1) always state the estimate before multi-step runs (the model is useless retroactively); (2) batch solver scripts per category rather than per task to cut tool calls ~2×; (3) the subagent unit cost (25) felt about right relative to the coordination overhead observed. These are n=1 observations — recorded, not yet model changes.

*End of Logic Architecture v1.9*
## 17. Live-work transfer instrument

**Answers v1.1 §6.Q4.** Benchmarks measure benchmark tasks. This section instruments the actual target: live, messy, multi-hour work.

### 17.1 Work-sample review
1. **Sampling:** once per ~20 substantive sessions (or monthly, whichever comes first), select 3 completed live tasks at random from the session history — not the best, not the worst, random.
2. **Scoring:** for each sampled task, score protocol adherence against a fixed rubric: strategy selected before solving (§13)? Uncertainty labeled per §3.4 and delivered unchanged? Mechanical claims traceable (§3.3)? Counterfactual run for decisions (§12)? Each item pass/fail with a one-line citation.
3. **Recording:** the scores go in the observation log (classification `calibration`), with the same honesty as benchmark scores. A task that ignored the architecture is data, not a secret.
4. **No gaming:** the sample is drawn before scoring, and the rubric is fixed in advance (the list above). Retroactive rubric changes are logged as what they are.

### 17.2 Transfer-review cadence (new in v1.6)

The §17.1 review runs at least once per version cycle, not merely "once per ~20 sessions." Each architecture version's release notes cite the transfer review it was baselined against. A version cycle that ships without a transfer review is incomplete — the bank score alone does not release it.

### 17.3 Dual-baseline requirement (new in v1.6)

From v1.6 on, every version is baselined twice: (a) a heldout bank (the solver's score), and (b) a live-work transfer review (the architecture's score). Both are release gates. A version that scores 100% on the bank but regresses on transfer adherence has not improved — it has overfit to the measurable. When the two disagree, the transfer review's findings drive the next version's changelog, not the bank's.

### 17.4 Interpretation

Transfer is working if sampled live tasks show the same protocol adherence as benchmark runs, within noise. If live adherence is systematically lower, the architecture is a benchmark costume — and the fix is in the protocols' cost (§10), not in exhortation. This instrument exists to detect exactly that.

### 17.5 Gate independence and input selection (new in v1.11)

Release gates (§17.3) are only as trustworthy as their independence from the machinery they grade. Two §19 trials in the 2026-10-07 cycle make independence a gate requirement, not a convenience.

**Adversarial canaries (trial CONFIRM+ADOPT: `architectures/literature/trial-adversarial-canary-2026-10-07.md`).** Two harness-layer regressions — a sabotaged always-pass checker stub and a pruned (truncated) gate input — each caused a known-BLOCK canary task to SEAL through the full gate suite (lint, elision-check, pcc-audit, D1 reconcile, exec-check, span-check all passed). The validation environment shared the product layer's assumptions: (1) a checker that ran validated correctly — reconcile verifies the checker *ran*, not that its verdict is *correct*; (2) gate input is complete — no gate verifies input completeness against the original task. An independent black-box canary (subprocess run, outcome grounded only in terminal signals vs a pre-fixed manifest, trusting no checker verdict or intermediate state) caught 2/2 regressions the suite missed, with 0/2 false alarms. Standing implementation:
1. **Canary tasks as a pre-gate:** a fixed set of known-verdict tasks (must-BLOCK omission, must-BLOCK distortion, must-SEAL control) runs against the pipeline; any manifest mismatch blocks and alarms. Re-runs on harness code change (a sabotage *is* a code change, so change-triggered re-runs cannot mask the target class). Also runnable standalone/scheduled for a fully external check.
2. **Checker-verdict plausibility:** checker invocations are recorded; a covered checker with ≥50 runs and zero non-PASS verdicts is itself the anomaly (a never-failing checker is suspicious — inverts the current trust). Recorded as CANARY ALARM.
3. **Gate-input hash-pinning:** the exact bytes each gate validates are hashed; the elision gate's inputs must be byte-identical to the sealed task.json, else INPUT-MISMATCH fails closed. Catches both in-place pruning and renamed pruned copies.
Honest limits (kept): n=1 canary per verdict class — confirmed in kind, not rate; the adoption is of the *requirement*, production design left open beyond the standing implementation.
- **§17.5, mutation-audit gate hardening.** Trial HARDEN (arXiv:2610.09142): source-informed mutation of the checkers found elision-check is a single-mechanism gate — disabling `extractBindings` kills all 12 BLOCK cases (M4 critical); gutting SIGNALS or the OMISSION leg flips 6–8 (M2/M3 critical); the PCC `> 0` threshold and `?? dropped.length` fallback are each load-bearing (M5/M6). Five of six hardenings implemented: critical-code pins for `extractBindings`+SIGNALS (t13/t14), PCC threshold locked at `> 0` by source assertion, `dropped.length` fallback protected by behavioral fixture, leg→case blast-radius map documented (distortion uniquely covers rr3-1/rr3-5; omission uniquely covers 8/12), mutation audit as periodic gate (t15, ~4s). H5 (second independent detection path) documented as accepted risk: single-mechanism gate with multi-gate defense-in-depth (PCC-audit, canary) — the accepted architecture, not a gap. Suite grew 11/12→14/15 with the three new tests.

**Gate-input selection (trial REJECT — no vulnerability; kept as standing control: `architectures/literature/trial-gate-input-2026-10-07.md`).** The B2 failure class ("gate hashed the narration transcript instead of the diff") does not exist on this stack: planted glowing narration over dropped requirements still BLOCKs (elision-check reads only the five formalization-record fields) and FAILs (pcc-audit reads dropped_count, not narration); the seal hashes task.json and gate-verdict JSONs. The durable rule — **hash the artifact, not the prose** — is verified, not assumed. Re-run this negative control if any gate's input set ever changes.

**Mutation audit as a design-robustness gate (trial HARDEN: `architectures/literature/trial-mutation-audit-2026-10-07.md`).** Selftests answer "does the checker work on known cases"; the canary answers "did the checker run faithfully on this input" (runtime, harness-layer). Neither answers "is the checker's *design* robust to partial mechanism failure" (design-time, code-layer). Source-informed mutation testing fills that axis: targeted mutations of production-checker copies (single-leg removal, signal gutting, binding-extraction disable, threshold raise, status-blind counting) against known-verdict suites. Findings on this stack: elision-check is a **single-mechanism gate** — `extractBindings` disabled kills all 12 BLOCK cases; the OMISSION leg uniquely covers 8/12, DISTORTION uniquely covers 2/12 (rr3-1, rr3-5); the PCC `> 0` threshold and `?? dropped.length` fallback are each load-bearing (raising the threshold or dropping the fallback false-accepts single-drop fixtures). Hardening in production: (1) `extractBindings`+SIGNALS pinned as critical code — the 26-case elision selftest runs as suite test t13 and the pins verify as t14; (2) the PCC threshold literal asserted `> 0` by a source check; (3) the fallback covered by a behavioral fixture; (4) the leg→case blast-radius map recorded in code (before changing a leg, check its radius); (5) the full mutation matrix re-runs as suite test t15 (~4s) on every production edit. The sixth recommendation — a second independent detection path *inside* elision-check — is documented as **accepted risk**: the gate is single-mechanism by design; defense-in-depth comes from *other* gates (PCC-audit, canary), not from within. That is the accepted architecture, not an unaddressed gap.

**Runner-selection guard (v1.11 infrastructure fix).** The v11 gate regressed to 8/20 when run with the wrong runner script (`run-v10.mjs` instead of `run-bank.mjs`) — the v10 runner's solver map routes v11 categories to v9-era solvers that cannot parse v11 formats. The failure mode is silent: tasks BLOCK with "unknown variant" rather than failing the gate loudly. Fix: `run-v10.mjs` now refuses v11 task IDs with a clear "use run-bank.mjs" message (fail-fast). The guard makes this failure mode impossible. Documented: `reasoning-runtime/v11-gate-regression-2026-10-08.md`.

---


---

# Layer 5: Evolution

*How the architecture changes itself: open questions, adversarial testing, construction discipline, and literature intake.*

**Change policy — integration, not accretion (standing directive).** New mechanisms are integrated into the framework, never attached at the end:
1. **Every addition names what it modifies.** A candidate MUST identify the existing sections it changes. If it connects to nothing, that is a smell — either the framework has a real gap or the candidate does not belong.
2. **Existing sections are revised.** The framework absorbs the idea; the idea does not sit alongside the framework. A new section is the last resort, not the default.
3. **Ebb and flow.** The architecture MUST be able to shrink. Each version considers: what can be *merged* (overlapping sections combine), what can be *simplified* (a mechanism absorbed into a more general one), what can be *removed* (superseded, redundant, or proven unnecessary — removals are logged in the changelog with reasons). A version that only adds is a version that did not look hard enough.
4. **Density over length.** The goal is a framework where every part bears weight, not a catalog where new parts accumulate. If the spec is growing monotonically across versions, the change policy is failing.

**Anti-bloat rule (standing directive).** Growth is fine; bloat is not. Before adding a fix, guard, or check:
1. **Show the gap.** Which existing mechanism should have caught this, and why didn't it? If an existing mechanism covers it, fix the mechanism — do not add a new one.
2. **Generalize before specializing.** If the new case is an instance of an existing failure mode, extend the mode's statement — do not create mode N+1. A new failure mode is warranted only when the *detection* is genuinely different, not just the story.
3. **No scar tissue.** A guard added for one incident, never triggered again, is bloat. Guards earn their place by catching things, not by commemorating things. The calibration log (§8) and observation log track which guards fire; a guard with no firings across versions is a removal candidate.

## 6. Open questions for v1.3

1. **Critic calibration.** The v1.2 critic experiment measures the critic's hit rate once. Does the rate hold across domains, or is the critic good at planted fallacies and blind to live ones? What is the critic's precision on unprompted live drafts?
2. **Calibration convergence.** The §8 log is seeded but far from the 20-resolved-per-label threshold. If live consequential predictions arrive slower than the architecture versions turn over, does per-label calibration ever converge — or should calibration attach to the *practitioner* (persistent across versions) rather than the version?
3. **Template generation.** §14 logs candidate templates from novel tasks. What promotes a candidate to the §9 library — how many successful uses, and who judges the interfaces clean?
4. **Distractor taxonomy.** §16 handles decorative prompt elements. Is there a stable taxonomy of distractors (irrelevant data, misleading format, false urgency, authority cues), and do different types need different guards?
5. **Chain-length limits.** §15 verifies each step of a multi-step task. At what chain length does per-step verification cost more than the chain is worth (§10), and what is the fallback — shorter chains, stronger per-step tools, or refusing the task?

---

## 18. Bank builder's checklist (new in v1.7)

**Driver:** the v7 cycle's three bank bugs were generator-side instances of known solver failure modes. The catalog was built from solver errors; builders make the same errors. This section extends the discipline to construction.

Before sealing a bank, the builder must run these checks against their own generator solvers:

1. **Bound-direction check (§4.10).** Any pruning in a generator solver gets the full four-item checklist: state minimization/maximization direction, prove bound validity, state exact prune condition, show pruning occurs only when the branch cannot beat the incumbent. (v7-route-005: Dijkstra `(node,time)` pruning was unsound under mandatory waypoints — the state key didn't distinguish visited-mandatory subsets.)

2. **Structured tie-break comparison (§5 mode 15).** Generator tie-breaks use structured keys in the spec's order, never serialized-string comparison. (No v7 instance, but the v3/v4 solver bugs are the warning.)

3. **Accumulator audit (§3.2).** Every sum, count, or accumulator in a generator solver must be shown to aggregate exactly the specified set — no more, no less. Name the set, name the accumulator, prove they match. (v7-arith-003: `daytot` summed airfare/lodging into a meals+ground cap.)

4. **Marginal-vs-total verification.** Any tiered, bracketed, or thresholded computation must be verified marginal (each rate applies only to the portion in its bracket), not total. Test with an instance below the top bracket. (v7-arith-002: full bracket widths applied unconditionally.)

5. **Constraint-soundness proof for pruning.** Any search pruning must be proven sound under ALL task constraints, including mandatory-visit, must-include, and implication constraints — not just the objective. (v7-route-005 again: the pruning was sound for unconstrained shortest path, unsound with waypoints.)

The builder's report must confirm each check explicitly (not "all checks passed" — which check, on which solver, with what evidence). A bank sealed without this checklist is not sealed under this architecture.

6. **Validity+objective scoring for optimization tasks (§5 mode 18).** Score **validity + objective value**, not exact match against the key. A solver output is correct iff (a) it satisfies all task constraints (validity) and (b) its objective value equals the key's objective value (optimality). The *identity* of the optimum — which valid optimum was selected — is not scored.

   Exact match against the key is reserved for tasks where (a) the optimum is provably unique, or (b) the tie-break is prompt-stated (e.g., "report the lexicographically smallest optimal set"). When the tie-break is prompt-stated, the builder must verify the key itself follows it — a key that violates its own stated tie-break is a bank bug, not a gold standard.

   Rationale: under non-canonical optimum selection (§5 mode 18), exact-match scoring confounds solver correctness with the bank author's arbitrary tie-break choice. Validity+objective scoring separates the two: the solver is graded on what the task requires, the bank on what it asserts.

---

---

## 19. Literature intake (new in v1.7)

**Driver:** through v1.6, every architecture addition came from internal findings (caught bugs, calibration data, transfer gaps). That is a strength — every mechanism earned its place — but it bounds learning to errors already made. The field has documented failure modes, calibration techniques, and verification patterns not yet encountered here. Literature becomes a standing input, not a one-off survey.

**Sources:** official (papers, documentation, textbooks) AND practitioner (forums, engineering blogs, post-mortems, discussion threads). Practitioner sources are valuable precisely because they report failures, not just methods.

**Process (per version cycle, alongside the transfer review):**
1. **Sweep:** broad research pass over logic, reasoning, agent reliability, calibration, verification. Log candidates at `architectures/literature/`.
2. **Candidates:** each is a specific mechanism/technique with source, claim, and target (§ or failure mode it would address).
3. **Empirical gate:** candidates are TESTED before entering the spec — adversarial trials, calibration experiments, or trial adoption with measurement. Literature never enters on authority alone. (Precedent: the v1.1 critic experiment, which tested the critic protocol before trusting it.)
4. **Verdict:** adopted / rejected / pending, with reasons logged. Rejections are as valuable as adoptions — they prevent the spec becoming a literature review.

**Guard:** the architecture's empirical character is non-negotiable. A candidate with strong literature support but no successful empirical trial here does not enter. The log exists to make this gate visible.

**A/B evaluation (restored original harness vision):** every candidate mechanism, before entering the spec, gets a baseline-vs-treatment trial: baseline architecture vs. baseline-plus-candidate, on a test battery targeted at the mechanism's claim (e.g., planted failures for a detection mechanism, calibration tasks for an uncertainty mechanism). Same tasks both arms, blind scoring, sealed evidence. Verdict is adopt/reject on the measured difference. The harness is a decision instrument, not just infrastructure.

### 19.1 Trial design: locked operating points (new in v1.9)

*Trial: `architectures/literature/trial-operational-validity-2026-10-06.md` (replication of Gao arXiv:2610.04575 on the project's own detectors).*

The §19 empirical gate says *test before adopting*. This subsection says *how to test a detector*: discrimination numbers (AUROC, ECE, recall) do not transport to deployment. A detector is validated only at a **locked operating point**.

**Requirement.** Every probe/monitor trial (A2, MA2, F1 family, DTC follow-ups, any §11 detector evaluated as a scored monitor) must:

1. **Pre-register a locked operating point:** the alarm rule (score < t → flag) plus the intended false-alarm rate (FAR), with the threshold t frozen on calibration data only. No peeking at the held-out set when setting t.
2. **Report realized vs intended FAR** on held-out data. The threshold-realization gap is a required table row, not a footnote.
3. **Report detection rate at the locked point**, not AUROC. AUROC may appear as a secondary ranking diagnostic; it is not the validity claim.

**The contract.** Each trial report completes the 8-field Operational Validity Contract for the detector under test:

| Field | Meaning |
|---|---|
| Target | What event the detector is meant to catch |
| Observability | What the detector can see (features, logs, traces) |
| Identity | The unit the score attaches to (task, trace, run, event) |
| Timing | When the detector runs (pre-solve, post-solve, in-pipeline, post-hoc) |
| Intervention unit | What gets flagged/changed when the alarm fires |
| Comparator | The baseline the detector is measured against — must be the **deployment unit**, not a historical batch |
| Calibration | How the operating point was set (data, FAR target, freeze procedure) |
| Cost | Compute/latency cost of running the detector |

*Why this matters here:* none of the project's probe/monitor trials to date ever locked an operating point prospectively. The trial found a 0.72-AUROC calibrator realizing 66.4% FAR (vs 5% intended) under era shift with a 71% alarm rate — operationally a constantly-ringing alarm — and ~6% detection even at a perfectly realized point. Every discrimination number held before this trial was exactly the quantity shown not to transport.

*Worked example:* the full contract table for six project detectors (Pinocchio calibrator, DTC fragility flag, abstention gate, bound-check static regex, trace oracle, span-check gate) is in the trial report; the spec states the requirement, the report holds the example.


---

# Appendices

## References (selected)

- Hammack, R. *Book of Proof* (3rd ed.). http://cse.unl.edu/~choueiry/S11-235/files/BookOfProof.pdf
- *forall x: Calgary* (Open Logic Project). https://forallx.openlogicproject.org/
- Genesereth, M. *Introduction to Logic* (Stanford). http://intrologic.stanford.edu/homepage/materials.html
- Erickson, J. *Algorithms*. http://jeffe.cs.illinois.edu/teaching/algorithms/
- MIT 6.006 *Introduction to Algorithms* (OCW). https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/
- Wei et al. Chain-of-Thought Prompting. arXiv:2201.11903
- Kojima et al. Large Language Models are Zero-Shot Reasoners. arXiv:2205.11916
- Wang et al. Self-Consistency Improves Chain of Thought. arXiv:2203.11171
- Zhou et al. Least-to-Most Prompting. arXiv:2205.10625
- Khot et al. Decomposed Prompting. arXiv:2210.02406
- Gao et al. PAL: Program-Aided Language Models. arXiv:2211.10435
- Yao et al. ReAct; Tree of Thoughts. arXiv:2210.03629; arXiv:2305.10601
- Shinn et al. Reflexion. arXiv:2303.11366
- Huang et al. LLMs Cannot Self-Correct Reasoning Yet. arXiv:2310.01798
- Lightman et al. Let's Verify Step by Step. arXiv:2305.20050
- Kirchner et al. Prover-Verifier Games Improve Legibility. arXiv:2407.13692
- McAleese et al. CriticGPT. https://cdn.openai.com/llm-critics-help-catch-llm-bugs-paper.pdf
- Anthropic. Building Effective Agents. https://www.anthropic.com/engineering/building-effective-agents
- Tetlock, P. *Superforecasting*. (Calibration: Brier scores, base rates, and the discipline of scored predictions — the intellectual ancestor of §8.)
- Kahneman, D. *Thinking, Fast and Slow*. (Pre-mortem, §12.1; base-rate discipline, §1.3.5.)
- Ari project: FVC v1.1 pilot final closeout (2026-10-04); mandatory-verification branch closeout v0.5.4 (2026-10-04). Local evidence records.
- Ari project: v1.0 heldout baseline 51/51 (2026-10-04); observation log entry with protocol and caveats.

---


---
