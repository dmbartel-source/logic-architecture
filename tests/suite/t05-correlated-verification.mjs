// t05-correlated-verification.mjs — §5 mode 15: correlated verification.
// The combiner (verifier-comb.mjs) must mark an assumption WEAK when its only
// falsifiers share the assumption's implementation (the v3-sched-002 pattern:
// two "independent" checks agreeing because both stringified the same way),
// and must mark it COVERED when a genuinely independent falsifier exists.
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCmd, result } from "./util.mjs";

const COMB = "/home/hatch/workspace/reasoning-runtime/verifier-comb.mjs";

export async function run() {
  const dir = mkdtempSync(join(tmpdir(), "t05-"));
  // Correlated plan: both verifiers reuse key-fn-v1, the same implementation
  // that embodies assumption A1. Agreement here is not evidence.
  writeFileSync(join(dir, "correlated.json"), JSON.stringify({
    assumptions: [{ id: "A1", description: "comparison key matches spec order", implementation: "key-fn-v1" }],
    verifiers: [
      { name: "primary-solve", falsifies: ["A1"], implementation: "key-fn-v1" },
      { name: "independent-resolve", falsifies: ["A1"], implementation: "key-fn-v1" }
    ]
  }));
  // Independent plan: the re-check uses a hand-check from the spec's words.
  writeFileSync(join(dir, "independent.json"), JSON.stringify({
    assumptions: [{ id: "A1", description: "comparison key matches spec order", implementation: "key-fn-v1" }],
    verifiers: [
      { name: "primary-solve", falsifies: ["A1"], implementation: "key-fn-v1" },
      { name: "spec-hand-check", falsifies: ["A1"], implementation: "hand-check" }
    ]
  }));

  const corr = await runCmd("node", [COMB, "--plan", join(dir, "correlated.json")]);
  const indep = await runCmd("node", [COMB, "--plan", join(dir, "independent.json")]);
  let corrReport = {}, indepReport = {};
  try { corrReport = JSON.parse(corr.stdout); } catch {}
  try { indepReport = JSON.parse(indep.stdout); } catch {}

  const flagsCorrelated = corr.code === 1 && (corrReport.coverage?.[0]?.status === "WEAK");
  const clearsIndependent = indep.code === 0 && (indepReport.coverage?.[0]?.status === "COVERED");
  const pass = flagsCorrelated && clearsIndependent;
  return result(
    "t05", "mode-15", "correlated verification (verifier-comb)",
    pass,
    `shared-implementation plan: ${flagsCorrelated ? "WEAK as required (exit 1)" : "NOT flagged (exit " + corr.code + ")"}; ` +
    `independent-falsifier plan: ${clearsIndependent ? "COVERED (exit 0)" : "not covered (exit " + indep.code + ")"}`,
    { flagsCorrelated, clearsIndependent, corrStatus: corrReport.coverage?.[0]?.status, indepStatus: indepReport.coverage?.[0]?.status }
  );
}
