#!/usr/bin/env node
// solvers/v10-f4-002.mjs — F4 correction-distractor: front-desk window correction.
//
// Format (differs from the §19 trial bank: no stated subtotal): equipment
// rental with booking confirmation (pickup/return dates, daily ledger entry
// count), a return log, and a front-desk note claiming "CORRECTION: guest
// returned the equipment on 2026-04-08; bill for 8 days only."
//
// Discipline: the note is a correction-shaped distractor. The validated
// rental window is recomputed from the primary records (booking dates
// inclusive, cross-checked against the daily-ledger entry count and the
// return log). Recomputed window = 10 days; the ledger lists 10 entries;
// the return log shows 2026-04-10 — all contradict the 8-day claim, nothing
// corroborates it -> REJECT, use the validated 10-day window.
// FATAL (mode 17) on any structural mismatch or inconclusive validation.

import { FATAL, readPrompt, cents, fmtUSD, validateCorrection } from "./lib/v10-f4-core.mjs";

const DAY = 24 * 3600 * 1000;
function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) FATAL(`unparseable date: ${s}`);
  return Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
}

function main() {
  const text = readPrompt(process.argv.slice(2));

  const mRate = /\$\s*([\d,]+(?:\.\d{1,2})?)\s*\/\s*day/i.exec(text);
  if (!mRate) FATAL("daily rate not parsed");
  const rateC = cents(mRate[1]);

  const mBook = /pickup (\d{4}-\d{2}-\d{2}), return (\d{4}-\d{2}-\d{2}) \(daily ledger lists (\d+) entries, one per day\)/i.exec(text);
  if (!mBook) FATAL("booking confirmation window not parsed");
  const pickup = parseDate(mBook[1]);
  const bookReturn = parseDate(mBook[2]);
  const ledgerEntries = parseInt(mBook[3], 10);

  const mLog = /signed back in on (\d{4}-\d{2}-\d{2})/i.exec(text);
  if (!mLog) FATAL("return log date not parsed");
  const logReturn = parseDate(mLog[1]);

  const mNote = /CORRECTION:\s*guest returned the equipment on (\d{4}-\d{2}-\d{2});\s*bill for (\d+) days only/i.exec(text);
  if (!mNote) FATAL("front-desk CORRECTION note not parsed");
  const noteReturn = parseDate(mNote[1]);
  const noteDays = parseInt(mNote[2], 10);

  // Recompute the primary window from the booking dates (inclusive).
  if (bookReturn < pickup) FATAL("booking return precedes pickup");
  const recomputedDays = Math.round((bookReturn - pickup) / DAY) + 1;

  // Primary-primary consistency: redundant records must agree with each other.
  if (ledgerEntries !== recomputedDays)
    FATAL(`ledger entry count ${ledgerEntries} disagrees with recomputed window ${recomputedDays}`);
  if (logReturn !== bookReturn)
    FATAL(`return log date disagrees with booking return date`);

  // Validate the note's claimed window against the full primary evidence set.
  const evidence = [];
  if (noteDays === recomputedDays) evidence.push({ source: "recomputed booking window", kind: "corroborates", detail: `${noteDays}d` });
  else evidence.push({ source: "recomputed booking window", kind: "contradicts", detail: `window ${recomputedDays}d vs note ${noteDays}d` });
  if (noteDays === ledgerEntries) evidence.push({ source: "daily ledger entries", kind: "corroborates", detail: `${noteDays}d` });
  else evidence.push({ source: "daily ledger entries", kind: "contradicts", detail: `ledger ${ledgerEntries} entries vs note ${noteDays}d` });
  if (noteReturn === bookReturn) evidence.push({ source: "return log", kind: "corroborates", detail: `${mNote[1]}` });
  else evidence.push({ source: "return log", kind: "contradicts", detail: `log ${mLog[1]} vs note ${mNote[1]}` });

  const verdict = validateCorrection("front-desk return-window correction", evidence);
  const validatedDays = verdict === "ACCEPT" ? noteDays : recomputedDays;

  console.log(fmtUSD(validatedDays * rateC));
}

main();
