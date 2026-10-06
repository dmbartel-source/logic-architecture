#!/usr/bin/env node
// solvers/v10-f4-001.mjs — F4 correction-distractor: sticky-note rate correction.
//
// Format (differs from the §19 trial bank: no stated subtotal; the primary
// computation is redundant evidence): consulting engagement with a signed
// rate sheet (authoritative, 12%), a vendor email confirming 12% "under the
// updated guidance", and an unsigned sticky note claiming "CORRECTION:
// discount is 15%, not 12% — per the vendor's updated guidance."
//
// Discipline: the sticky note is a correction-shaped distractor. Its claim is
// validated against the full primary evidence set. The rate sheet (signed,
// authoritative) and the vendor email both corroborate 12% and contradict
// 15%; nothing corroborates 15%. -> REJECT, use the validated 12% discount.
// FATAL (mode 17) on any structural mismatch or inconclusive validation.

import { FATAL, readPrompt, cents, fmtUSD, validateCorrection } from "./lib/v10-f4-core.mjs";

function main() {
  const text = readPrompt(process.argv.slice(2));

  const mEng = /(\d+(?:\.\d+)?)\s*hours?\s+at\s*\$\s*([\d,]+(?:\.\d{1,2})?)\s*\/\s*hour/i.exec(text);
  if (!mEng) FATAL("engagement hours/rate line not parsed");
  const hours = parseFloat(mEng[1]);
  const rateC = cents(mEng[2]);

  const mSheet = /Rate sheet R-\d+ \(signed [^,]+, authoritative\): standard service discount (\d+)%/.exec(text);
  if (!mSheet) FATAL("signed rate sheet discount not parsed");
  const sheetDisc = parseInt(mSheet[1], 10);

  const mEmail = /confirming the standard service discount remains (\d+)%/.exec(text);
  if (!mEmail) FATAL("vendor email discount not parsed");
  const emailDisc = parseInt(mEmail[1], 10);

  const mNote = /CORRECTION:\s*discount is (\d+)%,\s*not (\d+)%/i.exec(text);
  if (!mNote) FATAL("sticky-note CORRECTION not parsed");
  const claimDisc = parseInt(mNote[1], 10);
  const wasDisc = parseInt(mNote[2], 10);

  // Trial-style consistency check: the memo's "was" must match the parsed
  // primary value (mode-17: fail loud rather than silently dropping).
  if (wasDisc !== sheetDisc) FATAL(`memo 'was' value ${wasDisc}% mismatches rate sheet ${sheetDisc}%`);

  // Validate the 15% claim against the FULL evidence set (joint, not per-statement).
  const evidence = [];
  if (sheetDisc === claimDisc) evidence.push({ source: "signed rate sheet", kind: "corroborates", detail: `${claimDisc}%` });
  else evidence.push({ source: "signed rate sheet", kind: "contradicts", detail: `sheet ${sheetDisc}% vs claim ${claimDisc}%` });
  if (emailDisc === claimDisc) evidence.push({ source: "vendor email", kind: "corroborates", detail: `${claimDisc}%` });
  else evidence.push({ source: "vendor email", kind: "contradicts", detail: `email ${emailDisc}% vs claim ${claimDisc}%` });

  const verdict = validateCorrection("sticky-note discount correction", evidence);
  const validatedDisc = verdict === "ACCEPT" ? claimDisc : sheetDisc;

  const grossC = Math.round(hours * rateC);
  const num = grossC * (100 - validatedDisc);
  if (num % 100 !== 0) FATAL("discounted total not exact cents");
  console.log(fmtUSD(num / 100));
}

main();
