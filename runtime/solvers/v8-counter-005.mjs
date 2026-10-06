#!/usr/bin/env node
// v8-counter-005.mjs — Assignment after removals (per-task solver).
// 8 roles, one person per role, nobody in two roles, cost <= 60, maximize score.
// Ties: lower cost, then alphabetical crew list.
// Rae, Yara, Zed, Tom, Uma are unavailable. Output the optimal total score.

function main() {
  // role -> [[person, cost, score], ...]
  const roles = {
    captain: [["Rae", 7, 10], ["Sam", 6, 9], ["Tom", 5, 8], ["Abe", 6, 8], ["Dan", 5, 7]],
    engineer: [["Rae", 6, 9], ["Uma", 7, 10], ["Vic", 5, 7], ["Eli", 4, 6]],
    medic: [["Xim", 4, 7], ["Wes", 6, 9], ["Yara", 5, 8], ["Fay", 5, 7]],
    pilot: [["Zed", 6, 9], ["Tom", 5, 8], ["Sam", 4, 7], ["Bob", 5, 8], ["Gus", 4, 6]],
    navigator: [["Yara", 6, 9], ["Zed", 5, 8], ["Vic", 4, 7], ["Hal", 5, 7]],
    comms: [["Wes", 5, 8], ["Xim", 6, 9], ["Uma", 4, 7], ["Ivy", 4, 6]],
    science: [["Tom", 6, 9], ["Xim", 5, 8], ["Vic", 4, 7], ["Cal", 5, 8], ["Jay", 4, 6]],
    tactical: [["Abe", 5, 8], ["Bob", 6, 9], ["Cal", 4, 7], ["Kim", 5, 7]],
  };

  const unavailable = new Set(["Rae", "Yara", "Zed", "Tom", "Uma"]);

  const roleNames = Object.keys(roles);
  const n = roleNames.length;

  let best = null; // {score, cost, crew[]}

  function isBetter(cand) {
    if (!best) return true;
    if (cand.score !== best.score) return cand.score > best.score;
    if (cand.cost !== best.cost) return cand.cost < best.cost;
    const a = cand.crew.slice().sort().join(",");
    const b = best.crew.slice().sort().join(",");
    return a < b;
  }

  function dfs(pos, used, cost, score, crew) {
    if (cost > 60) return;
    if (pos === n) {
      const cand = { score, cost, crew: [...crew] };
      if (isBetter(cand)) best = cand;
      return;
    }
    const role = roleNames[pos];
    for (const [person, c, s] of roles[role]) {
      if (unavailable.has(person)) continue;
      if (used.has(person)) continue;
      used.add(person);
      crew.push(person);
      dfs(pos + 1, used, cost + c, score + s, crew);
      crew.pop();
      used.delete(person);
    }
  }

  dfs(0, new Set(), 0, 0, []);
  if (!best) { console.error("No feasible assignment"); process.exit(1); }
  console.log(String(best.score));
}

main();
