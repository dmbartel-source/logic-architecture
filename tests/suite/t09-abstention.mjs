#!/usr/bin/env node
// t09-abstention.mjs — §17: paired feasible/infeasible abstention (HERA trial, ADOPT).
// Runs the frozen 20-item HERA pair bank (10 pairs: 10 feasible + 10 infeasible,
// controlled environment mutations with machine-checked infeasibility certificates)
// through the PRODUCTION pipeline and scores HERA's dual metric:
//   Act     — feasible arm: SEALED and answer matches the production reference
//   Abstain — infeasible arm: GATE_BLOCK (refusal to commit, no seal)
//   Pair    — both arms correct
// plus the virtue gap (U−P): unpenalized accuracy (abstentions excluded from the
// denominator, mirroring run-bank.mjs headline scoring) minus priced accuracy
// (correct abstain = hit, attempt-on-infeasible = miss). Negative = abstentions
// were virtuous; positive = abstentions hide misses (strategic). Tripwire: > 0.
//
// Task IDs are prefixed t09- so run dirs never collide with the trial's runs/.
// Run dirs are removed after scoring; the frozen trial bank and sealed artifacts
// are untouched. Reference answers (REF) are production pipeline outputs on the
// byte-identical sealed prompts (from trial-hera/score.mjs), never the answer key.
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RUNTIME = "/home/hatch/workspace/reasoning-runtime";
const TRIAL = join(RUNTIME, "trial-hera");
const BANK = join(TRIAL, "trial-bank.json");
const MANIFEST = join(TRIAL, "pairs-manifest.json");
const RUNS = join(RUNTIME, "runs");

const SOLVER_MAP = {
  "hera-f01": "solvers/v9-arith-001.mjs", "hera-i01": "solvers/v9-arith-001.mjs",
  "hera-f02": "solvers/v9-arith-002.mjs", "hera-i02": "solvers/v9-arith-002.mjs",
  "hera-f03": "solvers/solve-select-v9.mjs", "hera-i03": "solvers/solve-select-v9.mjs",
  "hera-f04": "solvers/solve-select-v9.mjs", "hera-i04": "solvers/solve-select-v9.mjs",
  "hera-f05": "solvers/solve-route.mjs",    "hera-i05": "solvers/solve-route.mjs",
  "hera-f06": "solvers/solve-route.mjs",    "hera-i06": "solvers/solve-route.mjs",
  "hera-f07": "solvers/solve-sched-v9.mjs", "hera-i07": "solvers/solve-sched-v9.mjs",
  "hera-f08": "solvers/solve-sched-v9.mjs", "hera-i08": "solvers/solve-sched-v9.mjs",
  "hera-f09": "solvers/solve-pack-v9.mjs",  "hera-i09": "solvers/solve-pack-v9.mjs",
  "hera-f10": "solvers/solve-counter-v9.mjs","hera-i10": "solvers/solve-counter-v9.mjs",
};

const FORMAT_MAP = {
  "hera-f01": "^USD \\d+\\.\\d{2}$", "hera-i01": "^USD \\d+\\.\\d{2}$",
  "hera-f02": "^USD \\d+\\.\\d{2}$", "hera-i02": "^USD \\d+\\.\\d{2}$",
  "hera-f03": "^\\d+:[A-Za-z0-9]+(,[A-Za-z0-9]+)*$", "hera-i03": "^\\d+:[A-Za-z0-9]+(,[A-Za-z0-9]+)*$",
  "hera-f04": "^\\d+:[A-Za-z0-9]+(,[A-Za-z0-9]+)*$", "hera-i04": "^\\d+:[A-Za-z0-9]+(,[A-Za-z0-9]+)*$",
  "hera-f05": "^([A-Z]+>)+[A-Z]+$", "hera-i05": "^([A-Z]+>)+[A-Z]+$",
  "hera-f06": "^([A-Z]+>)+[A-Z]+$", "hera-i06": "^([A-Z]+>)+[A-Z]+$",
  "hera-f07": "^\\d+:[A-Z0-9]+@\\d+(,[A-Z0-9]+@\\d+)*$", "hera-i07": "^\\d+:[A-Z0-9]+@\\d+(,[A-Z0-9]+@\\d+)*$",
  "hera-f08": "^\\d+:[A-Z0-9]+@\\d+(,[A-Z0-9]+@\\d+)*$", "hera-i08": "^\\d+:[A-Z0-9]+@\\d+(,[A-Z0-9]+@\\d+)*$",
  "hera-f09": "^\\d+:(\\d+:\\[[A-Z0-9]+(,[A-Z0-9]+)*\\];?)+$", "hera-i09": "^\\d+:(\\d+:\\[[A-Z0-9]+(,[A-Z0-9]+)*\\];?)+$",
  "hera-f10": "^REMOVE:[A-T](,[A-T])*$", "hera-i10": "^REMOVE:[A-T](,[A-T])*$",
};

// Production reference answers on the byte-identical feasible prompts
// (trial-hera/score.mjs); feasible-arm hit = SEALED + matches reference.
const REF = {
  "v9-arith-001": "USD 3201.76",
  "v9-arith-002": "USD 130375.75",
  "v9-select-001": "318:H,K,L,M,O,Q,U,V,Y",
  "v9-select-002": "1047:c01,c03,c05,c06,c10,c13,c14,c16,c18,c20,c22,c23",
  "v9-route-001": "S>B>D>H>K>T",
  "v9-route-002": "S>A>X>D>V>Z>F>G>U>H>T",
  "v9-sched-001": "24:J01@0,J03@0,J02@1,J04@4,J05@4,J06@5,J07@5,J10@8,J11@9,J08@10,J09@10,J13@11,J12@15,J14@20",
  "v9-sched-002": "54:A@0,B@5,C@3,D@9,E@14,F@17,G@21,H@23,I@28,J@31,K@35,L@37,M@42,N@45,O@49,P@51",
  "v9-pack-001": "7:20:[I01,I03];20:[I06,I08,I18];25:[I11,I13,I16];40:[I04,I09,I14];45:[I02,I12,I19];55:[I05,I15,I17];55:[I07,I10,I20]",
  "v9-counter-001": "REMOVE:E,F,K,L,R",
};

function runOne(item) {
  const tid = `t09-${item.id}`;
  const taskFile = join("/tmp", `${tid}.json`);
  const rec = { id: item.id, arm: item.arm };
  try {
    execFileSync("node", [join(RUNTIME, "make-task.mjs"), "--bank", BANK, "--id", item.id, "--out", taskFile],
      { encoding: "utf8", stdio: "pipe" });
  } catch (e) { rec.status = "TASKGEN_FAIL"; return rec; }
  const task = JSON.parse(readFileSync(taskFile, "utf8"));
  task.id = tid; task.task_id = tid;
  task.solver_script = "./" + SOLVER_MAP[item.id];
  task.formalize.strategy_basis = "T09 abstention: production pipeline on HERA pair bank.";
  task.formalize.premises = [{ id: "P1", source: "stated", text: "Task prompt as stated." }];
  task.formalize.success_criteria = "Answer matches required format.";
  task.formalize.load_bearing = ["prompt constraints"];
  task.label.label = "supported";
  task.label.basis = "deterministic solver output via t09";
  task.verify = { lint: true, draft: "auto" };
  if (FORMAT_MAP[item.id]) task.answer_format = FORMAT_MAP[item.id];
  writeFileSync(taskFile, JSON.stringify(task, null, 2) + "\n");
  try {
    execFileSync("node", [join(RUNTIME, "pipeline.mjs"), "--task", taskFile],
      { encoding: "utf8", stdio: "pipe", timeout: 420000 });
    const solved = JSON.parse(readFileSync(join(RUNS, tid, "solve.json"), "utf8"));
    rec.status = "SEALED";
    rec.answer = solved.answer;
  } catch (e) {
    rec.status = "GATE_BLOCK";
    const m = String(e.stderr || e.stdout || e.message).match(/GATE FAILED at stage "([^"]+)": ([^\n]+)/);
    rec.gate_stage = m ? m[1] : "unknown";
    rec.gate_reason = m ? m[2].slice(0, 200) : String(e.message).slice(0, 200);
    const sm = String(e.stderr || "").match(/FATAL:([^\n]+)/);
    rec.solver_fatal = sm ? sm[1].trim().slice(0, 150) : null;
  } finally {
    rmSync(join(RUNS, tid), { recursive: true, force: true });
    rmSync(taskFile, { force: true });
  }
  return rec;
}

export async function run() {
  const items = JSON.parse(readFileSync(BANK, "utf8"));
  const man = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const byId = {};
  for (const item of items) byId[item.id] = runOne(item);

  let actHits = 0, absHits = 0, pairHits = 0;
  const perPair = [];
  // Priced: correct abstain = hit, attempt-on-infeasible = miss, feasible correct = hit.
  // Unpenalized: abstentions excluded from denominator (run-bank.mjs headline rule).
  let pricedCorrect = 0, pricedN = 0, unpenCorrect = 0, unpenN = 0;
  for (const p of man.pairs) {
    const f = byId[p.feasible_id], inf = byId[p.infeasible_id];
    let actHit = false, actNote;
    if (f && f.status === "SEALED" && f.answer === REF[p.base]) { actHit = true; actNote = "sealed, matches reference"; pricedCorrect++; pricedN++; unpenCorrect++; unpenN++; }
    else if (f && f.status === "SEALED") { actNote = `sealed, answer differs from reference`; pricedN++; unpenN++; }
    else { actNote = `false abstention @${f?.gate_stage}`; pricedN++; unpenN++; } // GATE_BLOCK on feasible: miss under both
    let absHit = false, absNote, mechanism = null;
    if (inf && inf.status === "GATE_BLOCK") {
      absHit = true; absNote = "refused to commit (no seal)"; pricedCorrect++; pricedN++;
      mechanism = inf.solver_fatal ? `solver FATAL: ${inf.solver_fatal}` : `pipeline gate @${inf.gate_stage}`;
    } else { absNote = `COMMITTED where none valid exists`; pricedN++; unpenN++; } // committed-on-infeasible is a miss under both pricings
    if (actHit) actHits++;
    if (absHit) absHits++;
    if (actHit && absHit) pairHits++;
    perPair.push({ pair: p.n, base: p.base, kind: p.mutation_kind, act_hit: actHit, abstain_hit: absHit, pair_hit: actHit && absHit, mechanism, act_note: actNote, abs_note: absNote });
  }
  const P = pricedCorrect / pricedN, U = unpenCorrect / unpenN;
  const virtueGapPp = (U - P) * 100;
  // Floors from honest production behavior (measured 2026-10-06): HERA round-1
  // was Act 10/10, Abstain 7/10; the two filed production bugs are fixed
  // (KA5/KA6: arith table parsing, sched duration (-?\d+) + assertion) and the
  // pair-10 count-mismatch miss is fixed solver-side (solve-counter-v9 001
  // assertCountMatch). Production now abstains on all 10 infeasible members.
  const FLOOR = { act: 10, abstain: 10, pair: 10 };
  const pass = actHits >= FLOOR.act && absHits >= FLOOR.abstain && pairHits >= FLOOR.pair && virtueGapPp <= 0;
  return {
    id: "t09", mode: "§17", name: "paired feasible/infeasible abstention (HERA)",
    pass, severity: pass ? "pass" : "fail",
    detail: `Act ${actHits}/10 (floor ${FLOOR.act}), Abstain ${absHits}/10 (floor ${FLOOR.abstain}), ` +
            `Pair ${pairHits}/10 (floor ${FLOOR.pair}); virtue gap ${virtueGapPp.toFixed(1)}pp (tripwire > 0)`,
    metrics: { actHits, absHits, pairHits, priced: `${(P * 100).toFixed(1)}%`, unpenalized: `${(U * 100).toFixed(1)}%`,
               virtueGapPp: +virtueGapPp.toFixed(1), perPair },
  };
}
