#!/usr/bin/env node
// solvers/v9-distract-001.mjs — Quadruple supersede (v9-distract-001).
// Invoice memo chain: use only APPROVED versions (latest approved per line);
// DRAFT versions and marginalia are ignored.

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v9-distract-001.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

const r2 = (x) => Math.round(x * 100) / 100;

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");

  // Versions: "v1 (approved 2024-01-15): Line A: $100 x 2; Line B: $50 x 3."
  const versions = [];
  const verRe = /^v(\d+) \(((?:DRAFT|approved)[^)]*)\):\s*(.+)$/gm;
  let m;
  while ((m = verRe.exec(text)) !== null) {
    const approved = /^approved/.test(m[2]);
    const lines = {};
    const lineRe = /Line ([A-Z]+): \$([\d.]+) x (\d+)/g;
    let lm;
    while ((lm = lineRe.exec(m[3])) !== null) {
      lines[lm[1]] = parseFloat(lm[2]) * parseInt(lm[3], 10);
    }
    versions.push({ n: +m[1], approved, lines });
  }
  if (versions.length === 0) { console.error("FATAL: no versions parsed"); process.exit(1); }
  versions.sort((a, b) => a.n - b.n);

  // Latest approved per line.
  const latest = {};
  for (const v of versions) {
    if (!v.approved) continue;
    for (const [line, amt] of Object.entries(v.lines)) latest[line] = amt;
  }
  if (Object.keys(latest).length === 0) { console.error("FATAL: no approved lines"); process.exit(1); }

  const total = r2(Object.values(latest).reduce((a, b) => a + b, 0));
  console.log(`USD ${total.toFixed(2)}`);
}

main();
