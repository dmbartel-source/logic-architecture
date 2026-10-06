// t01-elision.mjs — §5 mode 17: requirement elision.
// Runs the frozen elision checker over the 16-task F1 blinded bank
// (8 planted silent-drop cases, 8 decorative-only controls).
// Pass criteria (from the honest F1 result): recall on planted >= 3/8,
// false blocks on controls <= 1/8. The mechanical check was REJECTED as a
// mandatory gate (§19: 50% recall, 12% FP) — this test tracks the checker's
// behavior for regression, it does not gate the pipeline.
import { readFileSync } from "node:fs";
import { runCmd, result } from "./util.mjs";

const TRIAL = "/home/hatch/workspace/reasoning-runtime/elision-trial";
const CHECK = "/home/hatch/workspace/reasoning-runtime/elision-check.mjs";

export async function run() {
  const key = JSON.parse(readFileSync(`${TRIAL}/key.json`, "utf8"));
  let recallHits = 0, planted = 0, falseBlocks = 0, controls = 0;
  const perTask = {};
  for (const [tid, meta] of Object.entries(key)) {
    const r = await runCmd("node", [CHECK, `${TRIAL}/${tid}.json`, "--json"]);
    // Exit 0 = all acknowledged; exit 2 = elision(s) flagged.
    const flagged = r.code === 2;
    perTask[tid] = flagged ? "flagged" : "clear";
    if (meta.elided) { planted++; if (flagged) recallHits++; }
    else { controls++; if (flagged) falseBlocks++; }
  }
  const recallOk = recallHits >= 3;
  const fpOk = falseBlocks <= 1;
  const pass = recallOk && fpOk;
  return result(
    "t01", "mode-17", "requirement-elision (frozen checker)",
    pass,
    `recall ${recallHits}/${planted} on planted drops (floor 3/8); ` +
    `false blocks ${falseBlocks}/${controls} on controls (ceiling 1/8)`,
    { recallHits, planted, falseBlocks, controls, perTask }
  );
}
