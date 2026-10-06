#!/usr/bin/env node
// solvers/v10-pack-002.mjs — 2D strip packing: pack rectangles into a strip of
// fixed width (rotation allowed, no overlap); minimize the total strip height.
// Output ONLY the integer height like '8'.
// Format: "Pack 5 rectangles into a strip of width 10 (rotation allowed):",
// "R1: 4x3" lines, "Rectangles cannot overlap. Minimize the total strip height."
// Method: decision procedure "placeable in WxH?" via corner-candidate
// backtracking (each rect's x in {0} U right-edges, y in {0} U top-edges —
// complete for orthogonal packing); H walks up from the area lower bound.
// The witness placement is self-verified (bounds, rotation dims, no overlap).
// Mode-17: FATAL on any unparseable input.
// Usage: node v10-pack-002.mjs --prompt <prompt.txt>

import { readPrompt, FATAL, diag } from "./lib/v10-util.mjs";

function overlaps(cells, x, y, w, h) {
  for (const p of cells)
    if (x < p.x + p.w && p.x < x + w && y < p.y + p.h && p.y < y + h) return true;
  return false;
}

function main() {
  const text = readPrompt(process.argv.slice(2));

  const wM = /strip of width (\d+)/i.exec(text);
  if (!wM) FATAL("strip width not parsed");
  const W = parseInt(wM[1], 10);
  if (!/rotation allowed/i.test(text)) FATAL("expected 'rotation allowed'");
  if (!/cannot overlap/i.test(text)) FATAL("expected non-overlap rule");
  if (!/minimize the total strip height/i.test(text)) FATAL("expected height-minimization directive");

  const rects = [];
  const rre = /^([A-Za-z0-9]+):\s*(\d+)x(\d+)\s*$/gm;
  let m;
  while ((m = rre.exec(text)) !== null)
    rects.push({ name: m[1], w: parseInt(m[2], 10), h: parseInt(m[3], 10) });
  if (rects.length === 0) FATAL("no rectangles parsed");
  const labelCount = (text.match(/^[A-Za-z0-9]+:\s*\d+x\d+\s*$/gm) || []).length;
  if (labelCount !== rects.length)
    FATAL(`parsed ${rects.length} rectangles but found ${labelCount} rectangle lines`);
  for (const r of rects)
    if (Math.min(r.w, r.h) > W) FATAL(`rectangle ${r.name} cannot fit strip width ${W} in any orientation`);

  // Decision: placeable in W x H? Returns witness placement or null.
  function placeable(H) {
    const order = [...rects].sort((a, b) => b.w * b.h - a.w * a.h || (a.name < b.name ? -1 : 1));
    const placed = [];
    let witness = null;
    function rec(i) {
      if (i === order.length) { witness = placed.map((p) => ({ ...p })); return true; }
      const r = order[i];
      const ors = r.w === r.h ? [[r.w, r.h]] : [[r.w, r.h], [r.h, r.w]];
      const xs = new Set([0]), ys = new Set([0]);
      for (const p of placed) { xs.add(p.x + p.w); ys.add(p.y + p.h); }
      for (const [w, h] of ors) {
        if (w > W || h > H) continue;
        for (const x of xs) {
          if (x + w > W) continue;
          for (const y of ys) {
            if (y + h > H) continue;
            if (overlaps(placed, x, y, w, h)) continue;
            placed.push({ name: r.name, x, y, w, h });
            if (rec(i + 1)) return true;
            placed.pop();
          }
        }
      }
      return false;
    }
    return rec(0) ? witness : null;
  }

  const area = rects.reduce((s, r) => s + r.w * r.h, 0);
  let H = Math.max(
    Math.ceil(area / W),
    Math.max(...rects.map((r) => Math.min(r.w, r.h)))
  );
  let witness = null;
  while (true) {
    diag(`trying H=${H}`);
    witness = placeable(H);
    if (witness) break;
    H++;
    if (H > area) FATAL("height exceeded total area — internal bug");
  }

  // Self-verify the witness placement.
  const byName = new Map(rects.map((r) => [r.name, r]));
  const seen = new Set();
  const cells = [];
  for (const p of witness) {
    const r = byName.get(p.name);
    if (!r) FATAL(`witness references unknown rectangle ${p.name}`);
    if (seen.has(p.name)) FATAL(`witness places ${p.name} twice`);
    seen.add(p.name);
    const dimsOk = (p.w === r.w && p.h === r.h) || (p.w === r.h && p.h === r.w);
    if (!dimsOk) FATAL(`witness dims for ${p.name} are not a rotation of ${r.w}x${r.h}`);
    if (p.x < 0 || p.y < 0 || p.x + p.w > W || p.y + p.h > H)
      FATAL(`witness places ${p.name} out of bounds`);
    if (overlaps(cells, p.x, p.y, p.w, p.h)) FATAL(`witness has overlap at ${p.name}`);
    cells.push(p);
  }
  if (seen.size !== rects.length) FATAL("witness does not place all rectangles");
  diag(`witness: ${witness.map((p) => `${p.name}@${p.x},${p.y} ${p.w}x${p.h}`).join("; ")}`);

  console.log(String(H));
}

main();
