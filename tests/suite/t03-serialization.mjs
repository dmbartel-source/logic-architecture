// t03-serialization.mjs — §5 mode 14: serialization-order mismatch.
// The checker (tiebreak-check.mjs) must CATCH a comparator that sorts by
// serialized strings ("D@4" < "E@3") when the spec orders by (start, name),
// and must CLEAR a comparator using structured key tuples.
// Spec: order by start asc, then name asc. Candidates {start:4,name:"D"} and
// {start:3,name:"E"}: tuple order says E first; string order says D first.
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCmd, result } from "./util.mjs";

const CHECK = "/home/hatch/workspace/reasoning-runtime/tiebreak-check.mjs";

export async function run() {
  const dir = mkdtempSync(join(tmpdir(), "t03-"));
  writeFileSync(join(dir, "spec.json"), JSON.stringify({ order: [["start", "asc"], ["name", "asc"]], fields: ["start", "name"] }));
  writeFileSync(join(dir, "candidates.json"), JSON.stringify([{ start: 4, name: "D" }, { start: 3, name: "E" }]));
  // Bad: lexicographic comparison of serialized "name@start".
  writeFileSync(join(dir, "bad.mjs"), `export function compare(a,b){ const s=x=>x.name+"@"+x.start; return s(a)<s(b)?-1:s(a)>s(b)?1:0; }\n`);
  // Good: structured tuple comparison in spec key order.
  writeFileSync(join(dir, "good.mjs"), `export function compare(a,b){ if(a.start!==b.start) return a.start-b.start; return a.name<b.name?-1:a.name>b.name?1:0; }\n`);

  const bad = await runCmd("node", [CHECK, "--spec", join(dir, "spec.json"), "--candidates", join(dir, "candidates.json"), "--comparator", join(dir, "bad.mjs")]);
  const good = await runCmd("node", [CHECK, "--spec", join(dir, "spec.json"), "--candidates", join(dir, "candidates.json"), "--comparator", join(dir, "good.mjs")]);

  const catchesBad = bad.code === 1;   // defect found
  const clearsGood = good.code === 0;  // equivalent
  const pass = catchesBad && clearsGood;
  return result(
    "t03", "mode-14", "serialization-order mismatch (tiebreak-check)",
    pass,
    `bad string comparator: ${catchesBad ? "CAUGHT (exit 1)" : "MISSED (exit " + bad.code + ")"}; ` +
    `good tuple comparator: ${clearsGood ? "CLEAR (exit 0)" : "FALSE ALARM (exit " + good.code + ")"}`,
    { catchesBad, clearsGood, badCode: bad.code, goodCode: good.code }
  );
}
