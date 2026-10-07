# Logic Architecture

A continuously-tested reasoning discipline for AI systems: formal logic, algorithmic problem-solving, grounded verification, and calibrated uncertainty — implemented as executable pipeline code, not just prose.

## What's here

- **`spec/`** — The Logic Architecture specifications (sealed). v1.10 is current: adds Mode 21 (verdict-preserving unfaithfulness) with the T1/T2/T3 detection battery, and the dropped-claims audit log as Mode 17's third detection leg — 21 failure modes total. v1.9 and v1.8 retained for reference.
- **`releases/`** — Signed release envelopes (SHA-256 + Ed25519) for v1.8, v1.9, and v1.10.
- **`runtime/`** — The reasoning runtime: an executable pipeline (`pipeline.mjs`) that runs deterministic solvers through independent trace recording, multi-checker verification gates, reconciliation, and sealed evidence output.
  - `solvers/` — Deterministic task solvers (selection, routing, scheduling, packing, counterfactual, arithmetic, critique, strategy classification).
  - `checkers/` — Independent verification checkers (elision detection, bound checks, tie-break validation, trace oracle, span checks, execution verification).
- **`tests/`** — Standing architecture test suite: 10+ tests covering every known failure-mode family, with regression tracking.

## Key ideas

- **Independent execution records**: the tools log is written from the runner's actual exec calls, never from the solver's self-report. Reconciliation discrepancies block sealing.
- **Fail loudly**: solvers that can't parse a requirement FATAL instead of silently dropping it.
- **Calibrated uncertainty**: every claim carries a label (`verified` / `supported` / `plausible` / `unknown`) with tracked hit-rate bands.
- **Literature-driven**: candidates come from continuous literature intake; nothing is adopted without an empirical trial (§19 gate).

## Status

v1.10 is sealed and accepted (v1.9 and v1.8 retained for reference). The runtime passes its standing test suite continuously. This is research code — shared for the ideas, not as a production library.

No API keys, credentials, or personal data are in this repo.
