// util.mjs — shared helpers for the architecture test suite.
import { execFile } from "node:child_process";

export function runCmd(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 60000, maxBuffer: 4 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      resolve({ code: err ? (err.code ?? 1) : 0, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
    });
  });
}

export function result(id, mode, name, pass, detail, metrics = {}, severity = "fail") {
  return { id, mode, name, pass, detail, metrics, severity };
}
