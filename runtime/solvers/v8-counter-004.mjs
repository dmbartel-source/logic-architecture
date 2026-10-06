#!/usr/bin/env node
// v8-counter-004.mjs — Quadruple constraint removal (per-task solver).
// Single machine, jobs with release times and precedence.
// Compute M0, then find quadruple of constraints whose removal minimizes makespan.
// Output: 'M0;M4;W<X&A<B&C<D&E<F'

function main() {
  // Jobs: [name, duration, release]
  const jobs = [
    ["A", 6, 0], ["B", 4, 3], ["C", 3, 0], ["D", 3, 2], ["E", 2, 0],
    ["F", 2, 5], ["G", 4, 1], ["H", 3, 4], ["I", 5, 2], ["J", 2, 6],
  ];
  const jobMap = new Map(jobs.map(([n, d, r]) => [n, { dur: d, release: r }]));

  // Precedence: [before, after]
  const allPrec = [
    ["B", "A"], ["C", "D"], ["D", "E"], ["F", "E"],
    ["G", "H"], ["I", "J"], ["J", "E"], ["A", "C"],
  ];

  // Compute makespan with given precedence set (single machine, no preemption).
  // Optimal: branch and bound over job orderings respecting precedence and release.
  function makespan(prec) {
    const preds = new Map(jobs.map(([n]) => [n, new Set()]));
    for (const [a, b] of prec) {
      if (preds.has(a) && preds.has(b)) preds.get(b).add(a);
    }

    let best = Infinity;
    const names = jobs.map(([n]) => n);

    function dfs(scheduled, time) {
      if (time >= best) return; // prune
      if (scheduled.size === names.length) {
        best = Math.min(best, time);
        return;
      }
      // Available: not scheduled, all preds scheduled.
      for (const n of names) {
        if (scheduled.has(n)) continue;
        const ready = [...preds.get(n)].every((p) => scheduled.has(p));
        if (!ready) continue;
        const { dur, release } = jobMap.get(n);
        const start = Math.max(time, release);
        const end = start + dur;
        scheduled.add(n);
        dfs(scheduled, end);
        scheduled.delete(n);
      }
    }

    dfs(new Set(), 0);
    return best;
  }

  const M0 = makespan(allPrec);

  // Enumerate 4-combinations of constraints.
  const n = allPrec.length;
  const quads = [];
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          quads.push([a, b, c, d]);

  // Format: 'W<X&A<B&C<D&E<F' with constraints in alphabetical order.
  function fmtQuad(indices) {
    const strs = indices.map((i) => `${allPrec[i][0]}<${allPrec[i][1]}`).sort();
    return strs.join("&");
  }

  // Sort quads alphabetically by formatted string.
  quads.sort((x, y) => {
    const xs = fmtQuad(x), ys = fmtQuad(y);
    return xs < ys ? -1 : xs > ys ? 1 : 0;
  });

  let bestM4 = Infinity;
  let bestQuad = null;
  for (const q of quads) {
    const qset = new Set(q);
    const prec = allPrec.filter((_, i) => !qset.has(i));
    const m = makespan(prec);
    if (m < bestM4) {
      bestM4 = m;
      bestQuad = q;
    }
    // Ties: keep the alphabetically first (quads are sorted, so first wins).
  }

  console.log(`${M0};${bestM4};${fmtQuad(bestQuad)}`);
}

main();
