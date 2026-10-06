#!/usr/bin/env node
// recoverability-gate.mjs — JA2 (Self-Step Rejection) behavioral gate, production adjudication tool.
//
// ADOPTED (narrowly) 2026-10-06: the recoverability-gate mechanism is a §15
// step-verification technique for the ADJUDICATION WORKFLOW, not a per-run
// pipeline gate. When a solver miss is adjudicated, run this gate to localize
// the faulty step automatically.
//
// Mechanism: for each step-prefix P_k of a generator trace, estimate
// recoverability = P(completion from P_k is correct), where "correct" = exact
// match with the trace's own clean answer (runner-verified PASS; blind string
// comparison). Completions = generator re-runs from the prefix with --seed
// shuffles (R=1 suffices for deterministic generators; validated by ablation).
//
// Gate rule: barrier = r_0 - delta (delta=0.5); accept r_k >= 0.8;
// reject r_k <= 0.5. First RESOLVED crossing (no later recovery to >= 0.8)
// → that step rejected. The faulty step is firstCrossing - 1.
//
// Validated: 40/40 detection recall, 40/40 exact-step localization, 0/20 false
// positives on v9 tasks; caught 12/12 feasible-but-wrong errors invisible to
// self-verify; localized the real historic v9-select-002 mode-17 bug.
//
// STEP-EMITTING GENERATOR INTERFACE (the --gen script must support):
//   --prompt <file>        read task prompt
//   --emit-steps           print JSON {steps:[{i,name,label,state|stateB64}], answer}
//   --prefix-file <file>   v8-serialized {k, state}: skip stages 0..k-1, resume
//   --seed <n>             seeded RNG for semantics-preserving input shuffles
//   (default)              print exactly one answer line to stdout
// The trial's reference generators live in trial-self-step-rejection/gen/.
//
// Usage:
//   node recoverability-gate.mjs --gen <gen.mjs> --prompt <prompt.txt>
//       [--ref-answer <answer>] [--seeds 1] [--delta 0.5]
//       --out <results.json> [--trace-out <trace.json>]
// Prints a one-line summary; writes full results JSON including firstCrossing
// (the rejected step index, -1 if none) and per-step recoverability.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { serialize, deserialize } from "v8";
import { tmpdir } from "node:os";
import { join } from "node:path";

function parseCli(argv) {
  // Default R=1: the ablation (trial §4.6/§6) validated full signal retention
  // (12/12 detected, 12/12 localized, 0 FP) at ~7x cost vs 31x for R=5.
  const o = { seeds: 1, delta: 0.5, corrupt: "none" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--gen") o.gen = argv[++i];
    else if (argv[i] === "--prompt") o.prompt = argv[++i];
    else if (argv[i] === "--corrupt") o.corrupt = argv[++i];
    else if (argv[i] === "--seeds") o.seeds = parseInt(argv[++i], 10);
    else if (argv[i] === "--delta") o.delta = parseFloat(argv[++i]);
    else if (argv[i] === "--out") o.out = argv[++i];
    else if (argv[i] === "--trace-out") o.traceOut = argv[++i];
    else if (argv[i] === "--ref-answer") o.refAnswer = argv[++i];
    else { console.error(`unknown arg ${argv[i]}`); process.exit(2); }
  }
  if (!o.gen || !o.prompt || !o.out) { console.error("need --gen --prompt --out"); process.exit(2); }
  return o;
}

const run = (cmd) => {
  try {
    return { ok: true, out: execSync(cmd, { encoding: "utf8", timeout: 300000, stdio: ["ignore", "pipe", "pipe"] }).trim().split("\n").pop() };
  } catch (e) {
    return { ok: false, out: "" };
  }
};

function getState(step) {
  if (step.state !== undefined) return step.state;
  if (step.stateB64) return deserialize(Buffer.from(step.stateB64, "base64"));
  throw new Error("step has no state");
}

function main() {
  const o = parseCli(process.argv.slice(2));
  const t0 = Date.now();
  let invocations = 0;

  // 1. Generate the trace (possibly corrupted).
  const corruptFlag = o.corrupt === "none" ? "" : ` --corrupt ${o.corrupt}`;
  const traceRaw = run(`node ${o.gen} --prompt ${o.prompt} --emit-steps${corruptFlag} 2>/dev/null`);
  invocations++;
  if (!traceRaw.ok) {
    const res = { error: "trace generation crashed", invocations };
    writeFileSync(o.out, JSON.stringify(res, null, 1));
    console.log(`CRASH trace-gen`);
    return;
  }
  const trace = JSON.parse(traceRaw.out);
  if (o.traceOut) writeFileSync(o.traceOut, JSON.stringify(trace, null, 1));
  const N = trace.steps.length;
  // Reference = the generator's CLEAN answer (runner-verified PASS), passed in
  // for corrupted traces; defaults to the trace's own answer for clean traces.
  const refAnswer = o.refAnswer || trace.answer;

  // 2. For each prefix k=0..N, run R completions.
  const r = [];
  const completions = [];
  for (let k = 0; k <= N; k++) {
    let correct = 0;
    const compAnswers = [];
    for (let s = 1; s <= o.seeds; s++) {
      let cmd;
      if (k === 0) {
        cmd = `node ${o.gen} --prompt ${o.prompt} --seed ${s} 2>/dev/null`;
      } else {
        const st = getState(trace.steps[k - 1]);
        const pfxPath = join(tmpdir(), `ja2pfx-${process.pid}-${k}-${s}.bin`);
        writeFileSync(pfxPath, serialize({ k, state: st }));
        cmd = `node ${o.gen} --prompt ${o.prompt} --prefix-file ${pfxPath} --seed ${s} 2>/dev/null`;
      }
      const res = run(cmd);
      invocations++;
      const good = res.ok && res.out === refAnswer;
      if (good) correct++;
      compAnswers.push(res.ok ? res.out.slice(0, 60) : "CRASH");
    }
    r.push(correct / o.seeds);
    completions.push(compAnswers);
  }

  // 3. Barrier + decisions.
  const r0 = r[0];
  const capable = r0 >= 0.8;
  const barrier = r0 - o.delta;
  const acceptThr = 0.8, rejectThr = 0.5;
  const decisions = [];
  for (let k = 1; k <= N; k++) {
    if (r[k] >= acceptThr) decisions.push("accept");
    else if (r[k] <= rejectThr) decisions.push("reject");
    else decisions.push("unresolved");
  }
  // First RESOLVED crossing: first k with r_k <= rejectThr and no later recovery to >= acceptThr.
  let firstCrossing = -1;
  for (let k = 1; k <= N; k++) {
    if (r[k] <= rejectThr) {
      let recovers = false;
      for (let j = k + 1; j <= N; j++) if (r[j] >= acceptThr) { recovers = true; break; }
      if (!recovers) { firstCrossing = k; break; }
    }
  }

  const res = {
    gen: o.gen, prompt: o.prompt, corrupt: o.corrupt,
    seeds: o.seeds, delta: o.delta,
    nSteps: N,
    stepNames: trace.steps.map((s) => s.name),
    stepLabels: trace.steps.map((s) => s.label),
    recoverability: r,
    r0, capable, barrier,
    decisions, firstCrossing,
    refAnswer,
    traceAnswer: trace.answer,
    traceAnswerOk: trace.answer === refAnswer,
    invocations,
    wallMs: Date.now() - t0,
  };
  writeFileSync(o.out, JSON.stringify(res, null, 1));
  console.log(`r=[${r.map((x) => x.toFixed(2)).join(",")}] barrier=${barrier.toFixed(2)} firstCrossing=${firstCrossing} decisions=[${decisions.join(",")}] inv=${invocations} ${Date.now() - t0}ms`);
}

main();
