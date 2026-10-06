# Architecture Tests — continuous test suite for the Logic Architecture

David's directive (2026-10-05): the current Logic Architecture (v1.8) stays under
**constant automated test** — a standing suite that runs on a schedule and probes
every known failure mode, plus new ones as they're discovered.

## What it tests

| Test | Failure mode | What it checks |
|------|--------------|----------------|
| t01 | Mode 17 — requirement elision | Frozen elision checker over the 16-task F1 bank: recall ≥3/8 on planted drops, false blocks ≤1/8 on controls |
| t02 | Mode 18 candidate — non-canonical optimum selection | Replays input-equivalence trial: no variant may ever produce a *wrong* answer; reorder divergence ≤ trial baseline (1/20) |
| t03 | Mode 14 — serialization-order mismatch | tiebreak-check.mjs must catch a string-serialization comparator and clear a tuple comparator |
| t04 | Mode 16 — inverted bound pruning | bound-check.mjs must flag the v5 inverted-prune pattern and clear a correct prune |
| t05 | Mode 15 — correlated verification | verifier-comb.mjs must mark shared-implementation plans WEAK and independent plans COVERED |
| t06 | Mode 8 — calibration drift | calibrate.mjs over the live log: any label with n≥20 out of band = FAIL (recalibration due per §8.3) |
| t07 | Modes 3/7 — verification-shaped prose / uncertainty smoothing | lint-claims.mjs must stay clean on a good sample and flag a dirty one |
| t08 | Mode 17 (procedural) — fail-loud | A solver given an unparseable requirement must FATAL, never guess |
| t09 | §17 — abstention discipline (HERA, ADOPT 2026-10-06) | Runs the frozen 20-item HERA pair bank (10 feasible + 10 infeasible, controlled environment mutations + machine-checked certificates) through the production pipeline: Act 10/10, Abstain 10/10, Pair 10/10; virtue gap (U−P) tripwire > 0. t09-prefixed task IDs isolate run dirs, which are removed after scoring |
| t10 | Mode 18 — overclaiming (MA3 OverclaimBench, ADOPT 2026-10-06) | Frozen transcript-coverage probes on synthetic run dirs with real hash-chained independent logs: control must reconcile CLEAN; planted phantom-tool, phantom-checker, output-mismatch, and false-all-pass claims must all be flagged DISCREPANCY; DTC-probe abstention stays exempt |

Notes:
- t01 tracks the *rejected* mechanical elision gate for regression — the gate itself
  stays non-mandatory per the §19 trial. The suite watches the checker, not the pipeline.
- t06 is expected to FAIL right now: `supported` sits at 133/133 (100%) against its
  80–95% band with n≥20 — genuine calibration drift the suite surfaced. That is the
  suite working, not the suite broken. Recalibration is a spec-level decision (§8.3).

## Running

```
node run-suite.mjs          # human-readable report, exit 1 on any failure
node run-suite.mjs --json   # machine-readable report
```

Each run writes `history/run-<timestamp>.json`. The runner diffs against the previous
run and flags **REGRESSION** (pass→fail) and **fixed** (fail→pass) inline.

## Adding a test

When a new failure mode is discovered (or a candidate like mode 18 is accepted):

1. Create `suite/tNN-<slug>.mjs` exporting `async function run()`.
2. Return `{id, mode, name, pass, detail, metrics, severity}` — use `result()` from `suite/util.mjs`.
3. Keep it fast (<60s) and deterministic: prefer replaying recorded artifacts
   (trial JSONs, frozen banks) over re-running solvers. Never open answer keys
   during solving; scoring-only access after.
4. Add a row to the table above.

## Scheduling

Intended to run on the hourly project check-in (or its own cron). Zero spend:
every test uses local checkers and recorded artifacts — no model calls.
