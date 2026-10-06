#!/usr/bin/env node
// run-suite.mjs — Continuous architecture test suite runner.
// Executes every test in suite/, reports pass/fail per failure mode,
// writes a timestamped result to history/, and flags regressions
// (pass->fail) and fixes (fail->pass) vs the previous run.
//
// Usage: node run-suite.mjs [--json]
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SUITE = join(ROOT, "suite");
const HISTORY = join(ROOT, "history");

function latestRun() {
  if (!existsSync(HISTORY)) return null;
  const files = readdirSync(HISTORY).filter(f => f.startsWith("run-") && f.endsWith(".json")).sort();
  if (!files.length) return null;
  return JSON.parse(readFileSync(join(HISTORY, files[files.length - 1]), "utf8"));
}

async function main() {
  const jsonOut = process.argv.includes("--json");
  const started = new Date().toISOString();
  const prev = latestRun();
  const prevById = {};
  if (prev) for (const t of prev.tests) prevById[t.id] = t.pass;

  const files = readdirSync(SUITE).filter(f => /^t\d\d-.*\.mjs$/.test(f)).sort();
  const tests = [];
  for (const f of files) {
    const mod = await import(`./suite/${f}`);
    let res;
    try {
      res = await mod.run();
    } catch (e) {
      res = { id: f.slice(0, 3), mode: "suite", name: f, pass: false, severity: "fail",
              detail: `test harness error: ${e.message}`, metrics: {} };
    }
    const before = prevById[res.id];
    res.regression = before === true && res.pass === false;
    res.fixed = before === false && res.pass === true;
    tests.push(res);
  }

  const passed = tests.filter(t => t.pass).length;
  const failed = tests.filter(t => !t.pass);
  const regressions = tests.filter(t => t.regression);
  const run = { started, finished: new Date().toISOString(),
                summary: { total: tests.length, passed, failed: failed.length,
                           regressions: regressions.map(t => t.id) },
                tests };

  const stamp = started.replace(/[:.]/g, "-").slice(0, 19);
  writeFileSync(join(HISTORY, `run-${stamp}.json`), JSON.stringify(run, null, 1));

  if (jsonOut) { console.log(JSON.stringify(run, null, 1)); }
  else {
    console.log(`architecture-tests ${started} — ${passed}/${tests.length} pass`);
    for (const t of tests) {
      const flag = t.regression ? " REGRESSION" : t.fixed ? " (fixed)" : "";
      console.log(`  [${t.pass ? "PASS" : "FAIL"}] ${t.id} ${t.mode}: ${t.name}${flag}\n        ${t.detail}`);
    }
    if (regressions.length) console.log(`REGRESSIONS vs last run: ${regressions.map(t => t.id).join(", ")}`);
  }
  process.exit(failed.length ? 1 : 0);
}

main();
