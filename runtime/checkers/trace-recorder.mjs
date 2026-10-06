#!/usr/bin/env node
// trace-recorder.mjs — §19 D1 trial (Rashomon): INDEPENDENT trace recorder.
//
// The runner records every exec call through THIS module, in the runner's own
// process, appending to a log file the solver subprocess never receives a
// handle or path to (not passed in argv or env). The solver's self-report
// (solve.json trace etc.) is a separate, agent-controlled channel. A
// reconciler (reconcile.mjs) then diffs the two channels — this is the dual-
// record architecture Rashomon proposes: the independent record stays quiet
// unless it diverges from the narration.
//
// Integrity: each record is hash-chained to the previous one
// (record_n.chain = sha256(record_{n-1}.chain || canonical_json(record_n))),
// so post-hoc editing of the independent log is detectable. The final digest
// is written at seal time.
//
// Trial code only: does NOT rewire pipeline.mjs.

import { openSync, writeSync, closeSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";

const CAP = 4096; // stdout/stderr capture cap per record

function sha256(s) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function canonical(obj) {
  // Deterministic JSON: sorted keys, recursive.
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonical).join(",") + "]";
  return "{" + Object.keys(obj).sort().map((k) => JSON.stringify(k) + ":" + canonical(obj[k])).join(",") + "}";
}

export function createRecorder(logPath) {
  const fd = openSync(logPath, "a");
  let seq = 0;
  let chain = "GENESIS";
  // If resuming an existing log, rebuild chain from the last record.
  try {
    const existing = readFileSync(logPath, "utf8").split("\n").filter(Boolean);
    seq = existing.length;
    if (existing.length) chain = JSON.parse(existing[existing.length - 1]).chain;
  } catch { /* fresh log */ }

  function append(rec) {
    seq += 1;
    const body = { seq, ...rec };
    chain = sha256(chain + "|" + canonical(body));
    body.chain = chain;
    writeSync(fd, JSON.stringify(body) + "\n");
    return body;
  }

  // Run cmd/args, capturing everything. Never throws on nonzero exit — the
  // failure IS the record (Rashomon must see failed commands).
  // Uses spawnSync (not execFileSync): execFileSync discards stderr on
  // success, but the independent record must capture BOTH streams —
  // a solver exfiltrating via stderr must be visible in the log.
  function exec(cmd, args, opts = {}) {
    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    let stdout = "", stderr = "", exitCode = null, signal = null;
    try {
      const r = spawnSync(cmd, args, {
        encoding: "utf8",
        timeout: opts.timeout || 120000,
        cwd: opts.cwd,
        env: opts.env,
        maxBuffer: 16 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      });
      stdout = String(r.stdout || "");
      stderr = String(r.stderr || "");
      exitCode = r.status;
      signal = r.signal || null;
      if (r.error) {
        // spawnSync error (e.g. timeout): record it.
        stderr += (stderr ? "\n" : "") + `[recorder] spawn error: ${r.error.message || r.error.code}`;
        if (r.error.code === "ETIMEDOUT" || /timed out/i.test(r.error.message || "")) exitCode = 124;
        else if (exitCode === null) exitCode = 127;
      }
    } catch (e) {
      stderr = String(e.message || e);
      exitCode = 127;
    }
    const durationMs = Date.now() - t0;
    return append({
      kind: "exec",
      cmd, argv: args,
      cwd: opts.cwd || process.cwd(),
      started_at: startedAt,
      duration_ms: durationMs,
      exit_code: exitCode,
      signal,
      stdout: stdout.slice(0, CAP),
      stdout_truncated: stdout.length > CAP,
      stdout_sha256: sha256(stdout),
      stdout_bytes: stdout.length,
      stderr: stderr.slice(0, CAP),
      stderr_truncated: stderr.length > CAP,
    });
  }

  function note(kind, payload) {
    return append({ kind, ...payload });
  }

  function seal(sealPath) {
    const digest = { sealed_at: new Date().toISOString(), records: seq, final_chain: chain, log_path: logPath };
    // seal.json written through a separate handle, not via append (not a record).
    const sfd = openSync(sealPath, "w");
    writeSync(sfd, JSON.stringify(digest, null, 2) + "\n");
    closeSync(sfd);
    closeSync(fd);
    return digest;
  }

  return { exec, note, seal, get seq() { return seq; }, get chain() { return chain } };
}

export function verifyChain(logPath) {
  // Recompute the chain; returns {ok, records, broken_at}.
  const lines = readFileSync(logPath, "utf8").split("\n").filter(Boolean);
  let chain = "GENESIS";
  for (let i = 0; i < lines.length; i++) {
    const rec = JSON.parse(lines[i]);
    const { chain: stored, ...body } = rec;
    const recomputed = sha256(chain + "|" + canonical(body));
    if (recomputed !== stored) return { ok: false, records: lines.length, broken_at: i + 1 };
    chain = stored;
  }
  return { ok: true, records: lines.length, final_chain: chain };
}
