// t02-optimum-selection.mjs — mode 18 candidate: non-canonical optimum selection.
// Replays the input-equivalence trial results (20 tasks x reorder/rename/rephrase).
// Invariants: (1) no variant may ever produce a WRONG answer — divergences are
// only ever fail-loud (FATAL) or different-but-equally-valid (OBJ_SAME/SET_SAME);
// (2) reorder divergence must stay at or below the trial baseline (1/20).
// A wrong-answer verdict or reorder regression = FAIL.
import { readFileSync } from "node:fs";
import { result } from "./util.mjs";

const RESULTS = "/home/hatch/workspace/architectures/literature/trial-input-equivalence/trial-results.json";
const ALLOWED = new Set(["CONSISTENT", "FATAL", "OBJ_SAME", "SET_SAME"]);
const REORDER_BASELINE = 1; // of 20, from the 2026-10-05 trial

export async function run() {
  const data = JSON.parse(readFileSync(RESULTS, "utf8"));
  const tasks = Object.keys(data);
  let reorderDiv = 0, wrong = [], unknownVerdicts = [];
  const byTransform = { reorder: 0, rename: 0, rephrase: 0 };
  for (const [tid, rec] of Object.entries(data)) {
    for (const [tr, v] of Object.entries(rec.variants)) {
      if (!ALLOWED.has(v.verdict)) { unknownVerdicts.push(`${tid}/${tr}:${v.verdict}`); wrong.push(`${tid}/${tr}`); continue; }
      if (v.verdict !== "CONSISTENT") {
        byTransform[tr]++;
        if (tr === "reorder") reorderDiv++;
      }
    }
  }
  const pass = wrong.length === 0 && reorderDiv <= REORDER_BASELINE;
  return result(
    "t02", "mode-18", "non-canonical optimum selection (input-equivalence)",
    pass,
    wrong.length
      ? `WRONG-ANSWER or unknown verdicts: ${wrong.join(", ")}`
      : `no wrong answers across ${tasks.length} tasks; reorder divergence ${reorderDiv}/20 ` +
        `(baseline ${REORDER_BASELINE}); rename ${byTransform.rename}, rephrase ${byTransform.rephrase} ` +
        `(fail-loud or equally-valid only)`,
    { tasks: tasks.length, reorderDiv, byTransform, wrong, unknownVerdicts }
  );
}
