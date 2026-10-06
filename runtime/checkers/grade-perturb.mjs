#!/usr/bin/env node
// Grading-rigidity audit (JW2 trial, 2026-10-06).
// Re-scores SAVED solver outputs (runs/<task-id>/solve.json — the answers that
// produced the final 50/50 on v9 and v10) under perturbed graders.
// Sealed banks, labels, and envelopes are NEVER modified; answer keys are read
// only for grading comparison.
//
// Graders:
//   g0     = current production grading (replica):
//            v9/v10: trim+lowercase exact equality;
//            v9-counter-003: validity+objective dual scoring (Mode-18 mitigation);
//            v10-mult-004/005: any-optimum membership.
//   g_strict = byte-exact equality, zero normalization. For the special-case
//            tasks: counter-003 must byte-equal the canonical key string;
//            mult-004/005 must byte-equal one stored optimum (no norm).
//   g_loose  = aggressive formatting forgiveness:
//            lowercase, strip ALL whitespace, strip currency tokens ($, usd, eur),
//            strip thousands-separator commas; single-number answers compared
//            numerically with relative tolerance 1e-9. Numeric tolerance does NOT
//            accept wrong values (96.12 vs 96.124991 still fails: rel diff 5e-5).
//
// Usage: node grade-perturb.mjs --bank v9|v10 [--out results.json]

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RR = HERE; // reasoning-runtime (production location)
const RUNS = join(RR, "runs");

function loadJSON(p) { return JSON.parse(readFileSync(p, "utf8")); }

function parseArgs(argv) {
  const a = { bank: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--bank") a.bank = argv[++i];
    else if (argv[i] === "--out") a.out = argv[++i];
  }
  if (!["v9", "v10"].includes(a.bank)) { console.error("--bank v9|v10 required"); process.exit(2); }
  return a;
}

// ---------- bank loading ----------
// Production location: ~/workspace/reasoning-runtime/grade-perturb.mjs
// Banks at ~/workspace/reasoning-benchmark-v{9,10}/ (one level up from HERE).
function loadBank(bank) {
  if (bank === "v9") {
    const bench = loadJSON(join(HERE, "..", "reasoning-benchmark-v9", "benchmark-v9.json"));
    const prompts = loadJSON(join(HERE, "..", "reasoning-benchmark-v9", "prompts-v9.json"));
    const tasks = bench.filter((t) => t.split === "heldout-v9");
    return tasks.map((t) => ({ id: t.id, category: t.category, expected: t.answer, prompt: prompts[t.id] || t.prompt || "" }));
  }
  const bench = loadJSON(join(HERE, "..", "reasoning-benchmark-v10", "benchmark-v10.json"));
  const prompts = loadJSON(join(HERE, "..", "reasoning-benchmark-v10", "prompts-v10.json"));
  const tasks = bench.filter((t) => (t.split || "").startsWith("heldout"));
  return tasks.map((t) => ({ id: t.id, category: t.category, expected: t.answer, prompt: prompts[t.id] || t.prompt || "" }));
}

function solverAnswer(id) {
  const p = join(RUNS, id, "solve.json");
  if (!existsSync(p)) return { found: false };
  const d = loadJSON(p);
  return { found: true, answer: d.answer };
}

// ---------- graders ----------
const norm0 = (s) => String(s).trim().toLowerCase();

// v9-counter-003 validity+objective dual scoring (copied from run-bank.mjs; key's
// structural content never consulted beyond aggregate objectives).
function msWith2Machine(dur, prec) {
  const preds = {};
  for (const id of Object.keys(dur)) preds[id] = new Set();
  for (const [a, b] of prec) preds[b].add(a);
  const done = {}, running = {};
  const mfree = [0, 0];
  let t = 0;
  const ids = Object.keys(dur);
  while (Object.keys(done).length < ids.length) {
    for (const j of Object.keys(running)) { if (running[j] <= t) { done[j] = running[j]; delete running[j]; } }
    if (Object.keys(done).length === ids.length) break;
    const ready = ids.filter((j) => !(j in done) && !(j in running) && [...preds[j]].every((p) => p in done));
    ready.sort((x, y) => dur[y] - dur[x] || (x < y ? -1 : 1));
    for (let k = 0; k < 2; k++) { if (mfree[k] <= t && ready.length) { const j = ready.shift(); const e = t + dur[j]; running[j] = e; mfree[k] = e; } }
    if (!Object.keys(running).length) throw new Error("scheduling deadlock");
    t = Math.min(...Object.values(running));
  }
  return Math.max(...Object.values(done));
}
function dualScoreCounter003(promptText, solvedAnswer, expectedAnswer) {
  const km = /^(\d+)>(\d+):/.exec(String(expectedAnswer).trim());
  const am = /^(\d+)>(\d+):(.+)$/.exec(String(solvedAnswer).trim());
  if (!km || !am) return false;
  if (+am[1] !== +km[1] || +am[2] !== +km[2]) return false;
  const dur = {};
  for (const m of promptText.matchAll(/(J\d+):\s*(\d+)/g)) dur[m[1]] = +m[2];
  const prec = [...promptText.matchAll(/(J\d+)>(J\d+)/g)].map((m) => [m[1], m[2]]);
  const precSet = new Set(prec.map(([a, b]) => `${a}>${b}`));
  const nMatch = /which (\d+) precedence constraints/.exec(promptText);
  const n = nMatch ? +nMatch[1] : 5;
  const emitted = am[3].split(",").map((s) => s.trim()).filter(Boolean);
  if (emitted.length !== n || new Set(emitted).size !== emitted.length) return false;
  for (const e of emitted) if (!precSet.has(e)) return false;
  const removal = new Set(emitted);
  const kept = prec.filter(([a, b]) => !removal.has(`${a}>${b}`));
  return +km[1] - msWith2Machine(dur, kept) === +km[2];
}

const V9_DUAL = new Set(["v9-counter-003"]);
const V10_ANYOPT = new Set(["v10-mult-004", "v10-mult-005"]);

function g0(task, ans) {
  const exp = task.expected;
  if (V9_DUAL.has(task.id)) return dualScoreCounter003(task.prompt, ans, exp);
  if (V10_ANYOPT.has(task.id)) {
    try { const arr = JSON.parse(exp); if (Array.isArray(arr)) return arr.map(norm0).includes(norm0(ans)); } catch {}
  }
  return norm0(ans) === norm0(exp);
}

function gStrict(task, ans) {
  const exp = String(task.expected);
  const a = String(ans);
  if (V9_DUAL.has(task.id)) return a === exp; // canonical key string only
  if (V10_ANYOPT.has(task.id)) {
    try { const arr = JSON.parse(exp); if (Array.isArray(arr)) return arr.map(String).includes(a); } catch {}
  }
  return a === exp;
}

// Loose: aggressive formatting forgiveness, tight numeric tolerance.
function looseNorm(s) {
  let t = String(s).toLowerCase();
  t = t.replace(/\s+/g, "");
  t = t.replace(/[$€£]/g, "");
  t = t.replace(/\busd\b|\beur\b|\bgbp\b/g, "");
  t = t.replace(/,/g, ""); // thousands separators (documented: also merges list commas)
  return t;
}
function asSingleNumber(t) {
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return parseFloat(t);
  return null;
}
function gLoose(task, ans) {
  const exp = task.expected;
  if (V9_DUAL.has(task.id)) {
    // Validity+objective scoring already ignores surface form entirely —
    // it IS the maximally loose position for this task. Reuse unchanged.
    return dualScoreCounter003(task.prompt, ans, exp);
  }
  if (V10_ANYOPT.has(task.id)) {
    try {
      const arr = JSON.parse(exp);
      if (Array.isArray(arr)) {
        const la = looseNorm(ans);
        return arr.some((e) => {
          const le = looseNorm(e);
          const na = asSingleNumber(la), ne = asSingleNumber(le);
          if (na !== null && ne !== null) return Math.abs(na - ne) <= 1e-9 * Math.max(1, Math.abs(ne));
          return la === le;
        });
      }
    } catch {}
  }
  const la = looseNorm(ans), le = looseNorm(exp);
  const na = asSingleNumber(la), ne = asSingleNumber(le);
  if (na !== null && ne !== null) return Math.abs(na - ne) <= 1e-9 * Math.max(1, Math.abs(ne));
  return la === le;
}

// ---------- main ----------
const args = parseArgs(process.argv.slice(2));
const tasks = loadBank(args.bank);
const rows = [];
let missing = 0;
for (const t of tasks) {
  const s = solverAnswer(t.id);
  if (!s.found) { missing++; rows.push({ id: t.id, category: t.category, status: "NO_SOLVE_JSON", g0: null, gStrict: null, gLoose: null }); continue; }
  const r0 = g0(t, s.answer), rs = gStrict(t, s.answer), rl = gLoose(t, s.answer);
  rows.push({
    id: t.id, category: t.category, status: "SCORED",
    g0: r0, gStrict: rs, gLoose: rl,
    strictFlip: r0 && !rs,   // over-credited by normalization leniency
    looseFlip: !r0 && rl,    // under-credited by grading rigidity
    answer: String(s.answer), expected: String(t.expected),
  });
}
const scored = rows.filter((r) => r.status === "SCORED");
const cnt = (f) => scored.filter(f).length;
const summary = {
  bank: args.bank, tasks: tasks.length, scored: scored.length, missing,
  g0_pass: cnt((r) => r.g0), gStrict_pass: cnt((r) => r.gStrict), gLoose_pass: cnt((r) => r.gLoose),
  strict_downswing: cnt((r) => r.strictFlip), loose_upswing: cnt((r) => r.looseFlip),
};
console.log(JSON.stringify(summary, null, 2));
console.log("--- strict flips (PASS under g0, FAIL under byte-exact) ---");
for (const r of scored.filter((r) => r.strictFlip)) console.log(`  ${r.id} [${r.category}] ans=${JSON.stringify(r.answer)} key=${JSON.stringify(r.expected)}`);
console.log("--- loose flips (FAIL under g0, PASS under loose) ---");
for (const r of scored.filter((r) => r.looseFlip)) console.log(`  ${r.id} [${r.category}] ans=${JSON.stringify(r.answer)} key=${JSON.stringify(r.expected)}`);
if (args.out) writeFileSync(args.out, JSON.stringify({ summary, rows }, null, 2) + "\n");
