// t07-linter.mjs — §5 modes 3 & 7: verification-shaped prose / uncertainty smoothing.
// The deterministic claim linter (lint-claims.mjs, §11.1) must stay clean on a
// well-formed sample and must flag a dirty sample (shape-words without trace,
// universal claims without domains, unsurfaced assumptions).
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCmd, result } from "./util.mjs";

const LINT = "/home/hatch/workspace/logic-tools/lint-claims.mjs";

export async function run() {
  const dir = mkdtempSync(join(tmpdir(), "t07-"));
  writeFileSync(join(dir, "clean.txt"),
    "The archive export hashes to 9f2c41 via sha256sum [MC-3], trace: sandbox://workspace/export.zip.\n" +
    "All 8 downloaded zips passed checksum verification.\n" +
    "We assume (assumed): the vendor API returns prices in USD.\n");
  writeFileSync(join(dir, "dirty.txt"),
    "The module was thoroughly tested and confirmed working.\n" +
    "All requests always succeed.\n" +
    "We assume the cache is warm.\n");

  const clean = await runCmd("node", [LINT, "--file", join(dir, "clean.txt")]);
  const dirty = await runCmd("node", [LINT, "--file", join(dir, "dirty.txt")]);
  const dirtyFlags = dirty.stdout.split("\n").filter(l => l.trim()).length;

  const cleanOk = clean.code === 0;
  const dirtyOk = dirty.code === 1 && dirtyFlags >= 2;
  const pass = cleanOk && dirtyOk;
  return result(
    "t07", "mode-3/7", "claim linter discrimination (lint-claims)",
    pass,
    `clean sample: ${cleanOk ? "0 flags (exit 0)" : "FALSE FLAGS (exit " + clean.code + "): " + clean.stdout.slice(0, 200)}; ` +
    `dirty sample: ${dirtyOk ? dirtyFlags + " flags (exit 1)" : "MISSED (exit " + dirty.code + ", " + dirtyFlags + " flags)"}`,
    { cleanOk, dirtyFlags, dirtyCode: dirty.code }
  );
}
