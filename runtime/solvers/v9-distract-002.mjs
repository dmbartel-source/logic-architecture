#!/usr/bin/env node
// solvers/v9-distract-002.mjs — Recency vs authority (v9-distract-002).
// Binding policy: the document that takes precedence on the matter governs.
// Parse each policy claim (max stack height + date), determine which document
// the prompt marks as taking precedence, and compute floor spaces needed.

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node v9-distract-002.mjs --prompt <prompt.txt>"); process.exit(1); }
  return args;
}

function main() {
  const { prompt } = parseArgs(process.argv.slice(2));
  const text = readFileSync(prompt, "utf8");

  // Order size: "An order of 100 cubic units (1x1x1 each)"
  const ordM = /order of (\d+) cubic units/.exec(text);
  if (!ordM) { console.error("FATAL: order size not parsed"); process.exit(1); }
  const units = parseInt(ordM[1], 10);

  // Policy claims: "<Doc> (<date>[, ...]): '<quoted policy text>'[ (not a policy document)]"
  const docs = [];
  const docRe = /^(.*?)\((\d{4}-\d{2}-\d{2})[^)]*\):\s*(.*?)$/gm;
  let m;
  while ((m = docRe.exec(text)) !== null) {
    const rest = m[3];
    const notPolicy = /not a policy document/.test(rest);
    const qM = /'(.*?)'/.exec(rest);
    const body = qM ? qM[1] : rest;
    const hM = /[Mm]ax(?:imum)? stack height is (\d+) units?/.exec(body);
    docs.push({
      name: m[1].trim(),
      date: m[2],
      height: hM ? parseInt(hM[1], 10) : null,
      precedence: /takes precedence over/i.test(body),
      notPolicy,
    });
  }
  if (docs.length === 0) { console.error("FATAL: no policy documents parsed"); process.exit(1); }

  const policyDocs = docs.filter((d) => d.height !== null && !d.notPolicy);
  if (policyDocs.length === 0) { console.error("FATAL: no usable policy claims"); process.exit(1); }

  // The binding claim: the document the prompt marks as taking precedence;
  // otherwise the most recent policy document.
  let binding = policyDocs.find((d) => d.precedence);
  if (!binding) {
    binding = [...policyDocs].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  }
  const perStack = binding.height;
  const spaces = Math.ceil(units / perStack);
  console.log(String(spaces));
}

main();
