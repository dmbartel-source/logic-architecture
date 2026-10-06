#!/usr/bin/env node
// solvers/v10-f4-004.mjs — F4 correction-distractor: pounds-not-kilograms claim.
//
// Format (differs from the §19 trial bank: no stated subtotal): a freight
// shipment with a bill of lading ("Net weight 2,500 kg (all weights in
// kilograms)"), a scale ticket ("2,500 kg"), a carrier rate ($0.40 per kg),
// and a carrier memo claiming "CORRECTION: the scale ticket reads 2,500 lb,
// not kg — convert to kg before applying the rate."
//
// Discipline: the memo is a correction-shaped distractor. Its premise (lb)
// is validated against the redundant primary evidence: the bill of lading
// and the scale ticket both state kilograms, and the bill of lading
// explicitly declares all weights in kilograms. Contradicted twice,
// corroborated zero times -> REJECT, use the validated 2,500 kg.
// FATAL (mode 17) on any structural mismatch or inconclusive validation.

import { FATAL, readPrompt, cents, fmtUSD, validateCorrection } from "./lib/v10-f4-core.mjs";

const LB_TO_KG = 0.45359237;

function main() {
  const text = readPrompt(process.argv.slice(2));

  const mBol = /Bill of lading:\s*'Net weight ([\d,]+)\s*(kg|lb)\s*\((all weights in (kilograms|pounds))\)/i.exec(text);
  if (!mBol) FATAL("bill of lading weight not parsed");
  const bolW = parseFloat(mBol[1].replace(/,/g, ""));
  const bolUnit = mBol[2].toLowerCase();
  const bolAllUnit = mBol[4].toLowerCase();

  const mTicket = /Scale ticket:\s*'([\d,]+)\s*(kg|lb)'/i.exec(text);
  if (!mTicket) FATAL("scale ticket weight not parsed");
  const ticketW = parseFloat(mTicket[1].replace(/,/g, ""));
  const ticketUnit = mTicket[2].toLowerCase();

  const mRate = /Carrier rate:\s*\$\s*([\d.]+)\s*per\s*(kg|lb)/i.exec(text);
  if (!mRate) FATAL("carrier rate not parsed");
  const rateC = cents(mRate[1]);
  const rateUnit = mRate[2].toLowerCase();

  const mMemo = /CORRECTION:\s*the scale ticket reads ([\d,]+)\s*(lb|kg),\s*not\s*(kg|lb)/i.exec(text);
  if (!mMemo) FATAL("carrier CORRECTION memo not parsed");
  const claimW = parseFloat(mMemo[1].replace(/,/g, ""));
  const claimUnit = mMemo[2].toLowerCase();
  const wasUnit = mMemo[3].toLowerCase();

  // Trial-style consistency checks: the memo's "was" must match the primary
  // record, and its cited weight must match the primary weight magnitude.
  if (wasUnit !== ticketUnit) FATAL(`memo 'was' unit ${wasUnit} mismatches scale ticket ${ticketUnit}`);
  if (claimW !== ticketW) FATAL(`memo weight ${claimW} mismatches scale ticket ${ticketW}`);
  if (bolW !== ticketW) FATAL(`bill of lading ${bolW} disagrees with scale ticket ${ticketW}`);

  // Validate the memo's unit claim against the full primary evidence set.
  const evidence = [];
  if (claimUnit === ticketUnit) evidence.push({ source: "scale ticket", kind: "corroborates", detail: claimUnit });
  else evidence.push({ source: "scale ticket", kind: "contradicts", detail: `ticket ${ticketUnit} vs claim ${claimUnit}` });
  if (claimUnit === bolUnit) evidence.push({ source: "bill of lading", kind: "corroborates", detail: claimUnit });
  else evidence.push({ source: "bill of lading", kind: "contradicts", detail: `BOL ${bolUnit} vs claim ${claimUnit}` });
  if (claimUnit === bolAllUnit.slice(0, 2)) evidence.push({ source: "BOL unit declaration", kind: "corroborates", detail: mBol[4] });
  else evidence.push({ source: "BOL unit declaration", kind: "contradicts", detail: `"${mBol[3]}" vs claim ${claimUnit}` });

  const verdict = validateCorrection("carrier pounds-not-kilograms correction", evidence);

  let totalC;
  if (verdict === "ACCEPT") {
    // Defensive path: convert claimed lb to kg, then apply the per-kg rate.
    if (rateUnit !== "kg") FATAL("rate unit not kg — conversion path undefined");
    const kg = claimW * LB_TO_KG;
    totalC = Math.round(kg * rateC);
  } else {
    if (rateUnit !== ticketUnit && rateUnit !== bolAllUnit.slice(0, 2))
      FATAL(`rate unit ${rateUnit} incompatible with validated unit`);
    totalC = Math.round(ticketW * rateC);
  }
  console.log(fmtUSD(totalC));
}

main();
