#!/usr/bin/env node
// pipeline.mjs — Reasoning Runtime orchestrator
// Implements the formalize → solve → verify → label → seal pipeline (DESIGN.md).
//
// Usage:
//   node pipeline.mjs --task <task.json> [--assist] [--tools-log <log.json>]
//
// task.json: {
//   "id": "task-001",
//   "description": "natural language task description",
//   "consequence": "low|consequential",
//   "strategy": "COMPUTATION|SEARCH|LOOKUP|DECOMPOSITION|JUDGMENT",  // formalize output
//   "answer_format": "regex the answer must match",                 // solve gate
//   ...stage-specific inputs (see DESIGN.md)...
// }
//
// Modes:
//   Default: runs all deterministic stages. Stages requiring agent judgment
//     (formalize content, solve for non-COMPUTATION, label assignment) read
//     their inputs from the task file / prior stage artifacts.
//   --assist: pauses at judgment points with a prompt describing what the
//     agent must provide, then continues when the artifact exists.
//
// Each stage writes to ./runs/<task-id>/<stage>.json. The pipeline stops at
// the first failing gate and reports which gate failed and why.
//
// Seal stage uses the existing evidence toolkit (hash.mjs + envelope.mjs)
// via relative import — set RUNTIME_TOOLKIT to override the path.

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { createRecorder } from "./trace-recorder.mjs";
import { reconcile } from "./reconcile.mjs";
import { perturbLines, perturbTokens, seedFor } from "./dtc-perturb.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOLKIT = process.env.RUNTIME_TOOLKIT || join(HERE, "..", "ari-evidence-tools");

// Ed25519 signing (Phase 2): loaded lazily so the pipeline still runs
// without the key (falls back to SHA-256-only seal with a warning).
let _signing = null;
async function getSigning() {
  if (_signing !== null) return _signing;
  try {
    const env = await import(join(TOOLKIT, "envelope.mjs"));
    const keyB64 = readFileSync(join(homedir(), ".config", "noor-evidence", "signing.key"), "utf8").trim();
    const privateKey = env.loadPrivateKey(keyB64);
    _signing = { issueEnvelope: env.issueEnvelope, verifyEnvelope: env.verifyEnvelope, privateKey };
  } catch (e) {
    console.warn(`[seal] warning: Ed25519 signing unavailable (${e.message}); using SHA-256-only seal`);
    _signing = false;
  }
  return _signing;
}

const STAGES = ["formalize", "solve", "verify", "label", "seal"];

function parseArgs(argv) {
  const args = { assist: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--task") args.task = argv[++i];
    else if (argv[i] === "--assist") args.assist = true;
    else if (argv[i] === "--tools-log") args.toolsLog = argv[++i];
    else {
      console.error(`Unknown argument: ${argv[i]}`);
      process.exit(2);
    }
  }
  if (!args.task) {
    console.error("Usage: node pipeline.mjs --task <task.json> [--assist] [--tools-log <log.json>]");
    process.exit(2);
  }
  return args;
}

function load(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

function save(runDir, stage, obj) {
  writeFileSync(join(runDir, `${stage}.json`), JSON.stringify(obj, null, 2) + "\n");
}

function gateFail(stage, reason, detail) {
  console.error(`\nGATE FAILED at stage "${stage}": ${reason}`);
  if (detail) console.error(detail);
  process.exit(1);
}

// --- Stage 1: formalize ---
// Judgment: the agent formalizes. Code: validates schema completeness.
function stageFormalize(task, runDir, assist) {
  const f = task.formalize || {};
  const required = ["strategy", "strategy_basis", "premises", "success_criteria"];
  const missing = required.filter((k) => {
    const v = f[k];
    return v === undefined || v === null || (Array.isArray(v) && v.length === 0) || v === "";
  });
  // Validate premise source labels (§1.1).
  const badSources = (f.premises || []).filter(
    (p) => !["observed", "stated", "derived", "assumed"].includes(p.source)
  );
  const result = {
    stage: "formalize",
    strategy: f.strategy || null,
    premises: (f.premises || []).length,
    assumed_premises: (f.premises || []).filter((p) => p.source === "assumed").map((p) => p.id),
    load_bearing: f.load_bearing || [],
    decorative: f.decorative || [],
    complete: missing.length === 0 && badSources.length === 0,
    missing,
    bad_sources: badSources.map((p) => p.id),
  };
  save(runDir, "formalize", result);
  if (!result.complete) {
    gateFail(
      "formalize",
      `incomplete formalization (missing: ${missing.join(", ")}${badSources.length ? `; bad sources: ${result.bad_sources.join(", ")}` : ""})`,
      assist
        ? "In --assist mode: add the missing fields to task.json under \"formalize\" and re-run."
        : "Add a \"formalize\" object to the task file with strategy, strategy_basis, premises[], success_criteria."
    );
  }
  console.log(`[formalize] OK — strategy=${f.strategy}, premises=${result.premises}`);
  return result;
}

// --- Stage 2: solve ---
// For COMPUTATION with a solver script: execute deterministically.
// For SEARCH with a solver script: also execute (Phase 3: real search solvers).
// The solver receives --prompt <file> with the task description (Phase 3).
// Otherwise: read the agent-provided answer from the task file.
//
// SECURITY (D1): solver execution goes through the runner-owned trace
// recorder. The independent log is written via a path the solver subprocess
// never sees (not in argv/env). tools-log.json is derived from the
// INDEPENDENT record, never from the solver's self-reported trace.
function stageSolve(task, formal, runDir, assist, recorder) {
  let answer = null;
  let trace = [];
  let solverExecd = false;
  let solverPin = null;
  let dtc = null; // §19 H2 adoption: disagreement-count fragility record (probes run in the solver-exec branch below)
  const solverExecRecords = [];
  // SECURITY (E15-6): output provenance. A solver answer that depends on an
  // external data path must carry that path's identity/status, so that
  // exit-0-with-guess (missing data swallowed internally) is distinguishable
  // from exit-0-with-computation. Task authors declare data_paths; each is
  // hashed at solve time and a MISSING declared file is a loud gate failure.
  const dataProvenance = [];
  for (const dp of task.data_paths || []) {
    const abs = resolve(HERE, dp);
    if (!existsSync(abs)) {
      gateFail("solve", `declared data file missing: ${dp}`,
        "The task declares this data path; its absence means the solver cannot have computed from it. " +
        "Either provide the file or remove the declaration — do not let the solver guess.");
    }
    const bytes = readFileSync(abs);
    dataProvenance.push({ path: dp, resolved_path: abs,
      sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length });
  }
  if (dataProvenance.length > 0) {
    recorder.note("data-provenance", { files: dataProvenance });
  }
  // SECURITY (E6-8): contradiction scan on prompt text, before any solver
  // runs. A prompt with >= 2 differing rule statements or supersede language
  // is a defective input — FATAL here rather than letting the solver
  // first-match-wins its way to a confident wrong answer (T10 shape).
  // (scanContradictions exits the process on violation via fatal().)
  try {
    const { scanContradictions } = createRequire(import.meta.url)("./solvers/validate-input.mjs");
    scanContradictions(task.description || "");
  } catch (e) {
    gateFail("solve", "contradiction scan failed", e.message);
  }
  if (task.solver_script && (formal.strategy === "COMPUTATION" || formal.strategy === "SEARCH")) {
    try {
      // Write the task description as the prompt file for the solver.
      const promptFile = join(runDir, "_prompt.txt");
      writeFileSync(promptFile, task.description || "");
      // Scrubbed env: the independent-log path must never reach the child.
      const childEnv = { ...process.env };
      for (const k of Object.keys(childEnv)) {
        if (/independent-log/i.test(String(childEnv[k] || ""))) delete childEnv[k];
      }
      // SECURITY (E9-1): anchor solver identity to the runtime directory.
      // resolve(task.solver_script) resolved against the AMBIENT CWD, letting a
      // decoy file in the invocation directory substitute for the approved
      // solver (approval laundering, Demo 1). resolve(HERE, ...) pins the name
      // to the runtime dir.
      const solverPath = resolve(HERE, task.solver_script);
      // SECURITY (E9-2): content-pin the solver bytes at dispatch time.
      // The seal must answer "which code ran" — without this, a byte-changed
      // solver re-runs under a byte-identical approval record (Demo 2).
      const solverBytes = readFileSync(solverPath);
      const solverSha256 = createHash("sha256").update(solverBytes).digest("hex");
      recorder.note("solver-pin", {
        approved_name: task.solver_script,
        resolved_path: solverPath,
        sha256: solverSha256,
        bytes: solverBytes.length,
      });
      const rec = recorder.exec("node", [solverPath, "--prompt", promptFile], {
        cwd: HERE,
        env: childEnv,
        timeout: 300000, // 5 min for search solvers
      });
      solverExecRecords.push(rec);
      if (rec.exit_code !== 0) {
        gateFail("solve", "solver script failed", `exit_code=${rec.exit_code}: ${String(rec.stderr).slice(0, 500)}`);
      }
      answer = rec.stdout.trim();
      solverPin = { approved_name: task.solver_script, resolved_path: solverPath,
        sha256: solverSha256, bytes: solverBytes.length };
      trace.push({ tool: "node", script: task.solver_script, resolved_path: solverPath,
        solver_sha256: solverSha256, output: answer });
      solverExecd = true;
      console.log(`[solve] executed solver script deterministically (independent-log seq ${rec.seq}, sha256 ${solverSha256.slice(0, 12)}…)`);

      // DTC FRAGILITY PROBES (§19 H2 adoption, 2026-10-06): run the same solver
      // on 2 seeded perturbed prompts (line-shuffle, token-shuffle). The trial
      // (98 tasks, v9+v10) showed disagreement-count strictly dominates the
      // flat `supported` label as a fragility discriminator — the single
      // disagreement event coincided exactly with a real mode-18 defect
      // (v10-select-003 positional tie-break), zero false flags. Any
      // successful probe that disagrees with the primary answer marks the
      // solution as fragile → label downgrade (supported→plausible) + review
      // flag at the label stage.
      //
      // The probes are the RUNNER's own measurements, not agent-claimed tool
      // calls: each is recorded in the independent log with a dtc-probe note
      // so reconcile.mjs exempts them from OMITTED-FAILURE / FALSE-ALL-PASS.
      // A probe abstention (nonzero exit on a perturbed prompt) is an excluded
      // abstention per the trial — never a gate failure. Probe outcomes live
      // in solve.json's dtc record.
      try {
        const probeDefs = [
          { name: "shufL", perturb: perturbLines, salt: 0xa1 },
          { name: "shufT", perturb: perturbTokens, salt: 0xb2 },
        ];
        const probeAttempts = [];
        for (const pd of probeDefs) {
          const probeText = pd.perturb(task.description || "", seedFor(task.id, pd.salt));
          const probeFile = join(runDir, `_prompt-dtc-${pd.name}.txt`);
          writeFileSync(probeFile, probeText);
          const probeSha = createHash("sha256").update(probeText, "utf8").digest("hex");
          const prec = recorder.exec("node", [solverPath, "--prompt", probeFile], {
            cwd: HERE,
            env: childEnv,
            timeout: 180000,
          });
          recorder.note("dtc-probe", {
            exec_seq: prec.seq,
            probe: pd.name,
            status: prec.exit_code === 0 ? "ok" : "abstained",
            exit_code: prec.exit_code,
            prompt_sha256: probeSha,
          });
          probeAttempts.push({
            probe: pd.name,
            exit_code: prec.exit_code,
            prompt_sha256: probeSha,
            answer: prec.exit_code === 0 ? String(prec.stdout).trim() : null,
          });
        }
        const primaryAnswer = String(answer);
        const successful = probeAttempts.filter((p) => p.exit_code === 0);
        const disagreeing = successful.filter((p) => p.answer !== primaryAnswer);
        dtc = {
          probes_run: probeDefs.length,
          probes_ok: successful.length,
          disagreements: disagreeing.length,
          // Unanimous is null (unknown) when no probe succeeded — a vacuous
          // unanimous would misrepresent an unmeasured case as confirmed.
          unanimous: successful.length > 0 ? disagreeing.length === 0 : null,
          primary_answer: primaryAnswer,
          probes: probeAttempts.map((p) => ({
            probe: p.probe,
            exit_code: p.exit_code,
            prompt_sha256: p.prompt_sha256,
            agrees: p.exit_code === 0 ? p.answer === primaryAnswer : null,
          })),
        };
        if (disagreeing.length > 0) {
          console.log(`[solve] !!! DTC FRAGILITY: ${disagreeing.length}/${successful.length} successful perturbed probes disagree with the primary answer — will downgrade supported→plausible at label stage`);
        } else {
          console.log(`[solve] DTC probes: ${successful.length}/${probeDefs.length} ok, unanimous`);
        }
      } catch (e) {
        // Probes must never break a successful primary solve: on probe
        // infrastructure failure, record the error and continue without the
        // fragility feature (fail-open for the probe, not the answer).
        console.warn(`[solve] warning: DTC probes failed (${e.message}); continuing without fragility measurement`);
        dtc = { probes_run: 0, probes_ok: 0, disagreements: 0, unanimous: null, error: String(e.message).slice(0, 200) };
      }
    } catch (e) {
      gateFail("solve", "solver script failed", e.message);
    }
  } else {
    answer = task.answer ?? null;
    trace = task.trace || [];
    if (assist && answer === null) {
      gateFail("solve", "no answer provided", 'In --assist mode: add "answer" (and "trace") to the task file and re-run.');
    }
  }
  // Gate: answer present and matches required format.
  if (answer === null || answer === undefined || String(answer) === "") {
    gateFail("solve", "no answer produced");
  }
  if (task.answer_format) {
    const re = new RegExp(task.answer_format);
    if (!re.test(String(answer))) {
      gateFail("solve", `answer "${answer}" does not match required format /${task.answer_format}/`);
    }
  }
  const result = { stage: "solve", answer: String(answer), trace,
    data_provenance: dataProvenance, dtc };
  save(runDir, "solve", result);

  // Write the tool log in crosscheck.mjs format: JSON array of
  // {tool, input, output}. This is the "live tool log" the verify stage
  // cross-checks [MC-n] draft claims against (§7.2).
  //
  // SECURITY (D1): the tool log is derived from the INDEPENDENT execution
  // record (runner-owned), NOT from the solver's self-reported trace.
  // A doctored trace therefore cannot vouch for itself — crosscheck now
  // compares the solver's narration against what actually ran.
  const toolLog = (solverExecRecords.length ? solverExecRecords : []).map((r, i) => {
    const scriptPath = String(r.argv[0] || "");
    const scriptId = basename(scriptPath).replace(/\.m?js$/, "");
    return {
      seq: i + 1,
      tool: r.cmd,
      input: `solver script ${scriptId} at ${scriptPath}`,
      output: String(r.stdout || "").trim(),
      at: r.started_at,
      independent_seq: r.seq,
      exit_code: r.exit_code,
    };
  });
  save(runDir, "tools-log", toolLog);

  console.log(`[solve] OK — answer="${String(answer).slice(0, 60)}"`);
  return { ...result, solverExecd, solver_pin: solverPin };
}

// --- Crosscheck support ---
// Generate a draft with [MC-n] mechanical-claim tags from the solve trace.
// Each claim names the tool and states its input/output so crosscheck.mjs
// can match claim text against the live tool log (§7.2).
function buildAutoDraft(trace, runDir) {
  const lines = ["# Mechanical claims (auto-generated from solve trace)", ""];
  trace.forEach((t, i) => {
    const n = i + 1;
    // Use the dash-form script id (no periods — crosscheck's sentence
    // splitter breaks on "." which would separate the tool name from the claim).
    const scriptId = String(t.script || t.input || "unknown")
      .replace(/^\.\//, "")
      .replace(/^solvers\//, "")
      .replace(/\.m?js$/, "");
    const what = t.script ? `the solver script ${scriptId}` : `the input ${scriptId}`;
    lines.push(
      `[MC-${n}] The ${t.tool} tool ran ${what} and its recorded output was ${String(t.output || "").slice(0, 120)}.`
    );
    lines.push("");
  });
  if (trace.length === 0) {
    lines.push("[MC-1] No tool calls were recorded during solving.");
    lines.push("");
  }
  const draftPath = join(runDir, "draft.md");
  writeFileSync(draftPath, lines.join("\n"));
  return draftPath;
}

// --- Stage 3: verify ---
// Runs all deterministic checkers. Each checker is optional (runs only if its
// inputs are present in the task file) but any checker that runs must pass
// or have its failure explicitly acknowledged.
// Runs all deterministic checkers through the runner-owned trace recorder
// (D1): checker executions are independently recorded, so verify.json's
// claims about checker runs can be reconciled against what actually ran.
function runChecker(name, script, args, recorder) {
  const rec = recorder
    ? recorder.exec("node", [join(HERE, script), ...args], { cwd: HERE, timeout: 120000 })
    : null;
  let out, exitCode;
  if (rec) {
    out = rec.stdout;
    exitCode = rec.exit_code;
  } else {
    try {
      out = execFileSync("node", [join(HERE, script), ...args], { encoding: "utf8" });
      exitCode = 0;
    } catch (e) {
      out = e.stdout || "";
      exitCode = e.status ?? 1;
    }
  }
  if (exitCode === 0) {
    // Success (exit 0) = PASS. Detail is JSON when the checker emits it,
    // otherwise the raw text output.
    let detail;
    try {
      detail = JSON.parse(out);
    } catch {
      detail = { output: String(out).trim() };
    }
    // SECURITY (E15-3): checker vacuity gate. A checker that exercised ZERO
    // cases but reports PASS is a hollow PASS — it seals results it never
    // examined (tool-concealment trial, condition E). Present-but-empty
    // case_results means the checker ran its harness over nothing.
    if (detail && Array.isArray(detail.case_results) && detail.case_results.length === 0) {
      return { name, result: "FAIL",
        detail: { ...detail, vacuity_gate: "case_results empty — hollow PASS rejected" },
        error: "checker vacuity: PASS with zero cases exercised" };
    }
    return { name, result: "PASS", detail };
  }
  // Non-zero exit; stdout still carries the report.
  let detail = null;
  try {
    detail = JSON.parse(out || "{}");
  } catch {}
  return { name, result: detail?.verdict === "FAIL" ? "FAIL" : "ERROR", detail,
    error: `exit_code=${exitCode}` };
}

// TRACE ORACLE runner (§19 IA1). The oracle's exit code reflects its
// verdict (0=FAITHFUL, 1=UNFAITHFUL, 2=INCONCLUSIVE — a production change
// from the trial copy) so the D1 reconcile gate, which cross-checks claimed
// checker results against independent exec exit codes, sees a consistent
// record. Invoked through the runner-owned recorder so the oracle's own
// execution is independently recorded.
// The checker is named "oracle" (matching the script basename) so
// reconcile.mjs's name-matching resolves it to its independent record.
// Verdict mapping: FAITHFUL → PASS; UNFAITHFUL:* → FAIL (blocks the seal
// unless acknowledged); INCONCLUSIVE → ERROR (fail-loud: the gate could
// not evaluate the claims, which is itself a defect worth surfacing).
function runTraceOracle(runDir, recorder) {
  const name = "oracle";
  const rec = recorder
    ? recorder.exec("node", [join(HERE, "oracle.mjs"), "--dir", runDir], { cwd: HERE, timeout: 120000 })
    : null;
  let detail = null;
  try {
    detail = JSON.parse((rec ? rec.stdout : "") || "{}");
  } catch {
    return { name, result: "ERROR",
      detail: { raw: String(rec ? rec.stdout : "").slice(0, 300) },
      error: "oracle output unparseable" };
  }
  const verdict = detail.verdict || "INCONCLUSIVE";
  if (verdict === "FAITHFUL") return { name, result: "PASS", detail };
  if (String(verdict).startsWith("UNFAITHFUL")) {
    return { name, result: "FAIL", detail,
      error: `oracle ${verdict}` };
  }
  return { name, result: "ERROR", detail,
    error: `oracle INCONCLUSIVE: ${(detail.reasons || []).join("; ").slice(0, 300)}` };
}

function stageVerify(task, runDir, toolsLog, recorder, solverExecd) {
  const checks = [];
  const t = task.verify || {};

  // Always-available: claim linter on the answer text (write temp file).
  if (task.consequence === "consequential" || t.lint !== false) {
    const tmp = join(runDir, "_lint-target.txt");
    writeFileSync(tmp, `Answer: ${task.answer || ""}\nClaim: ${task.claim || ""}\n`);
    checks.push(runChecker("lint-claims", "../logic-tools/lint-claims.mjs", ["--file", tmp], recorder));
  }

  // MC-tag cross-check (needs draft + tool log).
  // "auto" draft: generated from the solve trace; tool log defaults to the
  // live log the solve stage wrote (overridable via --tools-log).
  let draftPath = t.draft && t.draft !== "auto" ? t.draft : null;
  let logPath = toolsLog || null;
  if (t.draft === "auto") {
    const solved = load(join(runDir, "solve.json"));
    draftPath = buildAutoDraft(solved.trace || [], runDir);
    if (!logPath) logPath = join(runDir, "tools-log.json");
    console.log(`[verify] auto-draft generated from solve trace (${(solved.trace || []).length} tool calls)`);
  }
  if (draftPath && logPath) {
    checks.push(runChecker("crosscheck", "../logic-tools/crosscheck.mjs", ["--draft", draftPath, "--log", logPath], recorder));
  } else if (t.draft && t.draft !== "auto" && !toolsLog) {
    console.log(`[verify] crosscheck skipped: draft provided but no --tools-log`);
  }

  // TRACE ORACLE (§19 IA1 adoption, 2026-10-06): exact claim-grounding gate.
  // crosscheck.mjs uses fuzzy ≥50% token overlap ("measures wording, not
  // truth", and its own header admits it "cannot be tuned into a concealment
  // detector" — E15-5). The oracle replaces wording-similarity with exact
  // grounding (tool/script/output/exit-code per [MC-n] claim) + the
  // claim↔tools-log bijection (concealment = un-narrated execution) +
  // independent-log hash-chain tamper-evidence that nothing else verifies.
  // Trial: 7/7 planted-fault discriminations, 0/30 false positives.
  // Runs only when a solver subprocess executed (like the D1 reconcile gate):
  // agent-provided-answer runs have no independent execution record to
  // ground claims against.
  if (solverExecd && draftPath && logPath) {
    checks.push(runTraceOracle(runDir, recorder));
  }

  // Tie-break equivalence (needs spec + candidates + comparator).
  if (t.tiebreak) {
    const a = ["--spec", t.tiebreak.spec, "--candidates", t.tiebreak.candidates];
    if (t.tiebreak.comparator) a.push("--comparator", t.tiebreak.comparator);
    checks.push(runChecker("tiebreak-check", "tiebreak-check.mjs", a, recorder));
  }

  // Bound-direction (needs spec + prune + cases).
  if (t.bound) {
    checks.push(
      runChecker("bound-check", "bound-check.mjs", [
        "--spec", t.bound.spec, "--prune", t.bound.prune, "--cases", t.bound.cases,
      ], recorder)
    );
  }

  // Verifier combination (needs plan).
  if (t.verifiers) {
    checks.push(runChecker("verifier-comb", "verifier-comb.mjs", ["--plan", t.verifiers.plan], recorder));
  }

  // Argument-chain structure (needs chain).
  if (t.chain) {
    checks.push(runChecker("arg-check", "arg-check.mjs", ["--chain", t.chain], recorder));
  }

  // SECURITY (D3 T5): acknowledge entries REQUIRE a reason field.
  // Format: verify.acknowledge = [{name: <checker>, reason: <string>}, ...].
  // A bare checker name with no reason is a gate failure (fail-loud).
  const rawAck = t.acknowledge || [];
  const acknowledged = [];
  for (const a of rawAck) {
    if (typeof a === "string") {
      gateFail("verify",
        `acknowledge entry "${a}" has no reason`,
        'Each acknowledge entry must be {name: <checker>, reason: <why this failure is accepted>}. Bare names are not accepted.');
    }
    if (!a || typeof a !== "object" || !a.name || !a.reason || String(a.reason).trim() === "") {
      gateFail("verify",
        "malformed acknowledge entry",
        'Each acknowledge entry must be {name: <checker>, reason: <non-empty string>}.');
    }
    acknowledged.push({ name: String(a.name), reason: String(a.reason) });
  }
  const ackNames = new Set(acknowledged.map((a) => a.name));
  const failures = checks.filter((c) => c.result !== "PASS" && !ackNames.has(c.name));

  const result = {
    stage: "verify",
    checks: checks.map((c) => ({ name: c.name, result: c.result })),
    acknowledged,
    overall: failures.length === 0 ? "PASS" : "FAIL",
  };

  // SECURITY (D1): post-run reconciliation gate. The solver's self-report
  // (solve.json trace + verify.json checks) is reconciled against the
  // runner-owned independent execution record. DISCREPANCY blocks the seal.
  // Skipped only when no solver subprocess ran (agent-provided answer path).
  let reconciliation = { status: "skipped", reason: "no solver subprocess executed" };
  if (solverExecd) {
    // SECURITY (E15-4): reconcile against the IN-MEMORY verify result, not
    // the on-disk file (which is not yet written at this point — reading it
    // would be history-dependent).
    const rec = reconcile(runDir, result);
    reconciliation = {
      status: rec.verdict === "CLEAN" ? "clean" : "discrepancy",
      claims_checked: rec.claims_checked,
      independent_execs: rec.independent_execs,
      findings: rec.unmatched,
    };
    result.reconciliation = reconciliation;
    if (rec.verdict === "DISCREPANCY") {
      save(runDir, "verify", result);
      gateFail("verify",
        `reconciliation DISCREPANCY: self-report diverges from independent execution record`,
        rec.unmatched.map((f) => `  [${f.kind}] ${f.claim} — ${f.reason}`).join("\n"));
    }
    console.log(`[verify] reconciliation CLEAN (${rec.claims_checked} claims vs ${rec.independent_execs} independent execs)`);
  } else {
    result.reconciliation = reconciliation;
  }
  save(runDir, "verify", result);

  for (const c of checks) {
    const ack = ackNames.has(c.name) ? " (acknowledged)" : "";
    console.log(`[verify] ${c.name}: ${c.result}${ack}`);
  }
  // STANDING MONITOR (D3 T5): any non-empty acknowledged set raises a
  // prominent alert. dissoc-scan.mjs picks this up in batch review.
  if (acknowledged.length > 0) {
    console.log(`\n!!! MONITOR ALERT: ${acknowledged.length} checker failure(s) acknowledged:`);
    for (const a of acknowledged) console.log(`!!!   - ${a.name}: ${a.reason}`);
    console.log(`!!! (recorded in verify.json + seal metadata; reviewable via dissoc-scan.mjs)\n`);
  }
  if (failures.length > 0) {
    gateFail(
      "verify",
      `unacknowledged checker failures: ${failures.map((f) => f.name).join(", ")}`,
      'Fix the defects, or add {name, reason} to verify.acknowledge with a recorded reason.'
    );
  }
  console.log(`[verify] OK — ${checks.length} checkers, all pass or acknowledged`);
  return result;
}

// --- Stage 4: label ---
// Judgment: the agent assigns the label. Code: enforces §3.4 consistency.
// Phase 3: writes a calibration log entry for supported/plausible/verified
// labels (v1.7 §8). The outcome is resolved later by scoring; null = pending.
function stageLabel(task, verifyResult, runDir, assist) {
  const l = task.label || {};
  const valid = ["verified", "supported", "plausible", "unknown"];
  if (!valid.includes(l.label)) {
    gateFail("label", `label must be one of ${valid.join("|")}`, assist ? 'Add "label": {"label": ..., "basis": ..., "strategy_tag": ...} to the task file.' : undefined);
  }
  if (!l.basis || String(l.basis).trim() === "") {
    gateFail("label", "label requires a non-empty basis (one line naming the evidence)");
  }
  // Consistency: `verified` requires all checkers passed unacknowledged... actually
  // acknowledged failures mean the agent accepted a known weakness → cap at supported.
  const anyWeakness =
    verifyResult.checks.some((c) => c.result !== "PASS") ||
    (verifyResult.acknowledged || []).length > 0;
  if (l.label === "verified" && anyWeakness) {
    gateFail(
      "label",
      '"verified" is inconsistent with failing or acknowledged checkers — downgrade to "supported" at best (§3.4)'
    );
  }
  // DTC FRAGILITY (§19 H2 adoption, 2026-10-06): disagreement-count as a
  // label-downgrade trigger. The trial showed disagreement strictly dominates
  // the flat `supported` label as a fragility discriminator (1/98
  // disagreement events, zero false flags, root-caused to a real mode-18
  // defect). Any successful perturbed-prompt probe that disagrees with the
  // primary answer downgrades supported→plausible and flags for review.
  // (Trial scope covers `supported` only — the `verified` interaction is an
  // open follow-up, not an implemented rule.)
  let finalLabel = l.label;
  let dtcFlag = null;
  let dtcRec = null;
  try {
    dtcRec = JSON.parse(readFileSync(join(runDir, "solve.json"), "utf8")).dtc || null;
  } catch { /* no solve.json or no dtc record — no downgrade */ }
  if (dtcRec && dtcRec.disagreements > 0) {
    dtcFlag = `DTC fragility: ${dtcRec.disagreements} of ${dtcRec.probes_ok} successful perturbed-prompt probes disagree with the primary answer (unanimous=false). Review solver tie-breaking/canonicalization — this is the exact signature that surfaced the v10-select-003 mode-18 defect.`;
    if (finalLabel === "supported") {
      finalLabel = "plausible";
      dtcFlag += " Downgraded supported→plausible per §19 DTC adoption.";
      console.log(`[label] !!! DTC FRAGILITY FLAG — ${dtcRec.disagreements} disagreement(s): downgrading supported→plausible`);
    } else {
      console.log(`[label] !!! DTC FRAGILITY FLAG — ${dtcRec.disagreements} disagreement(s) (label ${finalLabel}; downgrade rule covers supported only)`);
    }
  }
  const result = {
    stage: "label",
    task_id: task.id,
    label: finalLabel,
    basis: l.basis,
    strategy_tag: l.strategy_tag || task.formalize?.strategy || "UNKNOWN",
    dtc_disagreements: dtcRec ? dtcRec.disagreements : null,
    dtc_flag: dtcFlag,
  };
  save(runDir, "label", result);
  console.log(`[label] OK — ${finalLabel} (${l.basis.slice(0, 60)})`);

  // Calibration log (§8.2): append {date, claim, label, outcome} JSONL.
  // Outcome null = pending resolution (resolved by run-bank scoring).
  // DTC instrumentation (H2 adoption): log disagreements/probes/unanimous
  // so the ECE-superiority claim can be re-tested as events accumulate.
  if (["verified", "supported", "plausible"].includes(finalLabel)) {
    try {
      const calLog = join(HERE, "calibration-log.jsonl");
      const entry = {
        date: new Date().toISOString().slice(0, 10),
        claim: `${task.id}: answer ${finalLabel} (${result.strategy_tag})`,
        label: finalLabel,
        outcome: null,
        task_id: task.id,
        dtc_disagreements: dtcRec ? dtcRec.disagreements : null,
        dtc_probes_ok: dtcRec ? dtcRec.probes_ok : null,
        dtc_unanimous: dtcRec ? dtcRec.unanimous : null,
      };
      appendFileSync(calLog, JSON.stringify(entry) + "\n");
    } catch (e) {
      console.warn(`[label] warning: calibration log write failed: ${e.message}`);
    }
  }
  return result;
}

// --- Stage 5: seal ---
// Deterministic: hash all stage artifacts, then issue a SIGNED Ed25519
// envelope via the evidence toolkit (envelope.mjs). The envelope's payload
// is the artifact hash map; the signature covers the canonical bytes.
// Falls back to SHA-256-only (unsigned) if the signing key is unavailable.
//
// SECURITY (D3 T4): the sealed record includes the FULL run record —
// tools-log.json (independent), draft.md, task.json, independent-log.jsonl —
// not just the four stage JSONs.
async function stageSeal(task, runDir, labelResult, verifyResult, solvedResult) {
  const { createHash } = await import("node:crypto");
  const artifacts = {};
  const hashFile = (name) => {
    const p = join(runDir, name);
    if (!existsSync(p)) return false;
    const raw = readFileSync(p); // binary-safe; draft.md may be text
    artifacts[name] = createHash("sha256").update(raw).digest("hex");
    return true;
  };
  for (const s of ["formalize", "solve", "verify", "label"]) hashFile(`${s}.json`);
  hashFile("tools-log.json");
  hashFile("draft.md");
  hashFile("task.json");
  hashFile("independent-log.jsonl");
  hashFile("independent-seal.json");
  hashFile("exec-check.json"); // mode-19 gate verdict is seal-covered
  hashFile("span-check.json"); // IC1 span-gate verdict is seal-covered

  const signing = await getSigning();
  let sealObj;
  // SECURITY (D3 T5): acknowledgments surface in seal metadata.
  const ackMeta = (verifyResult.acknowledged || []).map((a) => ({ name: a.name, reason: a.reason }));
  // SECURITY (E9-2): the seal binds WHICH CODE ran — solver content hash
  // recorded at dispatch. Answers the approval-laundering Demo 2 question.
  const solverPin = (solvedResult && solvedResult.solver_pin) || null;
  if (signing) {
    const envelope = signing.issueEnvelope(
      {
        payload: {
          pipeline: "reasoning-runtime",
          version: "0.3.0",
          task_id: task.id,
          artifacts,
        },
        metadata: {
          sealed_at: new Date().toISOString(),
          label: labelResult.label,
          strategy_tag: labelResult.strategy_tag,
          acknowledged: ackMeta,
          reconciliation: verifyResult.reconciliation || null,
          solver_pin: solverPin,
        },
      },
      signing.privateKey
    );
    sealObj = { stage: "seal", signed: true, keyId: envelope.keyId, envelope };
    console.log(`[seal] OK — signed envelope ${envelope.evidenceId} (key ${envelope.keyId.slice(0, 20)}…)`);
  } else {
    const envelopeHash = createHash("sha256")
      .update(JSON.stringify(artifacts, Object.keys(artifacts).sort()), "utf8")
      .digest("hex");
    sealObj = { stage: "seal", signed: false, envelope_hash: envelopeHash, artifacts,
      acknowledged: ackMeta, reconciliation: verifyResult.reconciliation || null,
      solver_pin: solverPin };
    console.log(`[seal] OK — unsigned envelope ${envelopeHash}`);
  }
  save(runDir, "seal", sealObj);
  return sealObj;
}

// --- Main ---
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const task = load(args.task);
  if (!task.id) {
    console.error("task.json must contain an 'id'");
    process.exit(2);
  }

  const runDir = join(HERE, "runs", task.id);
  mkdirSync(runDir, { recursive: true });
  console.log(`Pipeline run: ${task.id} → ${runDir}`);

  // SECURITY (D1): runner-owned independent trace recorder. The log path is
  // never exposed to solver/checker subprocesses (scrubbed from child env).
  // Fresh log per pipeline invocation: a re-run must not inherit a prior
  // run's exec records (stale failures would false-flag reconciliation).
  const indepLog = join(runDir, "independent-log.jsonl");
  const indepSeal = join(runDir, "independent-seal.json");
  try { (await import("node:fs")).rmSync(indepLog, { force: true }); } catch {}
  try { (await import("node:fs")).rmSync(indepSeal, { force: true }); } catch {}
  const recorder = createRecorder(indepLog);
  // Save the input task into the run dir so the seal covers it (D3 T4).
  writeFileSync(join(runDir, "task.json"), JSON.stringify(task, null, 2) + "\n");

  const formal = stageFormalize(task, runDir, args.assist);
  const solved = stageSolve(task, formal, runDir, args.assist, recorder);
  const verified = stageVerify(task, runDir, args.toolsLog, recorder, solved.solverExecd);
  const labeled = stageLabel(task, verified, runDir, args.assist);
  // MODE-19 (§19 output-deception trial, ADOPTED scoped): execution-claim
  // cross-reference over the complete record. reconcile() (D1, inside
  // stageVerify) covers trace/checker-entry deception, but runs before
  // verify.json/label.json are saved and never sees prose claims. exec-check
  // adds the prose layer: "verified via X" claims in draft.md and the label
  // basis, re-run/agreement measurements, and empty-verification. It reads
  // the runner-owned independent log directly (never the trace-derived log).
  // Blocks the seal on FABRICATION unless exec-check is explicitly
  // acknowledged in task.verify.acknowledge (fail-or-acknowledge convention).
  // This is a gate rather than a verify-stage checker (the trial's stated
  // preference) because label.json does not exist during stageVerify, and
  // because D1's reconcile already set the blocking-gate precedent.
  {
    let out = "";
    try {
      out = execFileSync("node", [join(HERE, "exec-check.mjs"), "--dir", runDir, "--independent-log", indepLog, "--json"], { encoding: "utf8" });
    } catch (e) {
      out = e.stdout || "";
    }
    let r = {};
    try { r = JSON.parse(out); } catch { r = { verdict: "ERROR", unmatched: [], raw: String(out).slice(0, 300) }; }
    save(runDir, "exec-check", r);
    if (r.verdict === "FABRICATION") {
      const ack = (task.verify?.acknowledge || []).some((a) => a && typeof a === "object" && a.name === "exec-check");
      const detail = (r.unmatched || []).map((f) => `  [${f.kind}] ${f.claim} — ${f.reason}`).join("\n");
      if (ack) {
        console.log(`[exec-check] FABRICATION acknowledged (reason recorded in verify.acknowledge)`);
      } else {
        gateFail("verify", "exec-check FABRICATION: execution claims diverge from the independent record", detail);
      }
    } else {
      console.log(`[exec-check] ${r.verdict || "CLEAN"} — ${(r.claims_checked ?? 0)} claims checked against the independent log`);
    }
  }
  // SPAN GATE (§19 IC1 adoption, 2026-10-06): per-run check trio as a
  // deterministic post-run span gate (§15 activity-schema validation).
  // Q1 mandate / Q2 read-scope / Q3 write-scope over the independent
  // execution record + static scan of the pinned solver, categorized into
  // the five frontier failure patterns. Trial: 0 crossings on 20 clean
  // runs, 5/5 synthetic selftest. Severe findings block the seal unless
  // span-check is explicitly acknowledged in task.verify.acknowledge
  // (fail-or-acknowledge convention, same as exec-check). Review-level
  // findings are surfaced but non-blocking.
  {
    let out = "";
    try {
      out = execFileSync("node", [join(HERE, "span-check.mjs"), "--dir", runDir, "--json"], { encoding: "utf8" });
    } catch (e) {
      out = e.stdout || "";
    }
    let r = {};
    try { r = JSON.parse(out); } catch { r = { findings: [], error: String(out).slice(0, 300) }; }
    const { isSevere } = await import("./span-check.mjs");
    const findings = r.findings || [];
    const severe = findings.filter(isSevere);
    const review = findings.filter((f) => !isSevere(f));
    save(runDir, "span-check", { run: runDir, severe: severe.length, review: review.length, findings });
    if (r.error) console.log(`[span-check] warning: ${r.error}`);
    for (const f of review) {
      console.log(`[span-check] review: [seq ${f.seq}] ${f.kind}: ${String(f.detail).slice(0, 120)}`);
    }
    if (severe.length > 0) {
      const ack = (task.verify?.acknowledge || []).some((a) => a && typeof a === "object" && a.name === "span-check");
      const detail = severe.map((f) => `  [seq ${f.seq}] ${f.pattern} ${f.kind}: ${f.detail}`).join("\n");
      if (ack) {
        console.log(`[span-check] ${severe.length} severe finding(s) acknowledged (reason recorded in verify.acknowledge)`);
      } else {
        gateFail("verify", `span-check: ${severe.length} boundary-crossing finding(s)`, detail);
      }
    } else {
      console.log(`[span-check] CLEAN — ${findings.length} finding(s), 0 severe`);
    }
  }
  // Seal the independent log before the envelope covers it.
  recorder.seal(join(runDir, "independent-seal.json"));
  await stageSeal(task, runDir, labeled, verified, solved);

  console.log(`\nPipeline complete: ${task.id} — all gates passed.`);
}

main();
