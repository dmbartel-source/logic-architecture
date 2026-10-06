#!/usr/bin/env node
// validate-input.mjs — Parse-time domain-invariant assertions (E6 hardening).
// Mode 17's mirror: confident continuation through defective inputs.
// These assertions run BEFORE search, at parse time. Violations FATAL with
// the invariant named — never a confident answer on defective input.
//
// Usage in a solver:
//   import { assertNonNegative, assertInterval, assertRLeN, scanContradictions, fatal } from "./validate-input.mjs";
//   const text = readFileSync(promptFile, "utf8");
//   scanContradictions(text);                    // E6-8: contradictory prompt text
//   assertNonNegative(distances, "distance");    // E6-7: domain invariants
//   assertInterval(a, b, "maintenance window");
//   assertRLeN(r, n, "remove-r-of-n");

export function fatal(invariant, detail) {
  console.error(`FATAL: domain invariant violated: ${invariant}${detail ? ` — ${detail}` : ""}`);
  process.exit(1);
}

// E6-7: every distance/weight/size/duration must be >= 0.
// vals: array of numbers; name: what they are (for the FATAL message).
export function assertNonNegative(vals, name) {
  for (const v of vals) {
    if (typeof v === "number" && !Number.isNaN(v) && v < 0) {
      fatal(`${name} >= 0`, `got ${v}`);
    }
  }
}

// E6-7: intervals must satisfy a < b.
export function assertInterval(a, b, name) {
  if (!(a < b)) {
    fatal(`${name}: interval requires a < b`, `got [${a},${b})`);
  }
}

// E6-7: remove-r-of-n requires r <= n.
export function assertRLeN(r, n, name = "remove-r-of-n") {
  if (r > n) {
    fatal(`${name}: r <= n`, `cannot remove ${r} items from ${n}`);
  }
}

// E6-8: contradiction scan on prompt text.
// FATALs when the prompt matches >= 2 DIFFERING rule statements, or when
// supersede/correction language appears adjacent to a second rule statement.
// This catches the T10 shape: "rule: X ... CORRECTION (this supersedes...): rule: Y".
const SUPERSEDE_RE = /\b(supersedes?|correction|this replaces|ignore (the )?previous|amended|revised rule)\b/i;

// Generic rule-extraction patterns: "<label> ... rule ... <params>" shapes.
// We look for rule definitions both at line starts and mid-line (e.g.
// "CORRECTION (this supersedes...): rule: (r*3+i*5) mod 97").
const RULE_LINE_RE = /^\s*(?:rule|checksum rule|constraint)\s*\d*\s*[:=]\s*(.+)$/gim;
const RULE_INLINE_RE = /\brule\s*\d*\s*[:=]\s*([^,;\n]{3,80})/gi;

export function scanContradictions(text) {
  const rules = [];
  let m;
  RULE_LINE_RE.lastIndex = 0;
  while ((m = RULE_LINE_RE.exec(text)) !== null) {
    rules.push(m[1].trim());
  }
  // Mid-line rule definitions (catches "CORRECTION ...: rule: X" shapes).
  RULE_INLINE_RE.lastIndex = 0;
  while ((m = RULE_INLINE_RE.exec(text)) !== null) {
    const body = m[1].trim();
    if (!rules.some((r) => r.toLowerCase().includes(body.toLowerCase().slice(0, 20)) ||
                           body.toLowerCase().includes(r.toLowerCase().slice(0, 20)))) {
      rules.push(body);
    }
  }
  // Distinct rule bodies => contradictory specification.
  const distinct = [...new Set(rules.map((r) => r.toLowerCase()))];
  if (distinct.length >= 2) {
    fatal("contradictory specification",
      `${distinct.length} differing rule statements: ${distinct.map((r) => JSON.stringify(r.slice(0, 60))).join(" vs ")}`);
  }
  // Supersede language + more than one rule-like statement anywhere.
  if (SUPERSEDE_RE.test(text) && rules.length >= 1) {
    // Count rule-ish statements more loosely: any line with an assignment-like shape.
    const loose = (text.match(/^\s*.*[:=]\s*.+$/gm) || []).length;
    if (loose >= 2 || rules.length >= 2 || distinct.length >= 1) {
      // Supersede language present: require the prompt to be unambiguous.
      // If there are 2+ candidate rule statements, the supersede did not
      // cleanly replace — FATAL rather than first-match-wins.
      const candidates = (text.match(/^\s*(?:rule|checksum|constraint|formula).+$/gim) || []);
      if (candidates.length >= 2 || distinct.length >= 2) {
        fatal("contradictory specification",
          `supersede/correction language with ${candidates.length} rule candidates — ambiguous which rule governs`);
      }
    }
  }
}

// ── HERA pre-checks (KA6 ADOPT) ──────────────────────────────────────────
// Trial-local pre-checks from trial-hera/precheck-r2.mjs, promoted to production.
// These are generic prompt-level scans that need no solver cooperation —
// that is the point (F1/F2 show solver-level guards can be bypassed or
// hardcoded around).

// HERA P1: defective-quantity scan.
// A negative duration/size/weight/capacity/release is a domain-invariant
// violation. The old failure: (\d+) parsers silently dropped such lines.
// This catches the defect at the prompt level, before any solver runs.
export function scanDefectiveQuantities(text) {
  const m = text.match(/(?:duration|size|weight|capacity|release)\s*=\s*(-\d+(?:\.\d+)?)/);
  if (m) {
    fatal("defective quantity", `domain invariant violated: ${m[0]} (quantities must be >= 0)`);
  }
}

// HERA P2: stated-vs-listed count reconciliation.
// "<N> <entity>" declarations must match the number of parsed entity lines.
// Generic version: caller provides the declaration regex, line regex, and label.
export function assertCountMatch(text, declRe, lineRe, label) {
  const dm = text.match(declRe);
  if (!dm) return; // no declaration found; nothing to reconcile
  const stated = parseInt(dm[1], 10);
  const listed = (text.match(lineRe) || []).length;
  if (stated !== listed) {
    fatal("count mismatch",
      `stated ${stated} ${label} but ${listed} ${label} lines parsed — contradictory specification`);
  }
}

// HERA P3: prerequisite scan for invoice tasks.
// Every category with [active] lines must have a discount rate in the prompt.
// (The v9-arith-001.mjs fix handles this solver-side; this is the generic
// prompt-level version for batch tooling.)
export function scanInvoicePrerequisites(text) {
  const activeCats = new Set(
    [...text.matchAll(/^[A-Z]+\d*:\s*([a-z]+),\s*\$[\d.]+ x \d+ \[active\]/gm)].map((m) => m[1])
  );
  const ratedCats = new Set([...text.matchAll(/([a-z]+) \d+% off/g)].map((m) => m[1]));
  for (const c of activeCats) {
    if (!ratedCats.has(c)) {
      fatal("missing prerequisite", `category '${c}' has active lines but no discount rate in the prompt`);
    }
  }
}
