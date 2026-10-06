#!/usr/bin/env node
// solvers/v10-consist-003.mjs — Solve a linear system; output ONLY the value
// of z (like '42'). Exact rational Gaussian elimination + back-substitution
// self-check. Handles "x + y = 10", "2x - y = 5", "y + z = 12" style lines.
// Mode-17: FATAL unless every '='-bearing line parses as a linear equation,
// the system is square and nonsingular, z is present, and z is integral
// (the prompt's illustrated format is an integer).
// Usage: node v10-consist-003.mjs --prompt <prompt.txt>

import { readPrompt, FATAL, diag } from "./lib/v10-util.mjs";

// Rationals as {n, d} with d > 0, normalized.
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a || 1; }
function rat(n, d = 1) {
  if (d === 0) FATAL("division by zero in rational arithmetic");
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}
const rAdd = (a, b) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
const rSub = (a, b) => rat(a.n * b.d - b.n * a.d, a.d * b.d);
const rMul = (a, b) => rat(a.n * b.n, a.d * b.d);
const rDiv = (a, b) => rat(a.n * b.d, a.d * b.n);
const rIsZero = (a) => a.n === 0;
const rToInt = (a) => (a.n % a.d === 0 ? a.n / a.d : null);

// Parse a linear expression into {coeffs: Map(var->number), constant: number}.
function parseExpr(s) {
  const coeffs = new Map();
  let constant = 0;
  const t = s.replace(/\s+/g, "").replace(/-/g, "+-");
  for (const tok of t.split("+")) {
    if (!tok) continue;
    const vm = /^([+-]?\d*\.?\d*)([a-zA-Z]\w*)$/.exec(tok);
    if (vm) {
      let c = vm[1];
      c = c === "" || c === "+" ? 1 : c === "-" ? -1 : parseFloat(c);
      if (!isFinite(c)) FATAL(`bad coefficient in term: ${tok}`);
      coeffs.set(vm[2], (coeffs.get(vm[2]) || 0) + c);
    } else if (/^[+-]?\d+(\.\d+)?$/.test(tok)) {
      constant += parseFloat(tok);
    } else {
      FATAL(`unparseable term: ${tok}`);
    }
  }
  return { coeffs, constant };
}

function main() {
  const text = readPrompt(process.argv.slice(2));

  const eqLines = text.split("\n").map((l) => l.trim()).filter((l) => l.includes("="));
  if (eqLines.length === 0) FATAL("no equations found");
  const eqs = [];
  for (const ln of eqLines) {
    const parts = ln.split("=");
    if (parts.length !== 2) FATAL(`equation has != 1 '=' sign: ${ln}`);
    const L = parseExpr(parts[0]);
    const R = parseExpr(parts[1]);
    // Move everything left: (L - R) = 0. RHS constant must be a plain number.
    if (R.coeffs.size > 0) FATAL(`variables on both sides unsupported: ${ln}`);
    const coeffs = new Map(L.coeffs);
    eqs.push({ coeffs, rhs: R.constant - L.constant, raw: ln });
  }

  const varOrder = [];
  for (const e of eqs)
    for (const v of e.coeffs.keys())
      if (!varOrder.includes(v)) varOrder.push(v);
  const nv = varOrder.length, ne = eqs.length;
  if (nv === 0) FATAL("no variables parsed");
  if (ne !== nv) FATAL(`system is ${ne}x${nv}, not square — refusing to guess`);

  // Augmented matrix of rationals.
  const M = eqs.map((e) => {
    const row = varOrder.map((v) => rat(e.coeffs.get(v) || 0));
    row.push(rat(e.rhs));
    return row;
  });

  // Forward elimination with partial pivoting (exact).
  for (let col = 0; col < nv; col++) {
    let piv = -1;
    for (let r = col; r < ne; r++) if (!rIsZero(M[r][col])) { piv = r; break; }
    if (piv === -1) FATAL("singular system (zero pivot)");
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = col + 1; r < ne; r++) {
      if (rIsZero(M[r][col])) continue;
      const f = rDiv(M[r][col], M[col][col]);
      for (let c = col; c <= nv; c++) M[r][c] = rSub(M[r][c], rMul(f, M[col][c]));
    }
  }
  // Back substitution.
  const sol = new Array(nv);
  for (let r = nv - 1; r >= 0; r--) {
    let acc = M[r][nv];
    for (let c = r + 1; c < nv; c++) acc = rSub(acc, rMul(M[r][c], sol[c]));
    if (rIsZero(M[r][r])) FATAL("singular system (zero diagonal)");
    sol[r] = rDiv(acc, M[r][r]);
  }

  // Self-check: substitute back into every parsed equation (exact).
  for (let i = 0; i < ne; i++) {
    const e = eqs[i];
    let check = rat(0);
    varOrder.forEach((v, c) => { check = rAdd(check, rMul(rat(e.coeffs.get(v) || 0), sol[c])); });
    if (!rIsZero(rSub(check, rat(e.rhs)))) FATAL(`solution fails equation ${i + 1}: ${e.raw}`);
  }

  const zi = varOrder.indexOf("z");
  if (zi === -1) FATAL("variable z not present in system");
  const zInt = rToInt(sol[zi]);
  if (zInt === null) FATAL(`z is not integral (${sol[zi].n}/${sol[zi].d}) — unexpected for this task format`);
  diag(`solution: ${varOrder.map((v, i) => `${v}=${rToInt(sol[i]) ?? `${sol[i].n}/${sol[i].d}`}`).join(", ")}`);
  console.log(String(zInt));
}

main();
