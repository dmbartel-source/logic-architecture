// elision-check.mjs — F1 §19 trial: mechanical requirement-elision detection.
// Candidate spec change: failure mode 17 (requirement elision) — any problem
// element present in the prompt but absent from the formalization is a defect.
// This gate compares prompt requirement-candidates against the formalize
// record (constraints/premises/load_bearing/success_criteria/decorative).
// A candidate acknowledged nowhere = ELIDED → gate blocks (fail loudly).
//
// Usage: node elision-check.mjs <task.json> [--json]
//   task.json: {id, description, formalize:{strategy,premises[],constraints[],
//              success_criteria, load_bearing[], decorative[]}}
//   NOTE: the check reads ONLY description + formalize. It must never read a
//   trial key/ground-truth file. Exit 0 = all acknowledged; exit 2 = elision(s).
// Self-test: node elision-check.mjs --selftest

import { readFileSync } from "node:fs";

const STOP = new Set(
  "a,an,the,of,to,in,on,for,with,by,at,as,is,are,was,were,be,been,being,have,has,had,do,does,did,will,would,can,could,should,may,might,must,and,or,not,no,its,it's,this,that,these,those,you,your,we,our,they,their,it,he,she,if,then,than,so,such,each,other,into,from,over,under,up,down,out,off,about,between,through,also,just,only,more,most,than,too,very,when,where,which,who,whom,what,how,all,any,both,few,many,some,there,here,now,today,please,use,using,used,given,following,first,second,third,one,two,three,four,five,six,seven,eight,nine,ten,task,problem,find,determine,compute,calculate,return,output,answer,report,list,set,order,ordered,sequence,based,following,note,note:,note ,eg,e.g.,i.e.,etc,vs".split(",")
);

function stem(w) {
  w = w.toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 4 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 5 && w.endsWith("ed")) return w.slice(0, -2);
  return w;
}

function keywords(text) {
  return (text.toLowerCase().match(/[a-z][a-z0-9-]*/g) || [])
    .map(stem)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

// Requirement-signal patterns (generic; from v1.7 §16 + F1 silent-drop family).
const SIGNALS = [
  /\b(must|shall|has to|have to|needs? to|required|requirement|ensure|make sure)\b/i,
  /\b(minimi[sz]e|maximi[sz]e|optimiz[se]|objective is|goal is)\b/i,
  /\b(subject to|under the constraint|constraint)\b/i,
  /\b(do not|don't|cannot|can't|never|exclude[sd]?|excluding|prohibit\w*|forbidden|not allowed|disallow\w*)\b/i,
  /\b(at least|at most|exactly|no more than|no fewer than|each .{0,30} must|every .{0,30} must)\b/i,
  /\b(tie-?break|k-?th|second-?best|waypoint|via\b|pass(?:es)? through|correction|instead of|overrid\w*|rather than)\b/i,
];

function extractCandidates(description) {
  const sentences = description.split(/(?<=[.!?;])\s+|\n+/);
  const cands = [];
  for (const s of sentences) {
    const sig = SIGNALS.findIndex((re) => re.test(s));
    if (sig === -1) continue;
    const kw = [...new Set(keywords(s))];
    if (kw.length === 0) continue;
    cands.push({ sentence: s.trim().slice(0, 160), signal: sig, keywords: kw });
  }
  return cands;
}

function fieldKeywords(formalize, fields) {
  const out = {};
  for (const f of fields) {
    const v = formalize[f];
    const text = Array.isArray(v) ? v.join(" ") : String(v || "");
    out[f] = new Set(keywords(text));
  }
  return out;
}

function acknowledged(cand, formalize) {
  const fields = fieldKeywords(formalize, [
    "premises",
    "constraints",
    "load_bearing",
    "success_criteria",
    "decorative",
  ]);
  let best = { field: null, overlap: 0, matched: [] };
  for (const [f, set] of Object.entries(fields)) {
    const matched = cand.keywords.filter((k) => set.has(k));
    if (matched.length > best.overlap)
      best = { field: f, overlap: matched.length, matched };
  }
  // Acknowledgment rule: >=2 content words shared, or >=50% of candidate
  // keywords covered (for short candidates), or the objective keyword match.
  const cover = best.overlap / cand.keywords.length;
  const ok =
    best.overlap >= 2 || (cand.keywords.length <= 3 && cover >= 0.5) || best.overlap >= Math.ceil(cand.keywords.length * 0.5);
  return { ...best, cover, ok };
}

export function checkElision(task) {
  const cands = extractCandidates(task.description || "");
  const formalize = task.formalize || {};
  const results = cands.map((c) => ({ ...c, ...acknowledged(c, formalize) }));
  const elided = results.filter((r) => !r.ok);
  return { candidates: results, elided, blocked: elided.length > 0 };
}

function selftest() {
  // Mini self-test: one elided requirement, one acknowledged, one decorative.
  const task = {
    id: "selftest",
    description:
      "Find the shortest route from A to D. The route must pass through waypoint C. " +
      "Minimize total distance. The map was drawn by a cartographer in 1998.",
    formalize: {
      strategy: "SEARCH",
      premises: ["graph nodes A B C D", "edge distances"],
      constraints: ["shortest path", "minimize total distance"],
      success_criteria: "shortest route A to D",
      load_bearing: ["distance objective"],
      decorative: ["cartographer 1998 flavor text"],
    },
  };
  const r = checkElision(task);
  const waypoint = r.candidates.find((c) => c.keywords.includes("waypoint"));
  const pass =
    waypoint && !waypoint.ok && r.blocked === true && r.elided.length === 1;
  console.log(JSON.stringify({ pass, elided: r.elided.map((e) => e.sentence) }, null, 1));
  process.exit(pass ? 0 : 1);
}

if (process.argv[2] === "--selftest") {
  selftest();
} else {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: node elision-check.mjs <task.json> [--json]");
    process.exit(1);
  }
  const task = JSON.parse(readFileSync(path, "utf8"));
  const r = checkElision(task);
  const json = process.argv.includes("--json");
  if (json) {
    console.log(JSON.stringify({ id: task.id, blocked: r.blocked, elided: r.elided }, null, 1));
  } else {
    console.log(`[${task.id}] candidates=${r.candidates.length} elided=${r.elided.length} → ${r.blocked ? "BLOCK" : "PASS"}`);
    for (const e of r.elided) console.log(`  ELIDED (signal ${e.signal}): ${e.sentence}`);
  }
  process.exit(r.blocked ? 2 : 0);
}
