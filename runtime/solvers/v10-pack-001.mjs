#!/usr/bin/env node
// solvers/v10-pack-001.mjs — 1D bin packing with conflict pairs (cannot share
// a bin). Minimize the number of bins; output ONLY the count like '4'.
// Format: "A: size 4" lines, "Bin capacity: 10.", "Conflicts (cannot share a
// bin): A conflicts with E; B conflicts with C; D conflicts with G."
// Method: exact restricted-growth DFS decision procedure ("packable into K
// bins?") with a free-space lower-bound prune; K walks up from ceil(total/cap).
// The witness packing is self-verified (coverage, capacity, conflicts).
// Mode-17: FATAL on any unparseable input.
// Usage: node v10-pack-001.mjs --prompt <prompt.txt>

import { readPrompt, FATAL, diag } from "./lib/v10-util.mjs";

function main() {
  const text = readPrompt(process.argv.slice(2));

  const items = [];
  const ire = /^([A-Za-z0-9]+):\s*size\s+(\d+)\s*$/gm;
  let m;
  while ((m = ire.exec(text)) !== null)
    items.push({ name: m[1], size: parseInt(m[2], 10) });
  if (items.length === 0) FATAL("no items parsed");
  const labelCount = (text.match(/^[A-Za-z0-9]+:\s*size\s+\d+\s*$/gm) || []).length;
  if (labelCount !== items.length)
    FATAL(`parsed ${items.length} items but found ${labelCount} item lines`);

  const capM = /Bin capacity:\s*(\d+)/i.exec(text);
  if (!capM) FATAL("bin capacity not parsed");
  const CAP = parseInt(capM[1], 10);
  for (const it of items)
    if (it.size > CAP) FATAL(`item ${it.name} size ${it.size} exceeds capacity ${CAP}`);

  const conflict = new Map(items.map((it) => [it.name, new Set()]));
  const cLine = /Conflicts\s*\(cannot share a bin\):\s*([^\n]+)/i.exec(text);
  if (!cLine) FATAL("conflict line not parsed");
  let pairs = 0;
  const pairRe = /([A-Za-z0-9]+)\s+conflicts with\s+([A-Za-z0-9]+)/gi;
  while ((m = pairRe.exec(cLine[1])) !== null) {
    const a = m[1], b = m[2];
    if (!conflict.has(a) || !conflict.has(b))
      FATAL(`conflict references unknown item: ${a}/${b}`);
    if (a === b) FATAL(`self-conflict on ${a}`);
    conflict.get(a).add(b);
    conflict.get(b).add(a);
    pairs++;
  }
  if (pairs === 0) FATAL("no conflict pairs parsed");
  const stripped = cLine[1]
    .replace(/[A-Za-z0-9]+\s+conflicts with\s+[A-Za-z0-9]+/gi, "")
    .replace(/[;.\s]/g, "");
  if (stripped !== "") FATAL(`unparsed conflict text: "${stripped}"`);

  if (!/minimize the number of bins/i.test(text)) FATAL("expected bin-minimization directive");

  const ord = [...items].sort((a, b) => b.size - a.size || (a.name < b.name ? -1 : 1));
  const n = ord.length;
  const suffixSize = new Array(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) suffixSize[i] = suffixSize[i + 1] + ord[i].size;

  // Decision: can the items be packed into K bins? Returns witness or null.
  function packable(K) {
    const bins = []; // {load, members: [names]}
    let witness = null;
    function rec(i) {
      if (i === n) { witness = bins.map((b) => [...b.members]); return true; }
      // Lower-bound prune: open bins + ceil(unabsorbed remainder / CAP).
      let free = 0;
      for (const b of bins) free += CAP - b.load;
      const need = bins.length + Math.ceil(Math.max(0, suffixSize[i] - free) / CAP);
      if (need > K) return false;
      const it = ord[i];
      for (let b = 0; b < bins.length; b++) {
        const bin = bins[b];
        if (bin.load + it.size > CAP) continue;
        let ok = true;
        for (const mem of bin.members)
          if (conflict.get(it.name).has(mem)) { ok = false; break; }
        if (!ok) continue;
        bin.load += it.size;
        bin.members.push(it.name);
        if (rec(i + 1)) return true;
        bin.load -= it.size;
        bin.members.pop();
      }
      if (bins.length < K) {
        bins.push({ load: it.size, members: [it.name] });
        if (rec(i + 1)) return true;
        bins.pop();
      }
      return false;
    }
    return rec(0) ? witness : null;
  }

  const total = items.reduce((s, it) => s + it.size, 0);
  let K = Math.ceil(total / CAP);
  let witness = null;
  while (K <= n) {
    diag(`trying K=${K}`);
    witness = packable(K);
    if (witness) break;
    K++;
  }
  if (!witness) FATAL("infeasible: even n bins cannot hold the items");

  // Self-verify the witness packing.
  const seen = new Map();
  for (const bin of witness) {
    let load = 0;
    for (const nm of bin) {
      const it = items.find((x) => x.name === nm);
      if (!it) FATAL(`witness references unknown item ${nm}`);
      if (seen.has(nm)) FATAL(`witness covers ${nm} twice`);
      seen.set(nm, true);
      load += it.size;
    }
    if (load > CAP) FATAL(`witness bin [${bin.join(",")}] exceeds capacity`);
    for (let i = 0; i < bin.length; i++)
      for (let j = i + 1; j < bin.length; j++)
        if (conflict.get(bin[i]).has(bin[j]))
          FATAL(`witness bin [${bin.join(",")}] has conflict pair ${bin[i]}/${bin[j]}`);
  }
  if (seen.size !== items.length) FATAL("witness does not cover all items");
  diag(`witness: ${witness.map((b) => `[${b.join(",")}]`).join(" ")}`);

  console.log(String(K));
}

main();
