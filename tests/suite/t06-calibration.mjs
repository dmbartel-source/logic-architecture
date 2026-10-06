// t06-calibration.mjs — §5 mode 8: calibration drift.
// Runs calibrate.mjs over the live calibration logs (manual + runtime).
// Per §8.3, a label with n>=20 resolved predictions OUTSIDE its band is a
// FAIL (recalibration due); out-of-band with n<20 is advisory (warn only).
// This test FAILS LOUDLY on real drift — it is the suite's tripwire for §8.
//
// Known/understood drift (documented, not a suite bug):
// - Manual log `supported` 133/133 (100%) vs 80–95%: labeling-threshold
//   artifact — the assistant never uses `verified`, so ~100%-certain claims
//   get labeled `supported`; the log is also selection-biased (zero failures
//   ever recorded). See calibration-recalibration-2026-10-06.md.
// - Runtime log `plausible` 65/74 (87.8%) vs 50–80%: real underconfidence in
//   the runtime's `plausible` labeling (flagged per §8.3, XConf trial §6).
//   FIX APPLIED 2026-10-06: run-bank.mjs now uses XConf-based labeling
//   (heuristicLabel) — strategy (100% recall) → `supported`, critique
//   (78.6% recall) → `plausible`. Historical entries retain their original
//   labels; the drift will resolve as new correctly-labeled data accumulates.
// The test reports these as FAIL with the diagnosis attached; a FAIL here
// means "recalibration attention due," not "suite broken."
import { runCmd, result } from "./util.mjs";

const CAL = "/home/hatch/workspace/logic-tools/calibrate.mjs";
const LOGS = [
  { path: "/home/hatch/workspace/logic-tools/calibration-log.jsonl", name: "manual" },
  { path: "/home/hatch/workspace/reasoning-runtime/calibration-log.jsonl", name: "runtime" },
];
const MIN_N = 20;

function parseTable(stdout) {
  const out = [];
  for (const line of stdout.split("\n")) {
    const m = line.match(/^(\w+)\s+(\d+)\s+(\d+)\s+([\d.]+)%\s+([\d.]+)%[–-]([\d.]+)%\s+([\d.]+)%\s+(.*)$/);
    if (m) out.push({ label: m[1], n: +m[2], hits: +m[3], rate: +m[4], lo: +m[5], hi: +m[6], recall: +m[7], status: m[8].trim() });
  }
  return out;
}

export async function run() {
  const allDrifted = [];
  const allAdvisory = [];
  const perLog = {};
  for (const { path, name } of LOGS) {
    const r = await runCmd("node", [CAL, "--log", path]);
    const rows = parseTable(r.stdout);
    perLog[name] = rows;
    for (const o of rows) {
      if (o.status.includes("OUT OF BAND")) {
        const entry = `${name}:${o.label} ${o.hits}/${o.n}=${o.rate}% vs band ${o.lo}–${o.hi}% (xconf ${o.recall}%)`;
        if (o.n >= MIN_N) allDrifted.push(entry);
        else allAdvisory.push(entry);
      }
    }
  }
  const pass = allDrifted.length === 0;
  return result(
    "t06", "mode-8", "calibration drift (hit-rate bands, manual + runtime)",
    pass,
    pass
      ? `all labels with n>=${MIN_N} in band on both logs` +
        (allAdvisory.length ? `; advisory (n<20): ${allAdvisory.join("; ")}` : "")
      : `DRIFT — recalibration attention due per §8.3: ${allDrifted.join("; ")}` +
        (allAdvisory.length ? ` | advisory (n<20): ${allAdvisory.join("; ")}` : ""),
    { perLog, drifted: allDrifted, advisory: allAdvisory },
    allDrifted.length ? "fail" : "fail"
  );
}
