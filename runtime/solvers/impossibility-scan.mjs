#!/usr/bin/env node
// impossibility-scan.mjs — §19 Trial 1 (arXiv:2610.06668): pre-solve contradiction scan.
// Mechanical, generic contradiction patterns (not tuned to specific task ids):
//   P1 negative numeric givens (qty, duration, capacity, size, weight, x -N)
//   P2 exact-count exceeds available candidates ("Select EXACTLY k" / "which k changes")
//   P3 zero per-bin/item slots with items present ("at most 0 items")
//   P4 non-negative attribute budget set below the attribute minimum ("toll <= -1")
//   P5 resource cap set below zero while all usages are non-negative ("r1<=-1")
//   P6 requires APPROVED versions but none are approved
//   P7 precedence cycle ("A before B" pairs)
// Usage: node impossibility-scan.mjs --prompt <file>   (CLI)
//   or:  import { scanPrompt } from "./impossibility-scan.mjs"
import { readFileSync } from "node:fs";

export function scanPrompt(text) {
  const findings = [];
  const t = String(text);

  // P1: negative numeric givens.
  for (const m of t.matchAll(/\b(?:quantity|qty|duration|capacity|size|weight|delay|distance|rate|price)\s*[:=]\s*-\d+(?:\.\d+)?/gi))
    findings.push(`P1 negative given: "${m[0].trim()}"`);
  for (const m of t.matchAll(/knapsack capacity\s+-\d+(?:\.\d+)?/gi))
    findings.push(`P1 negative given: "${m[0].trim()}"`);
  for (const m of t.matchAll(/\bx\s+-\d+(?:\.\d+)?/g))
    findings.push(`P1 negative multiplier: "${m[0].trim()}"`);

  // P2: exact-count selection exceeds the candidate pool.
  {
    const sel = /\bSelect EXACTLY (\d+) candidates\b/.exec(t);
    if (sel) {
      const cands = [...t.matchAll(/^c\d+:/gm)].length;
      if (cands > 0 && +sel[1] > cands)
        findings.push(`P2 EXACTLY ${sel[1]} > ${cands} candidates available`);
    }
    const chg = /\bwhich (\d+) changes, applied together\b/.exec(t);
    if (chg) {
      const n = [...t.matchAll(/^[A-Z]->[A-Z] becomes /gm)].length;
      if (n > 0 && +chg[1] > n)
        findings.push(`P2 choose ${chg[1]} > ${n} proposed changes`);
    }
  }

  // P3: zero slots per bin with items present.
  {
    const m = /\bEach bin holds at most (\d+) items\./.exec(t);
    if (m && +m[1] === 0) {
      const items = [...t.matchAll(/^I\d+:/gm)].length;
      if (items > 0) findings.push(`P3 at most 0 items per bin but ${items} items listed`);
    }
  }

  // P4: attribute budget below the attribute's minimum over all links.
  for (const attr of ["toll", "exposure", "fuel", "risk", "noise", "delay"]) {
    const b = new RegExp(`total ${attr} <= (-?\\d+)`).exec(t);
    if (b) {
      const vals = [...t.matchAll(new RegExp(`${attr}=(\\d+)`, "g"))].map((m) => +m[1]);
      if (vals.length && +b[1] < Math.min(...vals))
        findings.push(`P4 total ${attr} <= ${b[1]} below min link ${attr} ${Math.min(...vals)}`);
    }
  }

  // P5: resource cap below zero while all usages are non-negative.
  {
    const caps = [...t.matchAll(/\b(r\d+)<=(-\d+)\b/g)];
    for (const c of caps) {
      const uses = [...t.matchAll(new RegExp(`\\b${c[1]}=(\\d+)`, "g"))].map((m) => +m[1]);
      if (uses.length && Math.min(...uses) >= 0)
        findings.push(`P5 cap ${c[1]}<=${c[2]} < 0 <= min usage ${Math.min(...uses)}`);
    }
  }

  // P6: requires APPROVED versions but none approved.
  if (/using only APPROVED versions/i.test(t) && !/\(approved /i.test(t) && /DRAFT/i.test(t))
    findings.push("P6 requires APPROVED versions but zero versions are approved");

  // P7: precedence cycle.
  {
    const edges = [...t.matchAll(/\b(J\d+|[A-Z]) before (J\d+|[A-Z])\b/g)].map((m) => [m[1], m[2]]);
    if (edges.length) {
      const adj = {};
      for (const [a, b] of edges) (adj[a] ||= []).push(b);
      const reach = (a, b, seen = new Set()) => {
        if (a === b) return true;
        if (seen.has(a)) return false;
        seen.add(a);
        return (adj[a] || []).some((y) => reach(y, b, seen));
      };
      const cyc = edges.some(([a, b]) => reach(b, a));
      if (cyc) findings.push("P7 precedence graph contains a cycle");
    }
  }

  return { flagged: findings.length > 0, findings };
}

// CLI: node impossibility-scan.mjs --prompt <file>
if (process.argv[1] && process.argv[1].endsWith("impossibility-scan.mjs")) {
  const i = process.argv.indexOf("--prompt");
  if (i < 0) { console.error("Usage: node impossibility-scan.mjs --prompt <file>"); process.exit(2); }
  const r = scanPrompt(readFileSync(process.argv[i + 1], "utf8"));
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.flagged ? 0 : 0);
}
