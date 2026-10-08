# Logic Architecture

A continuously-tested reasoning discipline for AI systems: formal logic, algorithmic problem-solving, grounded verification, and calibrated uncertainty — implemented as executable pipeline code, not just prose.

## What's here

- **`spec/`** — The Logic Architecture specifications (sealed). v1.11 is current: integrates eleven §19 trial outcomes — two new subsections (§15 adjudicator independence: conformity guard and verifier-pool diversity requirement; §17.5 gate independence: standing canary gate and mutation-audit hardening), Mode 21 extractor extensions (14-shape constraint taxonomy, ordinal-selection bindings), and Mode 17 dropped-claims audit instrumentation extended to five solvers. v1.10, v1.9 and v1.8 retained for reference.
- **`releases/`** — Signed release envelopes (SHA-256 + Ed25519) for v1.8, v1.9, v1.10, and v1.11.
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

v1.11 is sealed and accepted (v1.10, v1.9 and v1.8 retained for reference). The runtime passes its standing test suite continuously. This is research code — shared for the ideas, not as a production library.

No API keys, credentials, or personal data are in this repo.
