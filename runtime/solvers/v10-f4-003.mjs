#!/usr/bin/env node
// solvers/v10-f4-003.mjs — F4 correction-distractor: supersede-chain "correction".
//
// Format (differs from the §19 trial bank: no stated subtotal): an approved
// service-memo chain (v1/v2/v3 with approval dates and annual fees; the latest
// version carries a worksheet), plus an unsigned email claiming "CORRECTION:
// v3's worksheet total is $520, not $510 — v3 is wrong, use v2."
//
// Discipline: the email is a correction-shaped distractor. It is validated
// against the primary computation: recomputing the worksheet (200+180+130)
// yields 510, which corroborates v3 and contradicts the email's $520 claim.
// The "latest APPROVED version" rule stands -> REJECT, use the validated
// v3 fee ($510) x 3 sites. FATAL (mode 17) on any structural mismatch or
// inconclusive validation.

import { FATAL, readPrompt, cents, fmtUSD, validateCorrection } from "./lib/v10-f4-core.mjs";

function main() {
  const text = readPrompt(process.argv.slice(2));

  // Parse the approved version chain.
  const versions = [];
  const vRe = /v(\d)\s*\(approved (\d{4}-\d{2}-\d{2})\):\s*annual fee \$([\d,]+)\.?/g;
  let m;
  while ((m = vRe.exec(text)) !== null)
    versions.push({ v: parseInt(m[1], 10), date: m[2], feeC: cents(m[3]) });
  if (versions.length === 0) FATAL("no approved versions parsed");

  // Latest approved version governs.
  const latest = versions.reduce((a, b) => (b.date > a.date ? b : a));

  // Worksheet lives on the latest version's line: "worksheet: 200+180+130 = 510".
  const mWs = /worksheet:\s*([\d\s+]+)\s*=\s*([\d,]+)/.exec(text);
  if (!mWs) FATAL("worksheet not parsed");
  const terms = mWs[1].split("+").map((t) => parseInt(t.trim(), 10));
  if (terms.some((t) => !Number.isInteger(t))) FATAL("worksheet terms not integers");
  const recomputedWsC = terms.reduce((a, t) => a + t, 0) * 100;
  const statedWsC = cents(mWs[2]);

  // Structural check: the worksheet must validate the latest approved fee.
  if (recomputedWsC !== latest.feeC || statedWsC !== latest.feeC)
    FATAL(`worksheet does not validate latest approved fee (recomputed=${recomputedWsC}, stated=${statedWsC}, fee=${latest.feeC})`);

  const mEmail = /CORRECTION:\s*v(\d)'s worksheet total is \$([\d,]+),\s*not \$([\d,]+)/i.exec(text);
  if (!mEmail) FATAL("unsigned email CORRECTION not parsed");
  const targetV = parseInt(mEmail[1], 10);
  const claimC = cents(mEmail[2]);
  const wasC = cents(mEmail[3]);

  if (targetV !== latest.v) FATAL(`correction targets v${targetV} but latest approved is v${latest.v}`);
  if (wasC !== latest.feeC) FATAL(`email 'was' value mismatches v${latest.v} fee`);

  // Validate the email's worksheet claim against the recomputed worksheet
  // (joint: the worksheet recomputation is the full primary computation).
  const evidence = [];
  if (claimC === recomputedWsC) evidence.push({ source: "recomputed worksheet", kind: "corroborates", detail: `${claimC / 100}` });
  else evidence.push({ source: "recomputed worksheet", kind: "contradicts", detail: `worksheet ${recomputedWsC / 100} vs claim ${claimC / 100}` });

  const verdict = validateCorrection("unsigned email worksheet correction", evidence);

  const mSites = /covers (\d+) sites/i.exec(text);
  if (!mSites) FATAL("site count not parsed");
  const sites = parseInt(mSites[1], 10);

  // If the correction were (inconceivably) accepted, use v2 — the email's
  // own prescription. But the only ACCEPT path requires corroboration.
  let feeC;
  if (verdict === "ACCEPT") {
    const prev = versions.find((x) => x.date < latest.date);
    if (!prev) FATAL("no prior version to fall back to");
    feeC = prev.feeC;
  } else {
    feeC = latest.feeC;
  }

  console.log(fmtUSD(feeC * sites));
}

main();
