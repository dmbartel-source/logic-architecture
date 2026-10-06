#!/usr/bin/env node
// solve-select2.mjs — Generic constrained-selection solver (Phase 4).
// PAL-style: detect variant from prompt, parse, branch-and-bound, print answer.
//
// Handles v8-select-002..006:
//   002: team selection (salary cap, remote/dept limits, role coverage, exactly N)
//   003: components (family coverage, conflict pairs)
//   004: multi-knapsack (6 storage bins, item → specific bin)
//   005: knapsack with weight-tier bonus
//   006: knapsack with implications, exclusions, group minimums
//
// Usage: node solve-select2.mjs --prompt <prompt.txt>
//   Prints chosen codes like 'A+B+C'.

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") args.prompt = argv[++i];
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.prompt) { console.error("Usage: node solve-select2.mjs --prompt <prompt.txt>"); process.exit(2); }
  return args;
}

// ── Variant detection ──────────────────────────────────────────────

function detectVariant(text) {
  if (/team members from \d+ candidates/i.test(text)) return "team";       // 002
  if (/family/i.test(text) && /conflicting pairs/i.test(text)) return "family"; // 003
  if (/must be stored (cold|ambient)/i.test(text) || /required storage/i.test(text)) return "multibin"; // 004
  if (/PLUS a bonus/i.test(text)) return "bonus";                          // 005
  if (/implication chains/i.test(text)) return "implic";                   // 006
  return "unknown";
}

// ── Parsers ────────────────────────────────────────────────────────

function parseTeam(text) {
  // "A: $95k, skill 88, backend,lead, d1"  or "C: $78k, skill 80, frontend, d2, remote"
  const items = [];
  const re = /^([A-Z]+):\s*\$(\d+)k,\s*skill\s*(\d+),\s*(.+)$/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    const rest = m[4].split(",").map(s => s.trim().toLowerCase());
    const remote = rest.includes("remote");
    const dept = rest.find(s => /^d\d+$/.test(s));
    const roles = rest.filter(s => !/^d\d+$/.test(s) && s !== "remote");
    items.push({
      code: m[1], weight: +m[2], value: +m[3],
      attrs: { roles: new Set(roles), dept, remote },
    });
  }
  // Constraints
  const salaryCap = +(/total salary <= \$(\d+)k/i.exec(text)?.[1] || 0);
  const remoteMax = +(/at most (\d+) remote/i.exec(text)?.[1] || 999);
  const deptMax = +(/at most (\d+) from any one department/i.exec(text)?.[1] || 999);
  const exactN = +(/Select exactly (\d+) team members/i.exec(text)?.[1] || 0);
  // Role coverage: "must cover all roles: lead, backend, ..."
  const rolesMatch = /must cover all roles:\s*([a-z,\s]+)\s*\(/i.exec(text);
  const allRoles = rolesMatch ? rolesMatch[1].split(",").map(s => s.trim().toLowerCase()) : [];

  const constraints = [
    { type: "knapsack", cap: salaryCap, get: it => it.weight },
    { type: "exactCount", n: exactN },
    { type: "attrMax", attr: "remote", test: it => it.attrs.remote, max: remoteMax },
    { type: "groupMax", groupBy: it => it.attrs.dept, max: deptMax },
    { type: "setCover", attr: "roles", required: new Set(allRoles) },
  ];
  // Objective: maximize skill; tie-break: lower salary, then alpha
  const objective = {
    score: (chosen, items) => [...chosen].reduce((s, i) => s + items[i].value, 0),
    tiebreak: (a, b, items) => {
      // a, b are {codes, score}; return true if a is better
      if (a.score !== b.score) return a.score > b.score;
      const wa = a.codes.reduce((s, c) => s + items.find(it => it.code === c).weight, 0);
      const wb = b.codes.reduce((s, c) => s + items.find(it => it.code === c).weight, 0);
      if (wa !== wb) return wa < wb;
      return a.codes.join("+") < b.codes.join("+");
    },
  };
  return { items, constraints, objective };
}

function parseFamily(text) {
  // "A: w=8, val=17, alpha"
  const items = [];
  const re = /^([A-Z]+):\s*w=(\d+),\s*val=(\d+),\s*([a-z]+)$/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    items.push({ code: m[1], weight: +m[2], value: +m[3], attrs: { family: m[4].toLowerCase() } });
  }
  const weightCap = +(/total weight <= (\d+)/i.exec(text)?.[1] || 0);
  // Families: "at least one component from EACH family (alpha, beta, ...)"
  const famMatch = /from EACH family \(([a-z,\s]+)\)/i.exec(text);
  const families = famMatch ? famMatch[1].split(",").map(s => s.trim().toLowerCase()) : [];
  // Conflicting pairs: "(G,H), (J,K), ..."
  const conflicts = [];
  const confRe = /\(([A-Z]+),([A-Z]+)\)/g;
  const confSection = /conflicting pairs(.+?)cannot both/i.exec(text)?.[1] || "";
  while ((m = confRe.exec(confSection)) !== null) conflicts.push([m[1], m[2]]);

  const constraints = [
    { type: "knapsack", cap: weightCap, get: it => it.weight },
    { type: "familyCover", families },
    ...conflicts.map(([a, b]) => ({ type: "notBoth", a, b })),
  ];
  const objective = {
    score: (chosen, items) => [...chosen].reduce((s, i) => s + items[i].value, 0),
    tiebreak: (a, b) => {
      if (a.score !== b.score) return a.score > b.score;
      if (a.codes.length !== b.codes.length) return a.codes.length < b.codes.length;
      return a.codes.join("+") < b.codes.join("+");
    },
  };
  return { items, constraints, objective };
}

function parseMultibin(text) {
  // "A: w=6, val=15, cold"
  const items = [];
  const re = /^([A-Z]+):\s*w=(\d+),\s*val=(\d+),\s*([a-z]+)$/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    items.push({ code: m[1], weight: +m[2], value: +m[3], attrs: { bin: m[4].toLowerCase() } });
  }
  // "Capacities (weight): cold 18, ambient 20, ..."
  const caps = {};
  const capSection = /Capacities \(weight\):(.+?)\./i.exec(text)?.[1] || "";
  const capRe = /([a-z]+)\s+(\d+)/g;
  while ((m = capRe.exec(capSection)) !== null) caps[m[1].toLowerCase()] = +m[2];

  const constraints = [{ type: "multibin", caps }];
  const objective = {
    score: (chosen, items) => [...chosen].reduce((s, i) => s + items[i].value, 0),
    tiebreak: (a, b) => {
      if (a.score !== b.score) return a.score > b.score;
      if (a.codes.length !== b.codes.length) return a.codes.length < b.codes.length;
      return a.codes.join("+") < b.codes.join("+");
    },
  };
  return { items, constraints, objective };
}

function parseBonus(text) {
  // "A: w=9, val=19"
  const items = [];
  const re = /^([A-Z]+):\s*w=(\d+),\s*val=(\d+)$/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    items.push({ code: m[1], weight: +m[2], value: +m[3], attrs: {} });
  }
  const weightCap = +(/total weight <= (\d+)/i.exec(text)?.[1] || 0);
  // Bonus tiers: "+50 if total weight >= 42, else +40 if >= 39, ..."
  const tiers = [];
  const tierRe = /\+(\d+) if (?:total weight )?>= (\d+)/gi;
  while ((m = tierRe.exec(text)) !== null) tiers.push({ min: +m[2], bonus: +m[1] });
  tiers.sort((a, b) => b.min - a.min); // descending by threshold

  const bonusFn = (w) => {
    for (const t of tiers) if (w >= t.min) return t.bonus;
    return 0;
  };

  const constraints = [{ type: "knapsack", cap: weightCap, get: it => it.weight }];
  const objective = {
    score: (chosen, items) => {
      const w = [...chosen].reduce((s, i) => s + items[i].weight, 0);
      const v = [...chosen].reduce((s, i) => s + items[i].value, 0);
      return v + bonusFn(w);
    },
    tiebreak: (a, b) => {
      if (a.score !== b.score) return a.score > b.score;
      if (a.codes.length !== b.codes.length) return a.codes.length < b.codes.length;
      return a.codes.join("+") < b.codes.join("+");
    },
  };
  return { items, constraints, objective };
}

function parseImplic(text) {
  // "A: w=8, val=18"
  const items = [];
  const re = /^([A-Z]+):\s*w=(\d+),\s*val=(\d+)$/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    items.push({ code: m[1], weight: +m[2], value: +m[3], attrs: {} });
  }
  const weightCap = +(/total weight <= (\d+)/i.exec(text)?.[1] || 0);
  // Implications: "A requires B, B requires C, ..."
  const impls = [];
  const implRe = /([A-Z]+) requires ([A-Z]+)/gi;
  const implSection = /implication chains:(.+?);/i.exec(text)?.[1] || "";
  while ((m = implRe.exec(implSection)) !== null) impls.push([m[1], m[2]]);
  // Exclusions: "not both F and G, ..."
  const exclusions = [];
  const exclRe = /not both ([A-Z]+) and ([A-Z]+)/gi;
  const exclSection = /exclusions:(.+?);/i.exec(text)?.[1] || "";
  while ((m = exclRe.exec(exclSection)) !== null) exclusions.push([m[1], m[2]]);
  // Group minimums: "at least 2 of the core modules {J, K, L, M}, ..."
  const groupMins = [];
  const gmRe = /at least (\d+) of (?:the core modules |)(?:\{|\{\{)([A-Z,\s]+)(?:\}|\}\})/gi;
  while ((m = gmRe.exec(text)) !== null) {
    const members = m[2].split(",").map(s => s.trim()).filter(s => /^[A-Z]+$/.test(s));
    groupMins.push({ min: +m[1], members: new Set(members) });
  }

  const constraints = [
    { type: "knapsack", cap: weightCap, get: it => it.weight },
    ...impls.map(([a, b]) => ({ type: "requires", a, b })),
    ...exclusions.map(([a, b]) => ({ type: "notBoth", a, b })),
    ...groupMins.map(g => ({ type: "groupMin", min: g.min, members: g.members })),
  ];
  const objective = {
    score: (chosen, items) => [...chosen].reduce((s, i) => s + items[i].value, 0),
    tiebreak: (a, b) => {
      if (a.score !== b.score) return a.score > b.score;
      if (a.codes.length !== b.codes.length) return a.codes.length < b.codes.length;
      return a.codes.join("+") < b.codes.join("+");
    },
  };
  return { items, constraints, objective };
}

// ── Generic branch-and-bound ───────────────────────────────────────

function solve(items, constraints, objective) {
  const n = items.length;
  const idx = new Map(items.map((it, i) => [it.code, i]));

  // Order by value density for good incumbent early.
  const order = items.map((_, i) => i).sort((a, b) =>
    (items[b].value / (items[b].weight + 1)) - (items[a].value / (items[a].weight + 1)));

  const suffixVal = new Array(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) suffixVal[i] = suffixVal[i + 1] + items[order[i]].value;

  let best = null;

  // Check constraints that can prune partial solutions.
  function checkPartial(chosen) {
    for (const c of constraints) {
      if (c.type === "knapsack") {
        let sum = 0;
        for (const i of chosen) sum += c.get(items[i]);
        if (sum > c.cap) return false;
      } else if (c.type === "attrMax") {
        let cnt = 0;
        for (const i of chosen) if (c.test(items[i])) cnt++;
        if (cnt > c.max) return false;
      } else if (c.type === "groupMax") {
        const counts = new Map();
        for (const i of chosen) {
          const g = c.groupBy(items[i]);
          counts.set(g, (counts.get(g) || 0) + 1);
          if (counts.get(g) > c.max) return false;
        }
      } else if (c.type === "notBoth") {
        if (chosen.has(idx.get(c.a)) && chosen.has(idx.get(c.b))) return false;
      } else if (c.type === "multibin") {
        const binW = new Map();
        for (const i of chosen) {
          const b = items[i].attrs.bin;
          binW.set(b, (binW.get(b) || 0) + items[i].weight);
          if (binW.get(b) > (c.caps[b] ?? 0)) return false;
        }
      } else if (c.type === "exactCount") {
        if (chosen.size > c.n) return false;
      }
      // setCover, familyCover, requires, groupMin: leaf-only (not monotone)
    }
    return true;
  }

  function checkFull(chosen) {
    const codes = new Set([...chosen].map(i => items[i].code));
    for (const c of constraints) {
      if (c.type === "exactCount") {
        if (chosen.size !== c.n) return false;
      } else if (c.type === "setCover") {
        const covered = new Set();
        for (const i of chosen) for (const r of items[i].attrs.roles) covered.add(r);
        for (const r of c.required) if (!covered.has(r)) return false;
      } else if (c.type === "familyCover") {
        const present = new Set();
        for (const i of chosen) present.add(items[i].attrs.family);
        for (const f of c.families) if (!present.has(f)) return false;
      } else if (c.type === "requires") {
        if (codes.has(c.a) && !codes.has(c.b)) return false;
      } else if (c.type === "groupMin") {
        let cnt = 0;
        for (const code of codes) if (c.members.has(code)) cnt++;
        if (cnt < c.min) return false;
      }
    }
    return true;
  }

  function isBetter(codes, score) {
    if (!best) return true;
    const a = { codes, score }, b = best;
    return objective.tiebreak(a, b, items);
  }

  function dfs(pos, chosen) {
    if (pos === n) {
      if (checkFull(chosen)) {
        const codes = [...chosen].map(i => items[i].code).sort();
        const score = objective.score(chosen, items);
        if (isBetter(codes, score)) best = { codes, score };
      }
      return;
    }
    // Bound: max possible additional value (ignoring bonus for simplicity;
    // bonus only increases score, so this bound is valid for pruning when
    // we're maximizing and bonus is non-negative).
    const curScore = objective.score(chosen, items);
    // Conservative upper bound: current + all remaining value + max bonus.
    // For bonus variant, max bonus is 50. This is safe (never prunes optimal).
    const maxBonus = 50;
    if (best && curScore + suffixVal[pos] + maxBonus < best.score) return;

    if (!checkPartial(chosen)) return;

    const i = order[pos];
    chosen.add(i);
    if (checkPartial(chosen)) dfs(pos + 1, chosen);
    chosen.delete(i);
    dfs(pos + 1, chosen);
  }

  dfs(0, new Set());
  return best;
}

// ── Main ───────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv.slice(2));
  const text = readFileSync(args.prompt, "utf8");
  const variant = detectVariant(text);
  if (variant === "unknown") {
    console.error("Unknown select variant");
    process.exit(1);
  }

  let parsed;
  if (variant === "team") parsed = parseTeam(text);
  else if (variant === "family") parsed = parseFamily(text);
  else if (variant === "multibin") parsed = parseMultibin(text);
  else if (variant === "bonus") parsed = parseBonus(text);
  else if (variant === "implic") parsed = parseImplic(text);

  if (parsed.items.length === 0) {
    console.error("No items parsed");
    process.exit(1);
  }

  const best = solve(parsed.items, parsed.constraints, parsed.objective);
  if (!best) {
    console.error("No feasible subset");
    process.exit(1);
  }
  console.log(best.codes.join("+"));
}

main();
