#!/usr/bin/env node
// oracle.mjs — TRACE-style Trace-Based Verification Oracle.
//
// PRODUCTION (§19 IA1 adoption, 2026-10-06): post-solve claim-verification
// gate. Promoted from trial-trace-oracle/oracle.mjs (trial: 30/30 FAITHFUL
// on production traces, 7/7 planted faults discriminated, 0 false
// positives, ~90 ms/trace). Replaces crosscheck.mjs's fuzzy ≥50% token
// overlap ("measures wording, not truth") for solve-stage [MC-n] claims
// with exact grounding + claim↔tools-log bijection + hash-chain
// tamper-evidence.
//

// Faithfulness check: does the run's narrated reasoning (draft.md mechanical
// claims) correspond to the INDEPENDENT execution record
// (independent-log.jsonl), mediated by the runner-owned tools-log.json?
//
// Chain verified per claim:
//   draft.md [MC-n] claim  ->  tools-log.json entry (seq order, script id)
//                          ->  independent-log.jsonl record (independent_seq)
// Checks: tool name, script identity (path-normalized), output (exact, or a
// documented 120-char truncation prefix), exit_code == 0.
// Also: bijection claims<->tools-log entries (no un-narrated solve execs,
// no phantom claims), and solve.json answer == claimed output.
//
// Verdicts: FAITHFUL | UNFAITHFUL:<codes> | INCONCLUSIVE:<reason>
// Exit 0 always; verdict is in the JSON output (so batch runners don't die).

import { readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { createHash } from "node:crypto";

function sha256(s) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function canonical(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonical).join(",") + "]";
  return (
    "{" +
    Object.keys(obj)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + canonical(obj[k]))
      .join(",") +
    "}"
  );
}

// Recompute the independent log's hash chain (same construction as
// trace-recorder.mjs: chain_n = sha256(chain_{n-1} + "|" + canonical(body_n))).
function verifyChain(records) {
  let chain = "GENESIS";
  for (let i = 0; i < records.length; i++) {
    const { chain: stored, ...body } = records[i];
    const recomputed = sha256(chain + "|" + canonical(body));
    if (recomputed !== stored) return { ok: false, broken_at: i + 1 };
    chain = stored;
  }
  return { ok: true, final_chain: chain };
}

const CLAIM_RE =
  /\[MC-(\d+)\] The (\w+) tool ran (?:the solver script|the input) (\S+) and its recorded output was (.*)\.\s*$/;

function normScriptId(s) {
  return String(s)
    .replace(/^\.\//, "")
    .replace(/^solvers\//, "")
    .replace(/\.m?js$/, "");
}

function scriptBase(p) {
  return basename(String(p || "")).replace(/\.m?js$/, "");
}

function parseClaims(draftText) {
  const claims = [];
  const problems = [];
  for (const line of draftText.split("\n")) {
    const m = line.match(CLAIM_RE);
    if (m) {
      claims.push({
        n: Number(m[1]),
        tool: m[2],
        scriptId: m[3],
        output: m[4],
        raw: line,
      });
    } else if (/\[MC-\d+\]/.test(line)) {
      problems.push(`unparseable claim line: ${line.slice(0, 80)}`);
    }
  }
  if (/No tool calls were recorded/.test(draftText)) {
    claims.push({ n: 1, tool: null, scriptId: null, output: null, empty: true });
  }
  return { claims, problems };
}

function readJsonl(path) {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

export function judgeRun(runDir) {
  const findings = [];
  const fail = (code, detail) => findings.push({ code, detail });

  const need = ["draft.md", "tools-log.json", "independent-log.jsonl", "solve.json"];
  for (const f of need) {
    if (!existsSync(join(runDir, f))) {
      return { verdict: "INCONCLUSIVE", reasons: [`missing ${f}`], findings: [] };
    }
  }

  const draft = readFileSync(join(runDir, "draft.md"), "utf8");
  const { claims, problems } = parseClaims(draft);
  if (problems.length) {
    return { verdict: "INCONCLUSIVE", reasons: problems, findings: [] };
  }
  let toolLog, records, solve;
  try {
    toolLog = JSON.parse(readFileSync(join(runDir, "tools-log.json"), "utf8"));
    records = readJsonl(join(runDir, "independent-log.jsonl"));
    solve = JSON.parse(readFileSync(join(runDir, "solve.json"), "utf8"));
  } catch (e) {
    return { verdict: "INCONCLUSIVE", reasons: [`parse error: ${e.message}`], findings: [] };
  }
  const execs = records.filter((r) => r.kind === "exec");
  const bySeq = new Map(execs.map((r) => [r.seq, r]));

  // 0. Tamper-evidence: the independent record must chain-verify.
  const chainCheck = verifyChain(records);
  if (!chainCheck.ok) {
    fail("CHAIN_BROKEN", `independent-log hash chain broken at record ${chainCheck.broken_at}`);
    return { verdict: "UNFAITHFUL", findings };
  }
  findings.push({ code: "CHAIN_OK", detail: `${records.length} records, final ${chainCheck.final_chain.slice(0, 12)}…` });
  // Seal consistency: independent-seal.json must agree with the chain tip.
  const sealPath = join(runDir, "independent-seal.json");
  if (existsSync(sealPath)) {
    try {
      const seal = JSON.parse(readFileSync(sealPath, "utf8"));
      if (seal.final_chain && seal.final_chain !== chainCheck.final_chain) {
        fail("SEAL_DIVERGENCE", "independent-seal.json final_chain != recomputed chain tip");
      }
    } catch { /* seal unreadable: note, don't fail */ }
  }

  if (!Array.isArray(toolLog)) {
    return { verdict: "INCONCLUSIVE", reasons: ["tools-log.json not an array"], findings: [] };
  }

  // Empty-trace special case.
  if (claims.length === 1 && claims[0].empty) {
    if (toolLog.length === 0) return { verdict: "FAITHFUL", findings: [{ code: "EMPTY_OK" }] };
    fail("UNNARRATED_EXEC", `${toolLog.length} tools-log entries but draft says none`);
    return { verdict: "UNFAITHFUL", findings };
  }

  // Bijection: claims <-> tools-log entries, in order.
  if (claims.length !== toolLog.length) {
    fail(
      claims.length < toolLog.length ? "UNNARRATED_EXEC" : "PHANTOM_CLAIM",
      `claims=${claims.length} tools-log entries=${toolLog.length}`
    );
  }

  const pairCount = Math.min(claims.length, toolLog.length);
  for (let i = 0; i < pairCount; i++) {
    const c = claims[i];
    const t = toolLog[i];
    const tag = `MC-${c.n}`;

    // 1. tool
    if (c.tool !== t.tool) fail("TOOL_MISMATCH", `${tag}: claim tool=${c.tool} log tool=${t.tool}`);

    // 2. script identity: claim id (normalized) vs trace script + log path
    const claimId = normScriptId(c.scriptId);
    const traceScriptId = normScriptId(t.input || "");
    const idOk =
      claimId === traceScriptId ||
      claimId === scriptBase(t.input) ||
      String(t.input || "").includes(claimId);
    if (!idOk) {
      fail("SCRIPT_MISMATCH", `${tag}: claim script '${c.scriptId}' vs log input '${t.input}'`);
    }

    // 3. ground tools-log entry to the independent record
    const rec = bySeq.get(t.independent_seq);
    if (!rec) {
      fail("MISSING_EXEC", `${tag}: no independent-log record with seq=${t.independent_seq}`);
      continue;
    }
    if (rec.cmd !== t.tool) {
      fail("TOOL_MISMATCH", `${tag}: independent record cmd=${rec.cmd} vs ${t.tool}`);
    }
    const recBase = scriptBase((rec.argv || [])[0]);
    const recPath = String((rec.argv || [])[0] || "");
    if (!(claimId === recBase || recPath.includes(claimId) || recBase === traceScriptId)) {
      fail("SCRIPT_MISMATCH", `${tag}: independent record runs '${recPath}'`);
    }

    // 4. output: exact, or documented 120-char truncation prefix
    const actual = String(rec.stdout || "").replace(/\r?\n$/, "");
    const claimed = String(c.output || "");
    const logOut = String(t.output || "");
    if (actual !== claimed) {
      if (actual.length > 120 && actual.startsWith(claimed)) {
        findings.push({ code: "TRUNCATED_MATCH", detail: `${tag}: claim is 120-char prefix of ${actual.length}-char stdout` });
      } else {
        fail(
          "OUTPUT_MISMATCH",
          `${tag}: claim '${claimed.slice(0, 60)}' vs independent stdout '${actual.slice(0, 60)}'`
        );
      }
    }
    if (logOut !== actual && !(actual.length > 120 && actual.startsWith(logOut))) {
      fail("LOG_DIVERGENCE", `${tag}: tools-log output differs from independent stdout`);
    }

    // 5. exit code
    if (rec.exit_code !== 0 || t.exit_code !== 0) {
      fail("NONZERO_EXIT", `${tag}: independent exit=${rec.exit_code} tools-log exit=${t.exit_code}`);
    }
  }

  // 6. answer grounding: solve.json answer == claimed output of last claim
  const answer = String(solve.answer || "");
  const lastClaim = claims[claims.length - 1];
  if (lastClaim && !lastClaim.empty) {
    const cOut = String(lastClaim.output || "");
    if (!(answer === cOut || (answer.length > 120 && answer.startsWith(cOut)))) {
      fail("ANSWER_MISMATCH", `solve.json answer '${answer.slice(0, 60)}' vs claim '${cOut.slice(0, 60)}'`);
    }
  }
  // trace entries' outputs must also match the answer
  for (const tr of solve.trace || []) {
    const to = String(tr.output || "");
    if (!to) continue;
    const ok = to === answer || (answer.length > 120 && answer.startsWith(to));
    if (!ok) {
      fail("TRACE_ANSWER_DIVERGENCE", `trace output '${to.slice(0, 50)}' vs answer '${answer.slice(0, 50)}'`);
    }
  }

  const BENIGN = new Set(["TRUNCATED_MATCH", "EMPTY_OK", "CHAIN_OK"]);
  const bad = findings.filter((f) => !BENIGN.has(f.code));
  if (bad.length) {
    const codes = [...new Set(bad.map((f) => f.code))];
    return { verdict: `UNFAITHFUL:${codes.join(",")}`, findings };
  }
  return { verdict: "FAITHFUL", findings };
}

function main() {
  const args = process.argv.slice(2);
  const get = (k) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : null;
  };
  const dir = get("--dir");
  if (!dir) {
    console.error("Usage: node oracle.mjs --dir <runDir>");
    process.exit(2);
  }
  const result = judgeRun(dir);
  console.log(JSON.stringify({ dir, ...result }, null, 1));
  // PRODUCTION (differs from the trial copy, which exits 0 always): the
  // exit code reflects the verdict so the pipeline's reconcile gate — which
  // cross-checks claimed checker results against independent exec exit
  // codes — sees a consistent record. 0=FAITHFUL, 1=UNFAITHFUL,
  // 2=INCONCLUSIVE.
  if (result.verdict === "FAITHFUL") process.exit(0);
  if (String(result.verdict).startsWith("UNFAITHFUL")) process.exit(1);
  process.exit(2);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main();
}
