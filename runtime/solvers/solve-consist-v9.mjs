#!/usr/bin/env node
// solvers/solve-consist-v9.mjs — v9 consistency solver.
// PAL-style: parse prompt, deterministic check, print MISMATCH list.
// Handles v9-consist-001..004.
//
// Usage: node solve-consist-v9.mjs --prompt <prompt.txt>

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node solve-consist-v9.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

// ── 001: checksum rows ───────────────────────────────────────────────
function solve001(text) {
  // "The checksum rule: variable i (0-indexed) in row r must equal (r*7+i*13) mod 97."
  // Parse coefficients from the prompt rather than hardcoding them.
  const ruleM = /must equal \(r\*(\d+)\+i\*(\d+)\) mod (\d+)/.exec(text);
  if (!ruleM) { console.error("FATAL: checksum rule not parsed"); process.exit(1); }
  const A = +ruleM[1], B = +ruleM[2], MOD = +ruleM[3];
  // Rows are "ROW-<r>:" with r 1-indexed (per bank builder).
  const rows = [];
  const re = /^ROW-(\d+):\s*([\d,\s]+)$/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    rows.push({ r: +m[1], vals: m[2].split(",").map((s) => +s.trim()) });
  }
  if (rows.length === 0) { console.error("FATAL: no rows parsed"); process.exit(1); }
  const bad = [];
  for (const { r, vals } of rows) {
    for (let i = 0; i < vals.length; i++) {
      if (vals[i] !== (r * A + i * B) % MOD) { bad.push(r); break; }
    }
  }
  bad.sort((a, b) => a - b);
  console.log("MISMATCH:" + bad.map((r) => `ROW-${r}`).join(","));
}

// ── 002: ledger with audit adjustments ───────────────────────────────
function solve002(text) {
  const openM = /Opening balance: (\d+)/.exec(text);
  if (!openM) { console.error("FATAL: opening balance not parsed"); process.exit(1); }
  // "Each period p: balance += (p*37 mod 200) - 80."
  const ruleM = /Each period p: balance \+= \(p\*(\d+) mod (\d+)\) - (\d+)/.exec(text);
  if (!ruleM) { console.error("FATAL: ledger rule not parsed"); process.exit(1); }
  const A = +ruleM[1], MOD = +ruleM[2], SUB = +ruleM[3];
  // "Audit adjustments: period 8: +50; period 17: -30"
  const adj = {};
  const adjLine = /Audit adjustments: ([^.]+)\./.exec(text);
  if (!adjLine) { console.error("FATAL: adjustments not parsed"); process.exit(1); }
  const adjRe = /period (\d+): ([+-]\d+)/g;
  let m;
  while ((m = adjRe.exec(adjLine[1])) !== null) adj[+m[1]] = +m[2];
  // Reported: "PERIOD-1: 957"
  const rep = {};
  const repRe = /^PERIOD-(\d+):\s*(-?\d+)\s*$/gm;
  while ((m = repRe.exec(text)) !== null) rep[+m[1]] = +m[2];
  if (Object.keys(rep).length === 0) { console.error("FATAL: no reported balances"); process.exit(1); }

  let bal = +openM[1];
  const bad = [];
  for (const p of Object.keys(rep).map(Number).sort((a, b) => a - b)) {
    bal += (p * A) % MOD - SUB;
    const expected = bal + (adj[p] || 0);
    if (rep[p] !== expected) bad.push(p);
  }
  console.log("MISMATCH:" + bad.map((p) => `PERIOD-${p}`).join(","));
}

// ── 003: piecewise function ──────────────────────────────────────────
function solve003(text) {
  // Branches: "x<0: 2x+10; 0<=x<5: x^2; ..."
  const branchLine = /Piecewise function f:\n([^\n]+)/.exec(text);
  if (!branchLine) { console.error("FATAL: branches not parsed"); process.exit(1); }
  const branches = [];
  for (const part of branchLine[1].split(";")) {
    const t = part.trim();
    if (!t) continue;
    const cM = /^(.+?):\s*(.+)$/.exec(t);
    if (!cM) { console.error(`FATAL: branch not parsed: ${t}`); process.exit(1); }
    branches.push({ cond: parseCond(cM[1].trim()), expr: cM[2].trim().replace(/\.$/, "") });
  }
  // Computed: "f(-5) = 0"
  const computed = [];
  const cRe = /^f\((-?\d+)\)\s*=\s*(-?\d+)\s*$/gm;
  let m;
  while ((m = cRe.exec(text)) !== null) computed.push({ x: +m[1], got: +m[2] });
  if (computed.length === 0) { console.error("FATAL: no computed values"); process.exit(1); }

  const bad = [];
  for (const { x, got } of computed) {
    const br = branches.find((b) => b.cond(x));
    if (!br) { console.error(`FATAL: no branch for x=${x}`); process.exit(1); }
    if (evalExpr(br.expr, x) !== got) bad.push(x);
  }
  bad.sort((a, b) => a - b);
  console.log("MISMATCH:" + bad.map((x) => `X=${x}`).join(","));
}

function parseCond(s) {
  // "x<0", "0<=x<5", "x>=30"
  s = s.replace(/\s+/g, "");
  let m;
  if ((m = /^([\d.]+)<=x<([\d.]+)$/.exec(s))) {
    const a = +m[1], b = +m[2];
    return (x) => x >= a && x < b;
  }
  if ((m = /^x<([\d.]+)$/.exec(s))) { const b = +m[1]; return (x) => x < b; }
  if ((m = /^x<=([\d.]+)$/.exec(s))) { const b = +m[1]; return (x) => x <= b; }
  if ((m = /^x>([\d.]+)$/.exec(s))) { const b = +m[1]; return (x) => x > b; }
  if ((m = /^x>=([\d.]+)$/.exec(s))) { const b = +m[1]; return (x) => x >= b; }
  console.error(`FATAL: condition not parsed: ${s}`);
  process.exit(1);
}

function evalExpr(e, x) {
  e = e.replace(/\s+/g, "");
  if (/^-?\d+$/.test(e)) return +e;
  if (e === "x^2") return x * x;
  const modM = /^\((2\^x)\)mod(\d+)$/.exec(e);
  if (modM) return Math.pow(2, x) % +modM[2];
  // linear: "2x+10", "3x-5", "x+50", "100-2x", "-x+3"
  const linM = /^([+-]?\d*)x([+-]\d+)?$/.exec(e);
  if (linM) {
    let coef = linM[1];
    coef = coef === "" || coef === "+" ? 1 : coef === "-" ? -1 : +coef;
    return coef * x + (linM[2] ? +linM[2] : 0);
  }
  const linM2 = /^(\d+)-(\d*)x$/.exec(e);
  if (linM2) {
    const coef = linM2[2] === "" ? 1 : +linM2[2];
    return +linM2[1] - coef * x;
  }
  console.error(`FATAL: expression not parsed: ${e}`);
  process.exit(1);
}

// ── 004: sparse equations ────────────────────────────────────────────
function solve004(text) {
  // "Variable values: x1=4; x10=31; ..."
  const vars = {};
  const vLine = /Variable values: ([^.]+)\./.exec(text);
  if (!vLine) { console.error("FATAL: variables not parsed"); process.exit(1); }
  for (const part of vLine[1].split(";")) {
    const t = part.trim();
    if (!t) continue;
    const [k, v] = t.split("=").map((s) => s.trim());
    vars[k] = +v;
  }
  // "E1: 3*x11 + 2*x2 + 2*x1 = 124"
  const bad = [];
  const eRe = /^(E\d+):\s*(.+?)\s*=\s*(-?\d+)\s*$/gm;
  let m;
  let count = 0;
  while ((m = eRe.exec(text)) !== null) {
    count++;
    let lhs = 0;
    for (const term of m[2].split("+")) {
      const t = term.trim();
      const tM = /^(\d+)\*([a-z]+\d+)$/.exec(t);
      if (!tM) { console.error(`FATAL: term not parsed: ${t}`); process.exit(1); }
      if (!(tM[2] in vars)) { console.error(`FATAL: unknown variable ${tM[2]}`); process.exit(1); }
      lhs += (+tM[1]) * vars[tM[2]];
    }
    if (lhs !== +m[3]) bad.push(m[1]);
  }
  if (count === 0) { console.error("FATAL: no equations parsed"); process.exit(1); }
  // sort by numeric id
  bad.sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10));
  console.log("MISMATCH:" + bad.join(","));
}

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");
  if (/checksum rule/.test(text)) return solve001(text);
  if (/Ledger with/.test(text)) return solve002(text);
  if (/Piecewise function/.test(text)) return solve003(text);
  if (/equations \(each must hold\)/.test(text)) return solve004(text);
  console.error("FATAL: unknown v9 consistency variant");
  process.exit(1);
}

main();
