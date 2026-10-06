#!/usr/bin/env node
// solve-consist.mjs — Consistency solver (Phase 5).
// PAL-style: parse the prompt, find the first record violating its rule.
// Auto-detects three v8 formats:
//   1. Depot books: "PERIOD-n: rec=R, shp=S, adj=A, close=C" — check
//      close == prev_close + rec - shp + adj (period 1 opens at 100).
//      Output 'MISMATCH:PERIOD-n'.
//   2. Piecewise function: "Each row should satisfy y = g(x) where g(x): ..."
//      with "ROW-n: x=.., y=..". Output 'MISMATCH:ROW-n'.
//   3. Linear equations: "a*x + b*y - c*z = d" with "En: a=.., b=.., ...".
//      Output 'MISMATCH:En'.
//
// Usage: node solve-consist.mjs --prompt <prompt.txt>

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node solve-consist.mjs --prompt <prompt.txt>"); process.exit(2); }
  return args;
}

function solveDepot(text) {
  // "PERIOD-1: rec=120, shp=85, adj=0, close=135"
  // Output label comes from the prompt, e.g. "as 'CONSERVATION:PERIOD-n'".
  const labelM = /as\s+'([A-Za-z]+):PERIOD-n'/i.exec(text);
  const label = labelM ? labelM[1].toUpperCase() : "MISMATCH";
  const re = /PERIOD-(\d+):\s*rec=(-?\d+),\s*shp=(-?\d+),\s*adj=(-?\d+),\s*close=(-?\d+)/g;
  let m;
  let opening = 100; // period 1 opens at 100
  while ((m = re.exec(text)) !== null) {
    const n = +m[1], rec = +m[2], shp = +m[3], adj = +m[4], close = +m[5];
    const expected = opening + rec - shp + adj;
    if (expected !== close) return `${label}:PERIOD-${n}`;
    opening = close;
  }
  return "NONE";
}

function solvePiecewise(text) {
  // Parse g(x) pieces: "3x+2 if x<2; x^2-3 if 2<=x<5; ..."
  const defRe = /g\(x\):\s*(.+?)\.\s*Rows/i.exec(text);
  if (!defRe) return null;
  const pieces = [];
  for (const part of defRe[1].split(";")) {
    const pm = /(.+?)\s+if\s+(.+)/.exec(part.trim());
    if (!pm) continue;
    const expr = pm[1].trim(), cond = pm[2].trim();
    // Condition: "x<2", "2<=x<5", "x>=26"
    let lo = -Infinity, hi = Infinity;
    const ltM = /^x<(-?\d+(?:\.\d+)?)$/.exec(cond);
    const geM = /^x>=(-?\d+(?:\.\d+)?)$/.exec(cond);
    const rangeM = /^(-?\d+(?:\.\d+)?)<=x<(-?\d+(?:\.\d+)?)$/.exec(cond);
    if (ltM) { hi = +ltM[1]; }
    else if (geM) { lo = +geM[1]; }
    else if (rangeM) { lo = +rangeM[1]; hi = +rangeM[2]; }
    else continue;
    pieces.push({ expr, lo, hi });
  }
  function g(x) {
    for (const p of pieces) {
      if (x >= p.lo && x < p.hi) return evalExpr(p.expr, x);
    }
    throw new Error(`No piece for x=${x}`);
  }
  function evalExpr(expr, x) {
    // Safe evaluator for polynomial expressions: supports x^2, 2x^2, 3x, constants.
    // Normalize: "2x^2-30x+120" -> tokens.
    let e = expr.replace(/\s+/g, "").replace(/\^/g, "**");
    // Insert * between coefficient and x: "2x" -> "2*x", "30x" -> "30*x"
    e = e.replace(/(\d)x/g, "$1*x");
    // Validate: only digits, x, +, -, *, ., (, )
    if (!/^[\dx+\-*.() ]+$/.test(e)) throw new Error(`Unsafe expr: ${expr}`);
    return Function("x", `"use strict"; return (${e});`)(x);
  }

  const rowRe = /ROW-(\d+):\s*x=(-?\d+(?:\.\d+)?),\s*y=(-?\d+(?:\.\d+)?)/g;
  let m;
  while ((m = rowRe.exec(text)) !== null) {
    const n = +m[1], x = +m[2], y = +m[3];
    const expected = g(x);
    if (Math.abs(expected - y) > 1e-9) return `MISMATCH:ROW-${n}`;
  }
  return "NONE";
}

function solveLinear(text) {
  // "E1: a=3, b=2, c=1, x=3, y=4, z=1, d=16" — check a*x + b*y - c*z == d.
  const re = /E(\d+):\s*a=(-?\d+),\s*b=(-?\d+),\s*c=(-?\d+),\s*x=(-?\d+),\s*y=(-?\d+),\s*z=(-?\d+),\s*d=(-?\d+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const n = +m[1];
    const a = +m[2], b = +m[3], c = +m[4], x = +m[5], y = +m[6], z = +m[7], d = +m[8];
    if (a * x + b * y - c * z !== d) return `MISMATCH:E${n}`;
  }
  return "NONE";
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const text = readFileSync(args.prompt, "utf8");

  let result = null;
  if (/PERIOD-\d+:\s*rec=/i.test(text)) {
    result = solveDepot(text);
  } else if (/y = g\(x\)/i.test(text)) {
    result = solvePiecewise(text);
  } else if (/a\*x \+ b\*y - c\*z = d/i.test(text)) {
    result = solveLinear(text);
  } else {
    console.error("FATAL: unrecognized consistency format");
    process.exit(1);
  }
  console.log(result);
}

main();
