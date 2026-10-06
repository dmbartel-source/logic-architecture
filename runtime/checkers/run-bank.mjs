#!/usr/bin/env node
// run-bank.mjs — Batch bank runner (Phase 3).
// Runs the full pipeline on every task in a bank, collects results, scores.
//
// Usage:
//   node run-bank.mjs --bank <prompts.json> [--answers <answers.json>] [--out <results.json>]
//
// For each task:
//   1. Generate task skeleton via make-task.mjs
//   2. Auto-fill solver, formalize, verify, label (batch mode)
//   3. Run pipeline.mjs
//   4. Record: pass/fail, gate blocks, answer
//
// If --answers is provided, scores against the answer key (strict blindness:
// only reports match/mismatch counts, never reveals correct answers).
//
// Category → solver mapping (Phase 3):
//   multi-step arithmetic → solve-arith.mjs (generic) or per-task
//   constrained selection  → solve-select.mjs
//   routing                → solve-route.mjs
//   scheduling             → solve-sched.mjs
//   packing (bin)          → solve-pack.mjs
//   consistency            → solve-consist.mjs (generic)
//   counterfactual (knapsack) → solve-counter.mjs
//   argument critique      → JUDGMENT (skipped in batch; needs agent)
//   strategy classification→ JUDGMENT (skipped in batch; needs agent)
//   distractor             → solve-arith.mjs (generic)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync, execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scanPrompt as impossibilityScan } from "./solvers/impossibility-scan.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// --- XConf-based heuristic labeling (calibration-recalibration-2026-10-06) ---
// The runtime's `plausible` label drifted to 87.8% (vs 50–80% band) because ALL
// heuristic outputs were hardcoded to `plausible`. The strategy classifier
// actually performs at 100% (32/32); critique at 78.6% (33/42).
// Fix: assign the label from the category's historical recall (XConf-style),
// not from the solver type. Bands unchanged (sealed v1.8); this fixes the
// labeling behavior to match the bands.
const CAL_LOG = join(HERE, "calibration-log.jsonl");
const HEURISTIC_CAT_MAP = {
  "strategy classification": "strategy",
  "argument critique": "critique",
};

function getCategoryRecall(catKey) {
  // Returns {hits, total, rate} for a calibration-log category key,
  // or null if insufficient data (n<5). Reads only resolved episodes.
  try {
    if (!existsSync(CAL_LOG)) return null;
    const lines = readFileSync(CAL_LOG, "utf8").split("\n").filter(Boolean);
    let hits = 0, total = 0;
    for (const line of lines) {
      let e;
      try { e = JSON.parse(line); } catch { continue; }
      if (e.outcome === null || e.outcome === undefined) continue;
      const tid = e.task_id || "";
      const parts = tid.split("-");
      const cat = parts.length > 1 ? parts[1] : "unknown";
      if (cat !== catKey) continue;
      total++;
      if (e.outcome === true) hits++;
    }
    if (total < 5) return null;
    return { hits, total, rate: 100 * hits / total };
  } catch {
    return null;
  }
}

function heuristicLabel(itemCategory) {
  // XConf-based label for heuristic solver outputs.
  // Heuristics are never `verified` (that's for deterministic proof).
  // - Category recall >= 80% (n>=5) → "supported" (empirical rate justifies 80%+ claim)
  // - Category recall < 80% or insufficient data → "plausible" (conservative)
  const catKey = HEURISTIC_CAT_MAP[itemCategory];
  const basis = "heuristic partial automation (Phase 6); not deterministic proof";
  if (!catKey) return { label: "plausible", basis };
  const r = getCategoryRecall(catKey);
  const recallNote = r
    ? `; XConf category recall ${r.hits}/${r.total}=${r.rate.toFixed(1)}%`
    : "; insufficient category history (conservative default)";
  if (r && r.rate >= 80) {
    return { label: "supported", basis: basis + recallNote };
  }
  return { label: "plausible", basis: basis + recallNote };
}

const SOLVER_MAP = {
  // Category solvers (Phase 3): these parse the prompt and solve deterministically.
  // They handle the v8 formats listed; other variants are SKIPPED.
  "constrained selection": "solvers/solve-select.mjs",  // v8-select-001 (cargo format)
  "routing": "solvers/solve-route.mjs",                  // v8-route-001..006 (link-attribute + waypoints + kth + windows)
  "scheduling": "solvers/solve-sched.mjs",               // v8-sched-001,002,004,005,006 (makespan/lateness)
  "packing": "solvers/solve-pack.mjs",                   // v8-pack-001,003,004 (bin packing)
  "counterfactual": "solvers/solve-counter.mjs",         // v8-counter-001,002 (knapsack margin/quadruple)
  "consistency": "solvers/solve-consist.mjs",             // v8-consist-002,003,004 (Phase 5)
  // JUDGMENT categories (Phase 6): heuristic partial automation.
  // These solvers produce best-effort answers labeled `plausible`, not `supported`.
  "argument critique": "solvers/solve-critique.mjs",        // heuristic flaw detection + arg-check
  "strategy classification": "solvers/solve-strategy.mjs",  // §13 keyword classifier
  // Per-task solvers (existing):
  //   v8-arith-001..006, v8-consist-001, v8-distract-001, v8-distract-002 have dedicated solvers in solvers/.
  // JUDGMENT categories (critique, strategy-classification) are skipped in batch.
  // Arithmetic/consistency/distractor variants without dedicated solvers are skipped.
};

// Tasks with dedicated per-task solvers (checked first).
// Phase 4: select-002..006 use the generic solve-select2.mjs.
// Phase 5: distract-003/004 use the route/sched solvers with filtering;
//   sched-003 uses the shift solver; pack-002 uses the 2D pack solver.
const TASK_SOLVER_OVERRIDE = {
  "v8-select-002": "solvers/solve-select2.mjs",
  "v8-select-003": "solvers/solve-select2.mjs",
  "v8-select-004": "solvers/solve-select2.mjs",
  "v8-select-005": "solvers/solve-select2.mjs",
  "v8-select-006": "solvers/solve-select2.mjs",
  "v8-distract-003": "solvers/solve-route.mjs",
  "v8-distract-004": "solvers/solve-sched.mjs",
  "v8-sched-003": "solvers/solve-shift.mjs",
  "v8-pack-002": "solvers/solve-pack2d.mjs",
  // v9 elision probes (heterogeneous; per-task routing):
  "v9-elide-001": "solvers/solve-route.mjs",      // construction closure aside → routing with link-status filtering
  "v9-elide-002": "solvers/v9-elide-002.mjs",     // clearance exclusion clause → arithmetic (per-task)
  "v9-elide-003": "solvers/solve-select-v9.mjs", // double-negative membership requirement → selection
  // v9 selection (novel constraint structures):
  "v9-select-001": "solvers/solve-select-v9.mjs",
  "v9-select-002": "solvers/solve-select-v9.mjs",
  "v9-select-003": "solvers/solve-select-v9.mjs",
  "v9-select-004": "solvers/solve-select-v9.mjs",
  "v9-select-005": "solvers/solve-select-v9.mjs",
  "v9-select-006": "solvers/solve-select-v9.mjs",
  // v9 counterfactual (novel structures):
  "v9-counter-001": "solvers/solve-counter-v9.mjs",
  "v9-counter-002": "solvers/solve-counter-v9.mjs",
  "v9-counter-003": "solvers/solve-counter-v9.mjs",
  "v9-counter-004": "solvers/solve-counter-v9.mjs",
  "v9-counter-005": "solvers/solve-counter-v9.mjs",
  // v9 consistency:
  "v9-consist-001": "solvers/solve-consist-v9.mjs",
  "v9-consist-002": "solvers/solve-consist-v9.mjs",
  "v9-consist-003": "solvers/solve-consist-v9.mjs",
  "v9-consist-004": "solvers/solve-consist-v9.mjs",
  // v9 scheduling (novel formats; dedicated solver):
  "v9-sched-001": "solvers/solve-sched-v9.mjs",
  "v9-sched-002": "solvers/solve-sched-v9.mjs",
  "v9-sched-003": "solvers/solve-sched-v9.mjs",
  "v9-sched-004": "solvers/solve-sched-v9.mjs",
  "v9-sched-005": "solvers/solve-sched-v9.mjs",
  "v9-sched-006": "solvers/solve-sched-v9.mjs",
  // v9 packing (novel formats; dedicated solver):
  "v9-pack-001": "solvers/solve-pack-v9.mjs",
  "v9-pack-002": "solvers/solve-pack-v9.mjs",
  "v9-pack-003": "solvers/solve-pack-v9.mjs",
  "v9-pack-004": "solvers/solve-pack-v9.mjs",
};

function findSolver(taskId, category) {
  if (TASK_SOLVER_OVERRIDE[taskId]) {
    const p = join(HERE, TASK_SOLVER_OVERRIDE[taskId]);
    if (existsSync(p)) return "./" + TASK_SOLVER_OVERRIDE[taskId];
  }
  const perTask = join(HERE, "solvers", `${taskId}.mjs`);
  if (existsSync(perTask)) return `./solvers/${taskId}.mjs`;
  const cat = SOLVER_MAP[category];
  if (cat && existsSync(join(HERE, cat))) return "./" + cat;
  return null;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--bank") args.bank = argv[++i];
    else if (argv[i] === "--answers") args.answers = argv[++i];
    else if (argv[i] === "--out") args.out = argv[++i];
    else if (argv[i] === "--ids") args.ids = argv[++i].split(",");
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.bank) { console.error("Usage: node run-bank.mjs --bank <prompts.json> [--answers <answers.json>] [--out <results.json>] [--ids <id1,id2>]"); process.exit(2); }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const bank = JSON.parse(readFileSync(args.bank, "utf8"));
  const items = Array.isArray(bank) ? bank : bank.prompts || bank.tasks || [];

  let answers = null;
  if (args.answers) {
    answers = JSON.parse(readFileSync(args.answers, "utf8"));
  }

  const targetIds = args.ids || items.map((i) => i.id);
  const results = [];
  const batchDir = join(HERE, "runs", "batch-" + Date.now());
  mkdirSync(batchDir, { recursive: true });

  console.log(`Batch run: ${targetIds.length} tasks → ${batchDir}\n`);

  for (const id of targetIds) {
    const item = items.find((i) => i.id === id);
    if (!item) {
      results.push({ id, status: "NOT_FOUND" });
      continue;
    }

    // KA5 adoption: impossibility scan as report-only pre-solve monitor.
    // Flags are recorded alongside results; a flag on a valid bank task is
    // itself signal (bank bug or pattern overreach). NOT a gate.
    let impossibilityFlags = [];
    try {
      impossibilityFlags = impossibilityScan(item.prompt || "");
    } catch { /* scan is best-effort; never blocks the batch */ }
    if (impossibilityFlags.length > 0) {
      console.log(`  [impossibility-scan] ${id}: ${impossibilityFlags.length} flag(s): ${impossibilityFlags[0]}`);
    }

    const solver = findSolver(id, item.category);
    if (!solver) {
      const reason = SOLVER_MAP[item.category]
        ? `solver ${SOLVER_MAP[item.category]} may not handle this variant`
        : "JUDGMENT category needs agent";
      // Check if it's a JUDGMENT category vs unimplemented variant.
      const isJudgment = ["argument critique", "strategy classification"].includes(item.category);
      results.push({ id, category: item.category, status: "SKIPPED", reason });
      console.log(`${id}: SKIPPED (${reason})`);
      continue;
    }

    const solverPath = join(HERE, solver.replace(/^\.\//, ""));

    // Generate task skeleton.
    const taskFile = join(batchDir, `${id}.json`);
    try {
      execFileSync("node", [join(HERE, "make-task.mjs"), "--bank", args.bank, "--id", id, "--out", taskFile],
        { encoding: "utf8", stdio: "pipe" });
    } catch (e) {
      results.push({ id, category: item.category, status: "TASKGEN_FAIL", reason: e.message.slice(0, 200) });
      console.log(`${id}: TASKGEN_FAIL`);
      continue;
    }

    // Auto-fill for batch mode.
    const task = JSON.parse(readFileSync(taskFile, "utf8"));
    // Phase 6: JUDGMENT categories use heuristic solvers. The pipeline's
    // solve stage only executes solver_script for COMPUTATION/SEARCH, so
    // pre-run the heuristic here, set task.answer directly, and label the
    // result `plausible` (heuristic analysis, not deterministic proof).
    const isJudgmentHeuristic = ["argument critique", "strategy classification"].includes(item.category);
    if (isJudgmentHeuristic) {
      const promptFile = join(batchDir, `${id}.prompt.txt`);
      writeFileSync(promptFile, item.prompt);
      try {
        const heuristicArgs = [solverPath, "--prompt", promptFile];
        // Critique solver also emits a chain.json for arg-check.
        let chainFile = null;
        if (item.category === "argument critique") {
          chainFile = join(batchDir, `${id}.chain.json`);
          heuristicArgs.push("--chain-out", chainFile);
        }
        const out = execFileSync("node", heuristicArgs, { encoding: "utf8", timeout: 60000 });
        task.answer = out.trim().split("\n").pop();
        task.solver_script = null;
        // XConf-based labeling: category recall determines the label so the
        // label's empirical rate lands in its band (fixes t06 drift).
        const hl = heuristicLabel(item.category);
        task.label.label = hl.label;
        task.label.basis = hl.basis;
        // Wire arg-check for critique tasks (structural validation of the parse).
        task.verify = chainFile && existsSync(chainFile)
          ? { lint: true, chain: chainFile }
          : { lint: true };
        console.log(`[batch] ${id}: heuristic answer="${task.answer}"`);
      } catch (e) {
        results.push({ id, category: item.category, status: "HEURISTIC_FAIL", reason: e.message.slice(0, 200) });
        console.log(`${id}: HEURISTIC_FAIL (${e.message.slice(0, 100)})`);
        continue;
      }
    } else {
      task.solver_script = "./" + solver;
    }
    // Minimal valid formalize (batch mode: premises from category).
    task.formalize.strategy_basis = `Batch mode: ${item.category} via ${isJudgmentHeuristic ? "heuristic partial automation" : "deterministic solver"}.`;
    task.formalize.premises = [{ id: "P1", source: "stated", text: "Task prompt as stated." }];
    task.formalize.success_criteria = "Answer matches required format.";
    task.formalize.load_bearing = ["prompt constraints"];
    if (!isJudgmentHeuristic) {
      // Label as supported (batch mode: solver output is the evidence).
      task.label.label = "supported";
      task.label.basis = "deterministic solver output via batch runner";
      // Simplify verify for batch: lint + auto-draft only (no tiebreak/bound fixtures).
      task.verify = { lint: true, draft: "auto" };
    }
    // (JUDGMENT heuristic tasks keep their plausible label and arg-check wiring.)
    // Phase 5: set answer_format to match the solver's output format for
    // tasks with explicit solver overrides (category default may not match).
    const TASK_FORMAT_OVERRIDE = {
      "v8-distract-002": "^([A-Z]+\\+)*[A-Z]+$",
      "v8-distract-003": "^([A-Z]+>)+[A-Z]+$",
      "v8-distract-004": "^([A-Z]+@\\d+-\\d+(@M\\d+)?,?)+$",
      "v8-sched-003": "^([A-Za-z0-9]+:[A-Za-z]+,?)+$",
      "v8-pack-002": "^([A-Z]+@\\d+,\\d+;?)+$",
      // v9 elision probes:
      "v9-elide-001": "^([A-Z]+>)+[A-Z]+$",
      "v9-elide-002": "^USD \\d+\\.\\d{2}$",
      "v9-elide-003": "^\\d+:[A-Z](,[A-Z])*$",
      // v9 selection (answer form "{score}:{names}", confirmed from bank builders):
      "v9-select-001": "^\\d+:[A-Za-z0-9]+(,[A-Za-z0-9]+)*$",
      "v9-select-002": "^\\d+:[A-Za-z0-9]+(,[A-Za-z0-9]+)*$",
      "v9-select-003": "^\\d+:[A-Za-z0-9]+(,[A-Za-z0-9]+)*$",
      "v9-select-004": "^\\d+:[A-Za-z0-9]+(,[A-Za-z0-9]+)*$",
      "v9-select-005": "^\\d+\\.\\d{2}:[A-Za-z0-9]+(,[A-Za-z0-9]+)*$",
      "v9-select-006": "^\\d+:[A-Za-z0-9]+(,[A-Za-z0-9]+)*$",
      // v9 distractors:
      "v9-distract-002": "^\\d+$",
      "v9-distract-003": "^\\d+:[A-Z0-9]+(,[A-Z0-9]+)*$",
      // v9 counterfactual:
      "v9-counter-001": "^REMOVE:[A-T](,[A-T])*$",
      "v9-counter-002": "^\\d+>\\d+:[A-Z]->[A-Z](,[A-Z]->[A-Z])*$",
      "v9-counter-003": "^\\d+>\\d+:[A-Z0-9]+>[A-Z0-9]+(,[A-Z0-9]+>[A-Z0-9]+)*$",
      "v9-counter-004": "^\\d+>\\d+:[A-Z0-9]+(,[A-Z0-9]+)*$",
      "v9-counter-005": "^\\d+>\\d+:[A-Z]$",
      // v9 consistency:
      "v9-consist-001": "^MISMATCH:ROW-\\d+(,ROW-\\d+)*$",
      "v9-consist-002": "^MISMATCH:PERIOD-\\d+(,PERIOD-\\d+)*$",
      "v9-consist-003": "^MISMATCH:X=-?\\d+(,X=-?\\d+)*$",
      "v9-consist-004": "^MISMATCH:E\\d+(,E\\d+)*$",
      // v9 scheduling (answer forms differ from template):
      "v9-sched-001": "^\\d+:[A-Z0-9]+@\\d+(,[A-Z0-9]+@\\d+)*$",
      "v9-sched-002": "^\\d+:[A-Z0-9]+@\\d+(,[A-Z0-9]+@\\d+)*$",
      "v9-sched-003": "^S\\d+=w\\d+(,S\\d+=w\\d+)*$",
      "v9-sched-004": "^\\d+:[A-Z0-9]+@\\d+(,[A-Z0-9]+@\\d+)*$",
      "v9-sched-005": "^\\d+:[A-Z0-9]+@\\d+(,[A-Z0-9]+@\\d+)*$",
      "v9-sched-006": "^\\d+:[A-Z0-9]+(,[A-Z0-9]+)*$",
      // v9 packing (numeric counts, ;-separated, CAP:/VALUE: forms):
      "v9-pack-001": "^\\d+:(\\d+:\\[[A-Z0-9]+(,[A-Z0-9]+)*\\];?)+$",
      "v9-pack-002": "^\\d+:[A-Z0-9]+@\\d+,\\d+R?(;[A-Z0-9]+@\\d+,\\d+R?)*$",
      "v9-pack-003": "^\\d+:(\\[[A-Z0-9]+(,[A-Z0-9]+)*\\];?)+$",
      "v9-pack-004": "^\\d+:(\\[[A-Z0-9]+(,[A-Z0-9]+)*\\];?)+$",
    };
    if (TASK_FORMAT_OVERRIDE[id]) {
      task.answer_format = TASK_FORMAT_OVERRIDE[id];
    } else if (TASK_SOLVER_OVERRIDE[id]) {
      const FORMAT_FOR_SOLVER = {
        "solvers/solve-route.mjs": "^([A-Z]+>)+[A-Z]+$",
        "solvers/solve-sched.mjs": "^([A-Z]+@\\d+-\\d+(@M\\d+)?,?)+$",
        "solvers/solve-shift.mjs": "^([A-Za-z0-9]+:[A-Za-z]+,?)+$",
        "solvers/solve-pack2d.mjs": "^([A-Z]+@\\d+,\\d+;?)+$",
      };
      const solverKey = TASK_SOLVER_OVERRIDE[id];
      if (FORMAT_FOR_SOLVER[solverKey]) {
        task.answer_format = FORMAT_FOR_SOLVER[solverKey];
      }
    }
    writeFileSync(taskFile, JSON.stringify(task, null, 2) + "\n");

    // Run pipeline.
    try {
      const out = execFileSync("node", [join(HERE, "pipeline.mjs"), "--task", taskFile],
        { encoding: "utf8", timeout: 300000, stdio: "pipe" });
      // Extract answer from the run.
      const runDir = join(HERE, "runs", id);
      const solved = JSON.parse(readFileSync(join(runDir, "solve.json"), "utf8"));
      const r = { id, category: item.category, status: "PASS", answer: solved.answer };
      // KA5: record impossibility-scan flags (report-only monitor).
      if (impossibilityFlags.length > 0) r.impossibility_flags = impossibilityFlags;

// --- Validity+objective dual scoring (Mode-18 trial follow-up 2, 2026-10-06) ---
// For multi-optimum tasks whose bank key encodes ONE canonical choice among
// many valid optima, exact-match scoring measures surface form, not reasoning
// (§19 trial-mode18 mitigation #4: "prefer validity+objective scoring over
// exact match for optimization tasks").
// Dual scoring: correct iff (a) the emitted objective values (BASE, REDUCTION)
// match the key's, and (b) the emitted structure is independently verified as a
// valid optimum from the PROMPT's data only. The key's structural content is
// NEVER consulted — only its aggregate objectives. Blindness-safe.
// Currently: v9-counter-003 (102 optimal quintuples; key is the lex-smallest;
// the canonicalized solver emits a different valid optimum).
const DUAL_SCORE_IDS = new Set(["v9-counter-003"]);

// Genuine 2-machine list scheduling (LPT among ready jobs), mirroring the
// bank builder's repair-2 ms_with (gen-v9.py): event-driven; a job is ready
// only when ALL its predecessors have COMPLETED.
function msWith2Machine(dur, prec) {
  const preds = {};
  for (const id of Object.keys(dur)) preds[id] = new Set();
  for (const [a, b] of prec) preds[b].add(a);
  const done = {}, running = {};
  const mfree = [0, 0];
  let t = 0;
  const ids = Object.keys(dur);
  while (Object.keys(done).length < ids.length) {
    for (const j of Object.keys(running)) {
      if (running[j] <= t) { done[j] = running[j]; delete running[j]; }
    }
    if (Object.keys(done).length === ids.length) break;
    const ready = ids.filter((j) =>
      !(j in done) && !(j in running) && [...preds[j]].every((p) => p in done));
    ready.sort((x, y) => dur[y] - dur[x] || (x < y ? -1 : 1));
    for (let k = 0; k < 2; k++) {
      if (mfree[k] <= t && ready.length) {
        const j = ready.shift();
        const e = t + dur[j];
        running[j] = e; mfree[k] = e;
      }
    }
    if (!Object.keys(running).length) throw new Error("scheduling deadlock");
    t = Math.min(...Object.values(running));
  }
  return Math.max(...Object.values(done));
}

function dualScoreCounter003(promptText, solvedAnswer, expectedAnswer) {
  // Expected like "27>7:J01>J03,..." — only BASE>REDUCTION are read.
  const km = /^(\d+)>(\d+):/.exec(String(expectedAnswer).trim());
  const am = /^(\d+)>(\d+):(.+)$/.exec(String(solvedAnswer).trim());
  if (!km || !am) return false;
  const base = +km[1], red = +km[2];
  if (+am[1] !== base || +am[2] !== red) return false;
  // Parse the prompt's data (public: solvers see the same text).
  const dur = {};
  for (const m of promptText.matchAll(/(J\d+):\s*(\d+)/g)) dur[m[1]] = +m[2];
  const prec = [...promptText.matchAll(/(J\d+)>(J\d+)/g)].map((m) => [m[1], m[2]]);
  const precSet = new Set(prec.map(([a, b]) => `${a}>${b}`));
  const nMatch = /which (\d+) precedence constraints/.exec(promptText);
  const n = nMatch ? +nMatch[1] : 5;
  const emitted = am[3].split(",").map((s) => s.trim()).filter(Boolean);
  if (emitted.length !== n) return false;
  if (new Set(emitted).size !== emitted.length) return false;
  for (const e of emitted) if (!precSet.has(e)) return false; // must be real constraints
  const removal = new Set(emitted);
  const kept = prec.filter(([a, b]) => !removal.has(`${a}>${b}`));
  return base - msWith2Machine(dur, kept) === red; // achieves the claimed optimum
}

      // Score if answers provided (strict blindness: only compare).
      if (answers) {
        const expected = answers[id];
        // Normalize: trim + case-insensitive (per run-v8.mjs).
        const norm = (s) => String(s).trim().toLowerCase();
        if (DUAL_SCORE_IDS.has(id)) {
          r.correct = dualScoreCounter003(item.prompt, solved.answer, expected);
          r.scoring = "validity+objective";
        } else {
          r.correct = norm(solved.answer) === norm(expected);
        }
      }
      results.push(r);
      console.log(`${id}: PASS${r.correct !== undefined ? (r.correct ? " ✓" : " ✗") : ""}`);
    } catch (e) {
      // Pipeline failed (gate block or error).
      const msg = e.message || "";
      const gateMatch = /GATE FAILED at stage "(\w+)"/.exec(e.stdout || "") || /GATE FAILED at stage "(\w+)"/.exec(msg);
      const stage = gateMatch ? gateMatch[1] : "ERROR";
      results.push({ id, category: item.category, status: "GATE_BLOCK", gate: stage });
      console.log(`${id}: GATE_BLOCK at ${stage}`);
    }
  }

  // Summary.
  const pass = results.filter((r) => r.status === "PASS");
  const scored = pass.filter((r) => r.correct !== undefined);
  const correct = scored.filter((r) => r.correct);
  const blocks = results.filter((r) => r.status === "GATE_BLOCK");
  const skipped = results.filter((r) => r.status === "SKIPPED");

  // JA4 priced abstention (adopted 2026-10-06): the headline score must not
  // be quotable without its priced counterpart. Three numbers, always:
  //   Score_commits    = correct / scored          (commits only; the old headline)
  //   Score_commit_all = correct / total           (blocks/skips priced as non-commits)
  //   commit_rate      = scored / total            (fraction of tasks committed)
  // The regret gap (commits minus commit-all) is the tripwire: if commit_rate
  // drops below 100%, audit re-runs are triggered (see trial-abstention report).
  const total = results.length;
  const scoreCommits = scored.length ? `${correct.length}/${scored.length}` : null;
  const scoreCommitAll = total ? `${correct.length}/${total}` : null;
  const commitRate = total ? scored.length / total : null;
  const regretGap = (scored.length && total)
    ? (correct.length / scored.length - correct.length / total) : null;

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Batch complete: ${total} tasks`);
  console.log(`  PASS: ${pass.length}`);
  console.log(`  GATE_BLOCK: ${blocks.length}`);
  console.log(`  SKIPPED: ${skipped.length}`);
  if (scored.length > 0) {
    console.log(`  Score (commits only): ${scoreCommits}`);
    console.log(`  Score (commit-all, abstention priced): ${scoreCommitAll}`);
    console.log(`  Commit rate: ${(commitRate * 100).toFixed(1)}%`);
    console.log(`  Regret gap: ${regretGap >= 0 ? "+" : ""}${regretGap.toFixed(3)}`);
    if (commitRate < 1) {
      console.log(`  !!! ABSTENTION AUDIT TRIGGER: commit_rate < 100% — re-run the JA4 audit`);
      console.log(`      (trial-abstention/audit.mjs) before quoting the headline score.`);
    }
  }
  if (blocks.length > 0) {
    console.log(`\nGate blocks:`);
    for (const b of blocks) console.log(`  ${b.id}: ${b.gate}`);
  }

  if (args.out) {
    // Don't include answers in the output file (blindness).
    const safe = results.map(({ answer, ...r }) => r);
    writeFileSync(args.out, JSON.stringify({ summary: { total, pass: pass.length, blocks: blocks.length, skipped: skipped.length, score: scoreCommits, score_commit_all: scoreCommitAll, commit_rate: commitRate, regret_gap: regretGap }, results: safe }, null, 2) + "\n");
    console.log(`\nResults written to ${args.out} (answers excluded for blindness)`);
  }

  // Resolve calibration outcomes (§8.2): for each scored task, update the
  // pending calibration log entry with outcome true/false.
  if (answers) {
    try {
      const calLog = join(HERE, "calibration-log.jsonl");
      if (existsSync(calLog)) {
        const lines = readFileSync(calLog, "utf8").split("\n");
        const byTask = new Map();
        for (const r of scored) byTask.set(r.id, r.correct);
        let resolved = 0;
        const updated = lines.map((line) => {
          const t = line.trim();
          if (!t || t.startsWith("#")) return line;
          try {
            const rec = JSON.parse(t);
            if (rec.outcome === null && rec.task_id && byTask.has(rec.task_id)) {
              rec.outcome = byTask.get(rec.task_id);
              resolved++;
              return JSON.stringify(rec);
            }
          } catch {}
          return line;
        });
        writeFileSync(calLog, updated.join("\n"));
        console.log(`Calibration: resolved ${resolved} pending outcomes`);
      }
    } catch (e) {
      console.warn(`Calibration resolution failed: ${e.message}`);
    }
  }
}

main();
