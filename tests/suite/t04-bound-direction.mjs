// t04-bound-direction.mjs — §5 mode 16: inverted bound pruning.
// The checker (bound-check.mjs) must FLAG the v5 bug pattern
// (`if -score < best: prune` in a maximization — kills the best branches)
// and must CLEAR a correct prune (`bound <= incumbent` for max).
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCmd, result } from "./util.mjs";

const CHECK = "/home/hatch/workspace/reasoning-runtime/bound-check.mjs";

export async function run() {
  const dir = mkdtempSync(join(tmpdir(), "t04-"));
  writeFileSync(join(dir, "spec.json"), JSON.stringify({
    objective: "max", bound_kind: "upper",
    bound_description: "relaxed LP bound: valid overestimate of achievable score"
  }));
  writeFileSync(join(dir, "cases.json"), JSON.stringify([
    { bound: 103, incumbent: 85, branch_contains_optimum: true, note: "branch can reach 103" },
    { bound: 70, incumbent: 85, branch_contains_optimum: false, note: "branch capped at 70" }
  ]));
  // Bad: the v5 inverted pattern — prunes exactly when the branch is GOOD.
  writeFileSync(join(dir, "bad.mjs"),
    `export function shouldPrune(bound, incumbent){ const score = bound; const best = incumbent;\n` +
    `  if (-score < best) { return true; } // prune\n  return false; }\n`);
  // Good: prune only when the upper bound cannot beat the incumbent.
  writeFileSync(join(dir, "good.mjs"),
    `export function shouldPrune(bound, incumbent){\n` +
    `  if (bound <= incumbent) { return true; } // prune: cannot beat incumbent\n  return false; }\n`);

  const bad = await runCmd("node", [CHECK, "--spec", join(dir, "spec.json"), "--prune", join(dir, "bad.mjs"), "--cases", join(dir, "cases.json")]);
  const good = await runCmd("node", [CHECK, "--spec", join(dir, "spec.json"), "--prune", join(dir, "good.mjs"), "--cases", join(dir, "cases.json")]);

  const flagsBad = bad.code === 1;
  const clearsGood = good.code === 0;
  const pass = flagsBad && clearsGood;
  return result(
    "t04", "mode-16", "inverted bound pruning (bound-check)",
    pass,
    `inverted v5-pattern prune: ${flagsBad ? "FLAGGED (exit 1)" : "MISSED (exit " + bad.code + ")"}; ` +
    `correct prune: ${clearsGood ? "CLEAR (exit 0)" : "FALSE ALARM (exit " + good.code + ")"}`,
    { flagsBad, clearsGood, badCode: bad.code, goodCode: good.code }
  );
}
