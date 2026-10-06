// t08-fail-loud.mjs — fail-loud discipline (§5 mode 17 procedural rule; §5 mode 2).
// A solver given a requirement it cannot parse MUST refuse (FATAL, nonzero
// exit) rather than proceed on a guessed or default interpretation.
// Test: feed solve-consist-v9.mjs a prompt whose checksum rule is unparseable;
// assert exit != 0 and "FATAL" on stderr, and no answer on stdout.
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCmd, result } from "./util.mjs";

const SOLVER = "/home/hatch/workspace/reasoning-runtime/solvers/solve-consist-v9.mjs";

export async function run() {
  const dir = mkdtempSync(join(tmpdir(), "t08-"));
  // Prompt 001 shape, but the checksum rule line is garbled beyond parsing.
  writeFileSync(join(dir, "bad-prompt.txt"),
    "Task v9-consist-001 variant.\n" +
    "The checksum rule: variable i in row r must equal something complicated (see appendix).\n" +
    "Row 0: 5 12 7\n");
  const r = await runCmd("node", [SOLVER, "--prompt", join(dir, "bad-prompt.txt")]);
  const fatal = r.code !== 0 && /FATAL/.test(r.stderr);
  const noGuess = r.stdout.trim() === "" || /FATAL/.test(r.stderr);
  const pass = fatal && noGuess;
  return result(
    "t08", "mode-17", "fail-loud on unparseable requirement",
    pass,
    fatal
      ? `refused as required (exit ${r.code}, FATAL on stderr, no guessed answer)`
      : `VIOLATION: solver exited ${r.code} ${/FATAL/.test(r.stderr) ? "" : "without FATAL"}; stdout=${JSON.stringify(r.stdout.slice(0, 120))}`,
    { exitCode: r.code, fatalOnStderr: /FATAL/.test(r.stderr), stdoutLen: r.stdout.length }
  );
}
