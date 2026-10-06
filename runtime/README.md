# Reasoning Runtime

Executable pipeline for the Logic Architecture v1.7: **formalize → solve → verify → label → seal**.

## Quick start

```
node pipeline.mjs --task <task.json> [--assist] [--tools-log <log.json>]
```

Each stage writes to `runs/<task-id>/<stage>.json`. The pipeline stops at the first failing gate.

## Components

| File | Spec | Status |
|---|---|---|
| `DESIGN.md` | — | Design doc (Phase 1) |
| `pipeline.mjs` | §§13,4,3,15,11 | Orchestrator — all 5 stages + gates |
| `tiebreak-check.mjs` | §5 mode 14 | ✅ Tested — catches v3-sched-002 pattern |
| `bound-check.mjs` | §5 mode 16 | ✅ Tested — catches v5 inverted-prune pattern |
| `verifier-comb.mjs` | §5 mode 15 | ✅ Tested — flags correlated verification |
| `exec-check.mjs` | §5 mode 19 (adopted, §19 output-deception trial) | ✅ Tested — execution-claim cross-reference: every execution claim in the record (trace entries, verify.json checker entries, "verified via X" prose, re-run/agreement measurements) must resolve to the runner-owned independent exec log. 11/11 selftests; 10/10 recall 0/10 FP on the trial probe set; 0 FP on 64 real bank run dirs |
| `arg-check.mjs` | §1.1 | ✅ Tested — validates chain structure |
| `make-task.mjs` | §13 | ✅ Phase 2 — generates task.json from bank prompt by category |
| `templates/` | §13 | Phase 2 — 10 category templates embedded in make-task.mjs |

## Phase 2 (complete)

1. **Task templates:** `make-task.mjs --bank <prompts.json> --id <id> --out <task.json>`
   generates a filled skeleton with the category's strategy tag, answer format,
   and verify wiring. 10 categories: arithmetic, selection, routing, scheduling,
   packing, consistency, counterfactual, critique, strategy-classification, distractor.
2. **Crosscheck with live tool logs:** solve stage writes `tools-log.json` from the
   trace; `verify.draft: "auto"` generates [MC-n] draft claims from the trace;
   crosscheck matches claims against the live log (token-overlap tuned: dash-form
   script ids, no periods in claim sentences).
3. **Ed25519 seal:** seal stage issues a signed envelope via `envelope.mjs` using
   the project's real signing key (`~/.config/noor-evidence/signing.key`, same key
   as v1.7 releases). Falls back to SHA-256-only with a warning if key unavailable.

End-to-end tested on 3 real v8 tasks (all correct vs bank, all gates pass, signatures verify):
- `tasks/v8-arith-001.json` (COMPUTATION) — lint ✓ crosscheck ✓ signed seal ✓
- `tasks/v8-consist-001.json` (COMPUTATION) — lint ✓ crosscheck ✓ signed seal ✓
- `tasks/v8-critique-001.json` (JUDGMENT) — lint ✓ arg-check ✓ signed seal ✓
Solvers in `solvers/`. Task files in `tasks/`.

## Phase 3 (complete)

1. **Real search solvers** (PAL-style: parse prompt, deterministic search, print answer):
   - `solvers/solve-select.mjs` — constrained selection via branch-and-bound (v8-select-001 cargo format)
   - `solvers/solve-route.mjs` — routing via DFS with pruning (v8-route-001,002,003,004,006 link-attribute format)
   - `solvers/solve-sched.mjs` — scheduling via branch-and-bound; handles multi-machine/eligibility, single-machine, job caps, deadlines, maintenance windows, and both makespan + max-lateness objectives (v8-sched-001,002,004,005,006)
   - `solvers/solve-pack.mjs` — bin packing via branch-and-bound; handles fixed capacity, multiple sizes, fragile groups (v8-pack-001,003,004)
   - `solvers/solve-counter.mjs` — knapsack margin via branch-and-bound tracking top-2 (v8-counter-001,002)
   - Pipeline `stageSolve` now passes `--prompt <file>` to SEARCH solvers (was COMPUTATION-only).
2. **Checker exercises on real bugs:**
   - `fixtures/v8-sched-002/`: tiebreak-check catches the v3-sched-002 serialization bug (`${name}@${start}`) via both serialization heuristic and pairwise disagreement. Pipeline gate BLOCKS.
   - `fixtures/bound-test/`: bound-check catches the v5 inverted-pruning bug (`bound > incumbent` for max) via dynamic case (pruned_optimal_branch=true). 
3. **Batch runner:** `run-bank.mjs --bank <prompts> [--answers <answers>] [--out <results>] [--ids <...>]`
   - Auto-generates task files, runs pipeline, scores (strict blindness: counts only).
   - Full v8: 17 PASS (10/17 correct), 12 GATE_BLOCK (unhandled variants), 21 SKIPPED (JUDGMENT/unimplemented).
   - The 7 misses are not inspected per blindness protocol.
4. **Calibration wiring:** label stage appends `{date,claim,label,outcome:null,task_id}` to `calibration-log.jsonl`; run-bank resolves outcomes after scoring; `../logic-tools/calibrate.mjs --log calibration-log.jsonl` reports hit rates.

Existing tools used as-is (not modified): `../logic-tools/lint-claims.mjs`,
`../logic-tools/crosscheck.mjs`, `../logic-tools/calibrate.mjs`, `../ari-evidence-tools/` (hash/envelope).

## Task file format

```json
{
  "id": "task-001",
  "description": "natural language description",
  "consequence": "consequential",
  "formalize": {
    "strategy": "COMPUTATION",
    "strategy_basis": "one line",
    "premises": [{"id": "P1", "text": "...", "source": "observed|stated|derived|assumed"}],
    "constraints": ["..."],
    "success_criteria": "...",
    "load_bearing": ["..."],
    "decorative": ["..."]
  },
  "solver_script": "./solve.js",
  "answer": "A@3",
  "answer_format": "^[A-Z]@\\d+$",
  "verify": {
    "tiebreak": {"spec": "...", "candidates": "...", "comparator": "..."},
    "bound": {"spec": "...", "prune": "...", "cases": "..."},
    "verifiers": {"plan": "..."},
    "chain": "...",
    "draft": "...",
    "acknowledge": ["checker-name"]
  },
  "label": {"label": "supported", "basis": "one line", "strategy_tag": "COMPUTATION"}
}
```

## Gates

1. **formalize → solve:** formalization schema-complete (strategy, basis, premises with valid sources, success criteria).
2. **solve → verify:** answer present and matches `answer_format`.
3. **verify → label:** all checkers pass, or failures explicitly acknowledged.
4. **label → seal:** label present with basis; `verified` rejected if any checker failed or was acknowledged.
5. **pre-seal (mode-19):** `exec-check.mjs` cross-references every execution claim in the complete record (solve.trace, verify.json checks, draft.md and label.json "verified via X" prose, re-run/agreement measurements) against the runner-owned `independent-log.jsonl` (written at exec time, never derived from the trace). FABRICATION blocks the seal unless `exec-check` is explicitly acknowledged in `task.verify.acknowledge`. Covers what D1's `reconcile()` cannot: reconcile runs before verify.json/label.json are saved and never reads prose claims. Hardening vs the trial prototype: multi-token via-list extraction ("via X, Y and Z"), `--independent-log` production mode alongside the trial's `--execlog` mode, 11/11 selftests.
6. **seal:** hashes all stage artifacts, writes signed envelope. Never fails.

## Judgment/code split

The pipeline orchestrates; the agent decides at judgment points:
- **formalize:** agent fills the structure (judgment), pipeline validates schema (code).
- **solve:** COMPUTATION + solver_script runs deterministically; other strategies read agent-provided answer.
- **label:** agent assigns (judgment), pipeline enforces §3.4 consistency (code).
- `--assist` mode: pauses with guidance at judgment points.


## Phase 4 (complete)

1. **Blind adjudication of 7 misses** (strict blindness: adjudicators never opened answer files):
   - v8-route-002: UNHANDLED_VARIANT (waypoint/hub constraints not parsed)
   - v8-route-003: SOLVER_BUG (objective regex missed "Minimize"; silent fallback to distance) → FIXED
   - v8-route-004: UNHANDLED_VARIANT (k-th route enumeration not implemented) → now fails loudly
   - v8-route-006: UNHANDLED_VARIANT (waypoint constraints)
   - v8-counter-002: UNHANDLED_VARIANT (quadruple-removal question; solver only does margin)
   - v8-sched-001, v8-sched-004: SOLVER_BUG (tie-break) → FIXED
   - Reports: `adjudication-route.md`, `adjudication-counter.md`, `adjudication-sched.md`
2. **Generic select solver** (`solvers/solve-select2.mjs`): handles all 5 v8-select variants
   (team, family, multibin, bonus, implic) via format detection. All 5 verified correct vs bank.
   Wired into run-bank.mjs via TASK_SOLVER_OVERRIDE.
3. **Route objective fix**: regex now accepts "minimize"/"minimizing"; fails loudly on unparseable
   objectives instead of silently defaulting to distance (mode-15-style silent failure eliminated).
4. **verifier-comb demo** (`tasks/v8-sched-002-demo.json` + `tasks/v8-sched-002-plan.json`):
   4 assumptions, 4 verifiers (primary, independent brute-force, tiebreak-check, weak rerun).
   Pipeline verify stage runs verifier-comb: PASS with correct weak/independent labeling.
5. **tiebreak-check wired into real task**: `tasks/sched-tiebreak-spec.json`,
   `tasks/sched-candidates.json` (from real solver output), `tasks/sched-comparator.mjs`
   (extracted from solve-sched.mjs). Demo task runs 4 checkers, all PASS.

Batch results: 22 PASS (19/22 correct), 7 GATE_BLOCK, 21 SKIPPED.
(Phase 3: 18 PASS, 11/18 correct, 11 GATE_BLOCK.)
Remaining misses: route-002, route-006 (waypoints), route-004 (k-th), counter-002 (quadruple-removal).

## Phase 5 (complete)

1. **Waypoint-constrained routing** (`solvers/solve-route.mjs` extended):
   Parses "must pass through at least N of hubs {...}", "must pass through J, N, and O",
   "MUST visit G, J, and K". DFS enforces waypoint satisfaction. Fixes route-002, route-006.
2. **k-th route enumeration** (`solvers/solve-route.mjs` extended):
   Parses "Output ONLY the 9th route in this ordering"; enumerates all feasible routes,
   sorts by (objective, tie-breaks), picks Nth. Fixes route-004.
3. **Time-window routing** (`solvers/solve-route.mjs` extended):
   Parses "A: [0, 12], service 1"; simulates arrival with wait/service/close logic;
   objective "Minimize arrival time at T". Fixes route-005.
4. **Link-status filtering** (`solvers/solve-route.mjs` extended):
   Excludes [CLOSED], [PROPOSED not built], [NIGHT-ONLY], [weight limit] links.
   Fixes distract-003.
5. **Quadruple-removal counterfactual** (`solvers/solve-counter.mjs` extended):
   Auto-detects "removing QUADRUPLES"; enumerates 4-combinations alphabetically,
   recomputes optimal set, returns first changing quadruple or NONE. Fixes counter-002.
6. **Per-task arith solvers** (`solvers/v8-arith-002..006.mjs`): payroll, expense report,
   commission (overlapping accelerators), late penalty, loan amortization.
7. **Generic consist solver** (`solvers/solve-consist.mjs`): auto-detects depot-books,
   piecewise-function, and linear-equation formats. Fixes consist-002..004.
8. **Distract filtering**: v8-distract-001/002 per-task scripts; distract-004 via
   job-status filtering in solve-sched.mjs (excludes completed/preempted/cancelled/on-hold/deferred).
9. **Counterfactual extensions**: v8-counter-003 (network with link changes),
   v8-counter-004 (quadruple constraint removal in scheduling),
   v8-counter-005 (assignment after removals) as per-task scripts.
10. **New solvers**: `solvers/solve-shift.mjs` (shift assignment, fixes sched-003),
    `solvers/solve-pack2d.mjs` (2D grid packing, fixes pack-002).
11. **run-bank.mjs**: TASK_SOLVER_OVERRIDE + TASK_FORMAT_OVERRIDE for distract/shift/pack2d;
    "consistency" category mapped to solve-consist.mjs.

Batch results: **41 PASS (39/41 correct, 95%), 0 GATE_BLOCK, 9 SKIPPED**.
(Phase 4: 22 PASS, 19/22 correct, 7 GATE_BLOCK.)
The 9 SKIPPED are JUDGMENT categories (5 critique + 4 strategy-classification) — by design.
2 misses remain (unidentified per blindness protocol).

## Phase 6 (complete)

1. **Blind adjudication of 2 remaining misses** (strict blindness held):
   - v8-route-002: SOLVER_BUG — constraint regex missed "must be <=" phrasing, toll cap silently dropped → FIXED (regex accepts optional "must be"; verified by independent brute-force enumeration)
   - v8-consist-002: SOLVER_BUG — depot branch hardcoded `MISMATCH:` prefix instead of reading `CONSERVATION:` from prompt → FIXED (label read from prompt; make-task.mjs answer_format extended)
   - Both fixes verified; no regressions. Report: `adjudication-phase6.md`
   - **FINAL: 41/41 deterministic tasks correct; 50/50 overall including 9 JUDGMENT heuristic tasks**
2. **JUDGMENT categories** — graceful partial automation, no longer SKIPPED:
   - `solvers/solve-critique.mjs`: heuristic flaw detection for argument critique. Parses premises/steps, scores suspicion signals (strong modals, universals, reassertion-after-refutation, novelty appeals). Also emits `chain.json` for arg-check structural validation. All 5 v8 critique tasks produce structurally-valid output.
   - `solvers/solve-strategy.mjs`: §13 keyword classifier (LOOKUP/COMPUTATION/SEARCH/JUDGMENT) with weighted signal phrases and §13 priority tie-breaking. All 4 v8 strategy tasks classify correctly.
   - `run-bank.mjs`: JUDGMENT categories mapped in SOLVER_MAP; heuristic solvers pre-run in batch mode, answer set directly, labeled `plausible` (not `supported`) with basis noting heuristic analysis. Critique tasks wire arg-check via generated chain.json.
   - Batch: 9/9 JUDGMENT tasks PASS (previously 9 SKIPPED).
3. **ARCHITECTURE-FINDINGS.md** — 7 candidate findings for future v1.8, with evidence and trial requirements. Spec NOT modified. Strongest candidates: F1 (silent requirement-dropping → new failure mode) and F5 (§3.6 formalism-transfer gap).
4. **Performance (pack-002)**: Attempted fractional-knapsack bound + greedy incumbent + memoization. Result: 2m23s (worse than 105s baseline) — bound overhead exceeded pruning benefit because geometry, not area, is the binding constraint; memo OOM'd on the fine-grained state space. REVERTED to original with documentation. Future: cell-branching DFS.

## Resumption notes (for next session)

- **Done (Phase 6):** JUDGMENT partial automation (9/9 PASS); blind adjudication of final 2 misses (both SOLVER_BUG, both fixed); ARCHITECTURE-FINDINGS.md; pack-002 optimization attempted and reverted (documented). **Final v8: 50/50 (41/41 deterministic + 9/9 heuristic).**
- **Next (Phase 7, if needed):**
  - The runtime has reached 50/50 on v8. Further work would need a harder bank (v9) or new capability areas.
  - Consider cell-branching DFS for pack-002 if batch time matters (~105s/task).
  - Consider: should the v1.8 spec process begin? F1 and F5 are the strongest candidates; per §19 each needs a baseline-vs-treatment trial first.
  - Calibration: the 9 JUDGMENT tasks now contribute `plausible` labels — check hit rates via calibrate.mjs.
- **Do not:** modify `../logic-tools/` or `../ari-evidence-tools/` — integrate, don't fork.
- `runs/` is ephemeral (per-run artifacts). `tasks/`, `solvers/`, `templates/` are durable.
- Known quirk: crosscheck's sentence splitter breaks on "." in paths — keep [MC-n]
  claim sentences period-free except the terminal period; use dash-form ids.
- Blindness: run-bank scoring reports counts only. Never print correct answers for failed tasks.

---

## Previous resumption notes (Phase 5 → 6)

- **Done (Phase 5):** waypoint-constrained routing, k-th enumeration, time windows,
  link-status filtering (all in solve-route.mjs); quadruple counterfactual (solve-counter.mjs);
  5 per-task arith solvers; generic consist solver; distract-001/002 per-task scripts;
  job-status filtering (solve-sched.mjs); counter-003/004/005 per-task scripts;
  solve-shift.mjs; solve-pack2d.mjs. Batch: 41 PASS, 39/41 correct (95%), 0 GATE_BLOCK.
- **Next (Phase 6):**
  - The 9 SKIPPED are JUDGMENT categories (critique, strategy-classification).
    Options: (a) leave as agent-only (by design); (b) build structured templates
    for batch-mode partial handling.
  - 2 misses remain unidentified (blindness). A blind adjudication round could
    classify them without revealing answers.
  - Consider: v1.8 of the Logic Architecture driven by runtime findings?
    The runtime has surfaced real patterns (silent requirement-dropping,
    tie-break serialization, bound-direction) — these could feed back into the spec.
  - Performance: pack-002 takes ~105s (2D branch-and-bound). Consider better
    pruning or memoization if batch runs need to be faster.
  - Consider: should run-bank auto-generate formalize content, or require agent curation?
- **Do not:** modify `../logic-tools/` or `../ari-evidence-tools/` — integrate, don't fork.
- `runs/` is ephemeral (per-run artifacts). `tasks/`, `solvers/`, `templates/` are durable.
- Known quirk: crosscheck's sentence splitter breaks on "." in paths — keep [MC-n]
  claim sentences period-free except the terminal period; use dash-form ids.
- Blindness: run-bank scoring reports counts only. Never print correct answers for failed tasks.

## v9 Extension (in progress)

v9 blind baseline: 12/15 (80%) on completed, 26 GATE_BLOCK, 9 SKIPPED.
Extension work (7 parallel workstreams):
1. **select**: `solve-select-v9.mjs` rewritten (908 lines) — found 2 SILENT bugs (exit 0, infeasible answers) in old version, both mode-17 constraint drops. All 7 tasks verified 21/21 via independent cross-check.
2. **sched**: `solve-sched-v9.mjs` created (951 lines, NEW) — 6 formats (multimachine, singlesetup DP, shifts, caps, lateness, flowshop). 38/38 random instances agree with brute force.
3. **pack**: `solve-pack-v9.mjs` created — 4 formats. Notable: proved (l₁,B₁) tie-break recursion cut 001 from >5min to 0.16s.
4. **consist**: `solve-consist-v9.mjs` — stub already worked; hardened coefficient parsing.
5. **counter**: `solve-counter-v9.mjs` — dual-algorithm self-verification; fixed 004 (was emitting after-value not DROP).
6. **arith/distract/elide**: 9 per-task solvers fixed; found real rate-parsing bug in arith-003.
7. **critique adjudication**: 3 misses → all SOLVER_BUG (diction signals didn't cover v9's new fallacies). Fixed: widened causal signal, added confirms + prosecutor's-inversion signals, narrowed `full`, inconclusive→FATAL.

Re-run 1: 50/50 PASS, 0 BLOCK, 0 SKIP, **33/50** (was 32/49).
Adjudication of remaining 17 misses in progress (counter/sched/pack/individual clusters).
Anomaly: sched-v9 file showed unlogged mid-task edits (prefixes changed); restored and re-validated.

## v9 Adjudication (complete)

Re-run 2: 50/50 PASS, 0 BLOCK, 0 SKIP, **33/50** (fixes confirmed: counter-004, critique 1/2/4, pack-002 format).
Blind adjudication of 17 misses (4 adjudicators, strict blindness):
- **Solver bugs fixed**: counter-004 (BASE>DROP), critique heuristic (3 signal gaps), pack-002 (VALUE: literal).
- **No solver defect found** (16 tasks): counter 001/002/003/005 (tie-break ambiguity), pack 001/003/004 (solver conforms; bank-side suspected), sched 001/002/004/005/006 (exhaustively verified; 006 unambiguous yet missed → bank-side), arith-003 (cap granularity), arith-005 (simple vs compound), select-005 (tie-break semantics), distract-003 (prompt internally tense).
- Pattern matches v8-arith-004 precedent at scale. Bank maintainer investigating generators vs prompt specs.

## v9 Bank Repair + Re-run 3 (Oct 6, 2026)

**Score: 46/50** (was 33/50). All 50 pass gates, 0 blocked, 0 skipped.

Bank maintainer findings (11 generator bugs fixed at root, bank re-sealed):
- counter-001: direction AND tie-break inverted (maximized not minimized)
- counter-002/003/005: tie-break inverted (lex-largest not lex-smallest)
- pack-001: unsound "smallest fitting bin" restriction + unimplemented tie-break
- pack-003/004: tie-break unimplemented (pruned on >=, kept first-found)
- sched-005: invalid DP dominance for bottleneck objective (reported maxlate 3, true optimum 0)
- arith-003: per-line caps not per-day aggregate
- arith-005: off-by-one (payments applied a day late)
- select-005: tie-break inverted
New bank SHA: `e598da1b4f23c78e9c684849ba81d41de79dcce59a2c0c0ff80627fec014c545`

Solver format fix: bank uses numeric `<value>:` prefixes (e.g. `42:J03,...`), not literal `MAKESPAN:`/`VALUE:`/`LATE:`. The prompt's `MAKESPAN:` is a placeholder (like counter's `BASE>DELTA` → `12>3`). Fixed in solve-sched-v9.mjs (5 formats), solve-pack-v9.mjs (002), v9-distract-003.mjs. Gate regexes in run-bank.mjs updated.

4 remaining misses under blind adjudication: sched-002, sched-005, pack-002, counter-003.

## v9 Final 4 Adjudication (Oct 6, 2026)

- **sched-002**: SOLVER-side format — bank stores pairs sorted by NAME, solver emitted (start,name) order. Fixed (sort output pairs by name).
- **sched-005**: BANK BUG — generator rejects placements overlapping maintenance windows instead of deferring start past window (forbids voluntary idle; prompt doesn't).
- **pack-002**: BANK BUG — tie-break dead code (strict `>` at leaves means ties never evaluated; stored answer is first max-value subset in DFS order).
- **counter-003**: BANK BUG — generator's `ms_with` serializes all jobs (`est=max(m1,m2)`), not real 2-machine scheduling.
Bank maintainer fixing the 3 generator bugs at root.

## v9 Bank Repair2 + Re-run 4 (Oct 6, 2026)

**Score: 50/50** — 50 PASS, 0 gate blocks, 0 skipped. The v9 bank (built to break
the v8 ceiling) is now at ceiling as executable code.

Bank side (`reasoning-benchmark-v9/gen-v9.py`, all fixes at root, deterministic
regeneration: 50 tasks, 20/20 prompt/model audits, `twice()` determinism
assertions hold):
- sched-005: maintenance-window model now defers job starts past windows
  (`fit_start`; voluntary idle allowed) instead of rejecting overlapping placements.
- pack-002: tie-break evaluated at leaves (`val>=best` guard) AND `try_pack`
  replaced with `lexmin_pack` — an exact lexicographically-smallest placement
  search (crates in name order, candidate positions in segment-string lex order;
  first complete placement is the lex-min). The subset-level fix alone could not
  produce the true lex-min placement (max-value subset is unique; the placement
  itself had to be searched).
- counter-003: `ms_with` rewritten as genuine 2-machine list scheduling
  (LPT among ready jobs).
- New bank SHA-256: `6e89f7f046af5e76ae398e3000890ff7f7dbdfc93fbeee5d7204c158f015e938`,
  sealed in signed envelope `../ari-evidence-tools/releases/bank-v9-repaired2.envelope.json`
  (signature verified). **Evidence-chain repair:** the repair-1 envelope recorded
  a stale hash (`e598da1b…`) that did not match the on-disk file; the repair-2
  envelope supersedes it with the true hash and documents the mismatch.
- Integrity note: an unlogged 00:44 UTC edit to `gen-v9.py` (the `lexmin_pack`
  refinement) was investigated during the hourly run — legitimate, sound exact
  search; only pack-002's answer changed. Logged in `~/memory/2026-10-05.md`.

Solver side: sched-002 name-sort fix (already applied) confirmed by the 50/50.
Strict blindness held: answers never opened; scoring by counts only.
Batch results: `runs/v9-repair2-results.json` (answers excluded).

Calibration (§8.2, after 50 outcomes resolved): `supported` 478/561 = 85.2%
(within 80–95% band); `plausible` 65/74 = 87.8% — OUT OF BAND (above 50–80%).
Recorded in `../architectures/observations.md` per §8.3. The heuristic JUDGMENT
solvers are conservative relative to their label band, not miscalibrated in the
dangerous direction; no spec change proposed — needs more data.

## v9 FINAL: 50/50 = 100% (Oct 6, 2026)

Re-run 4: **50/50 PASS, 0 BLOCK, 0 SKIP**.

Repair-2 (3 generator bugs fixed at root):
- sched-005: overlap-rejection → start deferral (voluntary idle allowed)
- pack-002: dead tie-break → true lex-min packing (lexmin_pack, name-order placement)
- counter-003: serialized ms_with → parallel event-driven list scheduling (verified: 0 mismatches on all 2003 inputs vs both solver implementations)
New bank SHA: `6e89f7f046af5e76ae398e3000890ff7f7dbdfc93fbeee5d7204c158f015e938`, sealed as `releases/bank-v9-repaired2.envelope.json`.

Solver fix: sched-002 pair ordering (sort by name to match bank).

### v9 journey summary
- Baseline: 12/15 (80%) on completed, 26 gate-blocked, 9 skipped
- Extension: 7 workstreams built/extended 6 solver files + 9 per-task solvers
- Re-run 2: 33/50 (all pass gates)
- Bank repair 1: 11 generator bugs → 46/50
- Bank repair 2: 3 generator bugs + 1 solver format → **50/50**

Total bank bugs found: **14** (vs 1 in v8). The v9 bank was designed to break the ceiling — it did, and the repair process is now a validated protocol.
Adjudication reports: adjudication-v9-critique.md, adjudication-v9-counter.md, adjudication-v9-pack.md, adjudication-v9-sched.md, adjudication-v9-individual.md, adjudication-v9-final4.md

## v10 Baseline (Oct 6, 2026) — FIRST BLIND RUN

**Score: 11/16 on completed (69%)** — 15 PASS, 23 GATE_BLOCK, 3 HEURISTIC_FAIL, 9 SKIPPED = 50.
Runner: `run-v10.mjs` (v10 solver routing, v10 format overrides, any-optimum
array-membership scoring for mult-004/005). Results: `runs/v10-baseline-results.json`.
Blindness held: `benchmark-v10.json`/`answers-v10.json` never opened for solving.

- multi-optimum 5/5 (both any-optimum tasks ✓ — Mode-18 canonical tie-break works)
- multi-step arith 3/4; elision 3/4 scored (elide-003's first gate-block was a
  RUNNER regex bug `>` vs `-`, fixed, re-ran ✓); elide-004 missed
- strategy 0/3 (heuristic classifier all-zero → LOOKUP default; v10 formats differ)
- critique 3× HEURISTIC_FAIL ("no steps parsed"; v10 format differs)
- 22 carryover (select/route/sched/pack/consist/counter): all GATE_BLOCK at solve —
  v10 formats new across the board; no v9-era solver parses any (25/25 FATAL survey)
- correction-distractor ×6, distractor ×3: SKIPPED (no solver yet)
- 5 misses → blind adjudication (E5); solver author pre-flagged arith-003 as
  ROUNDING_DISPUTE risk (prompt silent on intra-month rounding)

Extension workstreams: E1 25 carryover per-task solvers; E2 F4-discipline
generalization (correction-distractor); E3 critique/strategy format updates;
E4 distractor ×3; E5 blind adjudication of 5 misses.

## F2/F3 checker FPR §19 trial (Oct 6, 2026) — complete

Closes the "need false-positive data" requirement from ARCHITECTURE-FINDINGS.md.
Harness: `trials/f2-f3-fpr/` (run-trial.mjs, 14 cases, results.json); report:
`trials/f2-f3-fpr/trial-f2-f3-fpr.md`. Negative cases extracted from 50/50
v9-bank solvers; no answer keys opened.
- **F2 tiebreak-check:** pairwise-disagreement signal 0 FP on 6 real correct
  comparators; serialization heuristic 1 FP (provably-correct padded
  serialization flagged). Historical v3-sched-002 bug caught. Verdict: mandate
  pairwise as blocking, heuristic advisory; candidates must include
  key-order-conflicting pairs.
- **F3 bound-check:** static direction check 3/3 FP on real correct prunes
  (strict `<`/`>` deliberately preserve tie-breaks); the checker's prescribed
  `<=` pattern itself prunes an optimal tie branch (dynamic DEFECT); its detail
  message is backwards. Dynamic check sound (0 FP, caught the v5-pattern bug
  the static check missed). Verdict: reject static as gate, gate on dynamic only.
- Trial-only; no checker or spec code modified. Next: F4 needs new bank items
  (v10 work); calibration `plausible` band needs more data.

## v10 Extension Hour (Oct 6, 2026) — 7 parallel workstreams

**Full re-run after extensions: 50/50 PASS, 0 BLOCK, 0 SKIP, score 41/50**
(results: `runs/v10-extension-rerun-results.json`, answers excluded for blindness).
Baseline was 15 PASS / 23 GATE_BLOCK / 3 HEURISTIC_FAIL / 9 SKIPPED (10/15 scored).

- **E1a** — 12 per-task solvers (route/sched/select): `solvers/v10-route-001..004.mjs`,
  `v10-sched-001..004.mjs`, `v10-select-001..004.mjs`. All 12 independently verified
  vs separate Python brute-force (12/12 match). New v10 formats: `DISTANCE:`/`MAXLEG:`/`TIME:`
  prefixes, scalar-integer scheduling, `VALUE:`/`TOTAL:`/`RETURN:`/`PRICE:` prefixes.
  Elide-003 confirmed passing under the fixed runner regex.
- **E1b** — 10 per-task solvers (consist/pack/counter): `solvers/v10-consist-001..003.mjs`,
  `v10-pack-001..003.mjs`, `v10-counter-001..004.mjs` + shared `solvers/lib/v10-util.mjs`.
  All hand-verified; self-checking solvers (dual algorithms, FATAL on mismatch).
- **E2** — F4 generalization: `solvers/v10-f4-001..006.mjs` + `solvers/lib/v10-f4-core.mjs`.
  The adopted joint-validation discipline transferred with adaptation: v10 F4 items are
  heterogeneous (rate sheets, ledgers, scale tickets) with no stated subtotal, so the
  mechanism generalized from "power set vs stated subtotal" to corroboration/contradiction
  evidence sets; fail-loud-on-inconclusive preserved (spot-checked with mutated bogus
  variants → REJECT/FATAL as appropriate). **6/6 correct.** Feeds the v1.9 §16 sub-case.
- **E3** — `solvers/solve-critique.mjs` (3 v10 sub-formats: flawed-step localization,
  fallacy-name choice, verse signals), `solvers/solve-strategy.mjs` (v10 paradigm
  taxonomy divide-and-conquer|brute-force|greedy|dynamic-programming replacing §13
  tags). 0 HEURISTIC_FAIL; all 6 heuristic answers matched builder ground truth.
- **E4** — `solvers/v10-distr-001..003.mjs`: memo-filter, superseded-value filter,
  explicitly-wrong-total filter. **3/3 correct.**
- **E5** — blind adjudication of 5 baseline misses: arith-003 = ROUNDING_DISPUTE
  (prompt silent on intra-month rounding; bank holds exact-arithmetic USD 3783.15,
  solver did monthly half-up USD 3783.17 — needs bank-maintainer ruling, not a code
  defect); elide-004 = SOLVER_BUG fixed (weekend exclusion), now correct; strat-001..003
  = wrong classifier vocabulary at baseline, fixed by E3.
- **E6** — blind adjudication of the 8 route/select misses (category-clustered).
  **Zero solver bugs**: 3 independent implementations (E1a's Python, E6's, the runtime)
  agree on all 8. **2 BANK_BUG** — route-004 (builder stores `12:A-B-D-F`, which visits
  neither C nor E, violating the must-visit constraints; solver's `TIME:A-C-D-E-F`
  is correct) and select-001 (builder maximizes the name tuple = lex-largest, but the
  prompt's tie-break is lexicographically smallest; one-char-class fix). **6
  TIE_BREAK_DISPUTE** — prompts say word prefix ("Output ONLY like 'DISTANCE:A-B-D-E-F'")
  but builders emit numeric (`14:...`) with exact-match scoring; elide-003's numeric
  prompt example is the precedent for resolving. All routed to the bank maintainer;
  bank not fixed in place. Report: `adjudication-e6.md`.

Infrastructure note: 23 `TASK_FORMAT_OVERRIDE` entries added to `run-v10.mjs` (E1a 12 +
E1b 6 + E3 5) because stale v8/v9 category templates in `make-task.mjs` reject correct
v10 answers. This is the third occurrence of the pattern (v8, v9, v10) — a
template-per-category default that contradicts bank-specified formats; candidate for
the runtime's next design pass (format registry derived from the bank, not templates).

Architecture test suite after solver changes: 7/8 (t06 calibration drift still fails —
same pre-existing signal as this morning's run, `supported` 133/133 = 100% vs 80–95%
band; no pass-to-fail transition, no regression).

Bank-maintainer queue (v10): (a) route-004 builder must-visit fix; (b) select-001
tie-break direction fix; (c) word-vs-numeric prefix convention for the 8 route/select
prompts; (d) arith-003 intra-month rounding ruling. Regenerate + reseal after fixes.

Zero spend. No emergence observed.

## v10 Bank Repair (Oct 6, 2026) — all 4 adjudicated items fixed at the generator root

Blind adjudication (E5/E6) concluded: 2 BANK_BUG, 6 TIE_BREAK_DISPUTE
(word-vs-numeric prefix), 1 ROUNDING_DISPUTE — zero solver bugs on the 8
route/select misses. Bank-maintainer repair, validated per the v9 repair protocol:
fix generators → regenerate deterministically from benchmark-v10-seed.json →
diff → new sealed release → re-run → test suite.

**Generator fixes** (`reasoning-benchmark-v10/builders-v10-core.py`,
`builders-v10-pack-consist.py`):
- (a) route-004: `solve4` now enforces the must-visit constraints (C and E must
  appear in the path, E after C). The old builder recorded arrival at F without
  checking the visits, admitting the invalid `12:A-B-D-F`. New key:
  `TIME:A-C-D-E-F` (arrival 14, matches E6's independent brute force + lower-bound proof).
- (b) select-001: tie-break direction fixed to lexicographically SMALLEST sorted
  name list per the prompt (was maximizing = lex-largest). New key:
  `VALUE:Beta,Delta,Epsilon,Eta,Iota,Lambda,Nu,Theta`.
- (c) The prompt is the contract: builders now emit the word-prefix form the
  prompts demand — DISTANCE:/MAXLEG:/TIME: (route-001..004), VALUE:/TOTAL:/
  RETURN:/PRICE: (select-001..004), VALUE: (pack-003, the one extra task with the
  same mismatch). Canonical tie-break for equal optima with no prompt tie-break
  = lexicographically smallest path, documented as DESIGN.md principles 6–7.
  route-001's two dist-14 optima resolve to A-B-D-E-F via explicit enumeration.
- (d) arith-003: prompt now specifies the rounding rule (no intermediate
  rounding; full exact precision; round only the final balance half-up to
  cents), disambiguating toward the bank's held value USD 3783.15.

**Diff verification**: vs the previous generation, ONLY the 10 intended items
changed — 9 answers (route-001..004, select-001..004, pack-003) + the arith-003
prompt. All other 40 tasks byte-identical; labels-v10.json byte-identical.

**Solver-side updates** (prompt-contract conformance, not bug fixes): 
`solvers/v10-arith-003.mjs` rewritten to exact BigInt-rational arithmetic with
half-up rounding only at the end, and it FATALS unless the prompt states the
exact-arithmetic rule (mode-17); `solvers/v10-pack-003.mjs` now emits the
`VALUE:` prefix; `run-v10.mjs` pack-003 format override updated to match.

**New sealed release**: `ari-evidence-tools/releases/bank-v10-repaired.envelope.json`
(+ `.seal-payload.json`), superseding the original v10 seal. SHA-256 of the
repaired bank (benchmark-v10.json):
`ca1a03a9c92477b3c18a0c22f729b5653d77fad93621f0c6eb778b2906e7bd7f`.

**Re-run**: affected 10 tasks 10/10; full bank **50/50, 0 blocks, 0 skips**
(results: `runs/v10-repair-full-rerun.json`, answers excluded for blindness).
Architecture test suite after repair: 7/8 (t06 calibration drift still fails —
same pre-existing signal, no pass-to-fail transition).

Zero spend. No emergence observed.

## Mode-19 exec-check integrated (Oct 6, 2026)

The §19 output-deception trial's ADOPT (scoped) verdict is now production:
- `exec-check.mjs` promoted from `trial-outdecept/` to the runtime root, hardened:
  multi-token via-list extraction, `--independent-log` production mode (builds the
  `{tools, checkers}` execution log from `independent-log.jsonl`), 11/11 selftests.
  Trial prototype left untouched in `trial-outdecept/`; tokenizer-sharing with
  crosscheck.mjs deferred (would require touching sealed `../logic-tools/`).
- `pipeline.mjs` runs it as a pre-seal gate after the label stage (complete record
  incl. label.json), fail-or-acknowledge via `task.verify.acknowledge`.
- Validation: trial probes 10/10 recall, 0/10 FP (hardened checker, unchanged);
  64/64 real bank run dirs CLEAN (3 trial-fixture dirs correctly flagged:
  2 empty-verification demos, 1 red-team phantom-tool fixture — not bank runs).
- Pass³ COMPLETE (2026-10-06): 3 independent full runs on the repaired v10 bank,
  all 50/50 PASS, 0 blocks, 0 skips (`runs/v10-pass3-run{1,2,3}.json`). The new
  exec-check pre-seal gate ran across all 50 tasks ×3 with 0 gate interventions.

Zero spend. No emergence observed.

## F4 correction-probe trial (Oct 6, 2026) — ADOPT

Closes the F4 "new bank items" trial requirement in ARCHITECTURE-FINDINGS.md.
Trial: `trials/f4-correction-probes/` (report: `trial-f4-correction-probes.md`).
16-item probe bank (bogus/valid/double/control correction memos), baseline arm
(applies all corrections unconditionally — the v8-distract-002 failure model)
vs disciplined arm (joint power-set validation against the stated subtotal).
Result: baseline 8/16 (0/8 on items with bogus corrections — failure reproduces),
disciplined 16/16, cost parity. Mid-trial finding: correction validation must be
JOINT over all memos, not per-memo (independent validation fails compositional
double-memo items). Proposed v1.9 spec text (§16 sub-case) drafted in the report;
sealed v1.8 spec NOT modified.

## Mode-18 dual scoring (Oct 6, 2026)

The canonical tie-breaking adoption (trial-mode18) created a scoring
inconsistency on v9-counter-003: the canonicalized solver emits a different
valid optimum than the bank key (102 optimal quintuples; key = lex-smallest).
Resolution: validity+objective dual scoring in `run-bank.mjs` (`DUAL_SCORE_IDS`,
`dualScoreCounter003`, `msWith2Machine` — independent re-verification from
prompt data only; key's structural content never consulted). Focused re-run:
5/5 counter tasks PASS; 003 scored validity+objective. Sealed bank untouched.
Report: `../architectures/literature/trial-mode18-2026-10-06.md` (follow-up 2).

## Span-gate FP fixed (Oct 6, 2026)

The §19 IC1 span-check gate (integrated into `pipeline.mjs` 2026-10-06 08:32)
false-positived on `split("/")` delimiters in solve-select-v9.mjs:396,
solve-sched-v9.mjs:608, solve-pack-v9.mjs:378 (bare `"/"` literal scanned as an
out-of-scope path read, severe → 17/50 gate blocks on the first post-repair2
full run). Fixed in `span-check.mjs` (skip bare `"/"`; selftests 5/5). The gate
also correctly caught a dead `process.env.SCHEDV9_NOTBPRUNE` debug toggle in
solve-sched-v9.mjs (severe RUNTIME-INTERNALS-STATIC) — removed, pruned path
unconditional, outputs unchanged. Full-bank re-run 2:
`runs/v9-full-dualscore2-20261006.json`.
Lesson in `../architectures/observations.md`: new gates need FP testing against
the real solver corpus, not just the trial corpus.

## Mode 18 follow-up 1 audit (Oct 6, 2026) — COMPLETE, no action warranted

Audited select/pack/route/counter solvers for index-based or name-based
tie-breaks. Findings:
- Every name-based tie-break in the v9 solvers is PROMPT-MANDATED: all 6 select
  tasks ("lexicographically smallest sorted name list"), all 4 pack tasks
  (lex-sorted placement/name lists), route tasks (attribute chains ending in
  lex node sequence), counter-001 ("lexicographically smallest sorted removal
  list"). The prompt is the contract — WL-canonical tie-breaks would violate it.
- No index-based (input-position-dependent) tie-breaks remain; the one known
  case (counter listScheduleA ready-queue) was fixed in the mode18 trial.
- The 2 remaining SET_SAME input-equivalence divergences (select-001, counter-001
  under rename) are probe-harness serialization artifacts: outputs are sorted in
  the solver's parse space and inverse-mapped without re-sort; the SELECTED SETS
  were identical in both cases, and each renamed run followed its own
  (renamed) prompt's lex contract.
- Genuine non-canonical-selection cases (prompt silent on tie-break: counter-002/003,
  sched-002) are already WL-canonicalized. The structural recommendation
  (validity+objective scoring over exact match) is bank-design, not solver work;
  v10 already moved this way (any-optimum scoring on mult-004/005).

Zero spend. No emergence observed.
