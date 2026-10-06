#!/usr/bin/env node
// v8-counter-003.mjs — Seven link changes (per-task solver).
// Apply 7 link-time changes, find shortest S->T path.
// Ties: fewer links, then lexicographically smallest node sequence.
// Output: 'S>A>C>T 17' (path, space, total time).

function main() {
  // Original network: node -> [[neighbor, time], ...]
  const net = {
    S: [["A", 3], ["B", 5]],
    A: [["C", 4], ["D", 7]],
    B: [["C", 5], ["E", 4]],
    C: [["F", 4], ["G", 6], ["T", 11]],
    D: [["F", 5], ["T", 9]],
    E: [["F", 6], ["T", 8]],
    F: [["T", 5]],
    G: [["T", 6]],
  };

  // Seven changes: [from, to, newTime]
  const changes = [
    ["C", "F", 8], ["B", "E", 9], ["E", "T", 12], ["A", "D", 10],
    ["F", "T", 9], ["G", "T", 10], ["D", "F", 8],
  ];
  for (const [f, t, nt] of changes) {
    const links = net[f];
    const link = links.find(([to]) => to === t);
    if (link) link[1] = nt;
  }

  // DFS enumerate all S->T paths (DAG, no cycles possible given structure, but use visited).
  const paths = [];
  function dfs(node, path, time, visited) {
    if (node === "T") {
      paths.push({ nodes: [...path], time, links: path.length - 1 });
      return;
    }
    for (const [to, t] of net[node] || []) {
      if (visited.has(to)) continue;
      visited.add(to);
      path.push(to);
      dfs(to, path, time + t, visited);
      path.pop();
      visited.delete(to);
    }
  }
  dfs("S", ["S"], 0, new Set(["S"]));

  // Sort by (time, fewer links, lexicographic).
  paths.sort((a, b) =>
    a.time - b.time ||
    a.links - b.links ||
    (a.nodes.join(">") < b.nodes.join(">") ? -1 : 1));

  if (paths.length === 0) { console.error("No path found"); process.exit(1); }
  const best = paths[0];
  console.log(`${best.nodes.join(">")} ${best.time}`);
}

main();
