#!/usr/bin/env node
// solve-critique.mjs — Reasoning Runtime, Phase 6 (+ v10 format support, workstream E3).
// Heuristic flaw detection for "argument critique" tasks.
// Graceful partial automation: structural parse + suspicion scoring, NOT a proof.
// Output is labeled `plausible` by the batch runner, never `supported`.
//
// v10 formats handled (detected from the prompt, PROMPTS ONLY):
//   A) Flawed-step localization:
//        "Reasoning chain:\nStep 1: ...\nStep 2: ...\nWhich step contains the logical flaw? Output ONLY like 'step-1'."
//        Output: STEP-N (uppercase: the runtime's solve gate requires ^STEP-\d+$;
//        scoring is case-insensitive, so this is score-identical to 'step-N').
//   B) Fallacy-name classification:
//        "What fallacy does this argument commit? Output ONLY one of: base-rate-neglect | ad-hominem | ..."
//        Output: the winning option token, verbatim as listed.
//   Legacy (v8/v9): "Premises:\nP1: ...\nArgument:\nSTEP-1: ...". Output: STEP-N.
//
// Mode-17 spirit: fail loudly (exit 1) on unparseable structure or when no
// suspicion signal fires — never emit a vacuous verdict.
//
// Usage: node solve-critique.mjs --prompt <file> [--chain-out <file>]
// Prints the verdict on stdout (last line is the answer); diagnostics to stderr.
// Also writes chain.json to --chain-out <file> if given (for arg-check).

import { readFileSync, writeFileSync } from "node:fs";

function getArg(argv, name) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === name) return argv[++i];
  }
  return null;
}

// --- Suspicion signals for flawed-step scoring: [regex, weight, note] ---
const STEP_SIGNALS = [
  [/\bmust\b/i, 3, "strong modal 'must'"],
  [/\bnecessarily\b/i, 3, "strong modal 'necessarily'"],
  [/\bcertainly\b/i, 3, "'certainly'"],
  [/almost certainly|highly likely/i, 3, "overstated likelihood"],
  [/\bdefinitely\b/i, 3, "'definitely'"],
  [/\bproves?\b/i, 2, "'prove' overclaim"],
  [/\bevery\b/i, 2, "universal 'every'"],
  [/\ball\b/i, 1, "universal 'all'"],
  [/\bfull\b(?!\s+(testing|analysis|sample|dataset|plan|picture|record|account|data|set|results|report))/i, 2, "'full' (overstates magnitude)"],
  [/therefore (safer|better|more)/i, 2, "'therefore' + positive evaluation"],
  [/should continue|should (not )?stop/i, 2, "action prescription"],
  [/\bwaste\b/i, 1, "'waste' framing"],
  [/\bcaus(?:e|es|ed|ing)\b/i, 2, "causal overclaim"],
  [/\bconfirms?\b/i, 2, "confirmation overclaim"],
  [/\b(therefore|thus|hence)\b[^.]*\bprobability\b[^.]*\bis\b[^.]*\d+\s+in/i, 3, "prosecutor's conditional inversion"],
  [/incorporates all lessons/i, 3, "appeal to novelty"],
  [/newer,? it (necessarily|therefore)/i, 2, "novelty inference"],
  [/\bstill\b.*(highly likely|almost certain|must|certainly|likely)/i, 4, "reasserts refuted claim ('still')"],
  [/\btherefore\b.*\b(still|again)\b/i, 2, "'therefore' reassertion"],
  // v10 addition: "therefore X is a Y" — a conclusion step that inverts a
  // universal premise (affirming the consequent / illicit conversion), the
  // classic single-flaw shape in the v10 reasoning-chain format.
  [/\b(therefore|thus|hence)\b[^.]{0,80}\bis (a|an|the)\b/i, 4, "therefore asserts category membership (converse inference)"],
  [/\b(therefore|thus|hence|so,?)\b/i, 1, "draws a conclusion"],
];

// --- Fallacy-name signals: option label -> [regex, weight] ---
// Only options listed in the prompt's "Output ONLY one of:" are scored.
const FALLACY_SIGNALS = {
  "base-rate-neglect": [
    [/\b\d+\s*%\s*accura/i, 3],
    [/\b1 in [\d,]+/i, 3],
    [/\bprevalence\b|\bbase rate\b/i, 3],
    [/\bfalse[- ]positive\b/i, 2],
    [/test(ed)? positive.*chance you (have|are)/i, 3],
  ],
  "ad-hominem": [
    [/\byou'?re (just |an? |nothing but )/i, 3],
    [/attack.*person|insult|character assassination/i, 3],
    [/rather than the argument|instead of the (evidence|argument)/i, 2],
  ],
  "strawman": [
    [/\bso you'?re saying\b/i, 3],
    [/misrepresent|distort.*position|nobody (said|claimed)/i, 3],
  ],
  "false-dilemma": [
    [/\beither\b.*\bor\b/i, 3],
    [/\bonly two (options|choices|alternatives)/i, 3],
    [/\bno middle ground\b/i, 2],
  ],
  "appeal-to-authority": [
    [/\bdr\.\s*[A-Z]/i, 3],
    [/\bexpert(s)? (say|says|agree)/i, 3],
    [/\bprofessor\b|\bnobel\b/i, 2],
    [/according to .*authority|trust the experts/i, 2],
  ],
  "correlation-not-causation": [
    [/therefore .*?\b(bring|cause[sd]?|make[sd]?|lead[sd]? to)\b/i, 3],
    [/more .*? higher .*? therefore/i, 3],
    [/\bcorrelat/i, 2],
    [/\bassociated with\b/i, 2],
  ],
  "sampling-bias": [
    [/surveyed only|only .*surveyed/i, 3],
    [/\bsample of\b/i, 2],
    [/\brespondents\b|\bvolunteers\b/i, 2],
    [/self[- ]select/i, 2],
  ],
  "survivorship-bias": [
    [/\bsurviv/i, 3],
    [/failed .*business|bankrupt/i, 2],
  ],
  "texas-sharpshooter": [
    [/after the fact/i, 3],
    [/\bpaint.*target\b/i, 3],
    [/\bcluster\b/i, 2],
    [/highlight.*random|cherry[- ]pick/i, 2],
  ],
};

// Parse "Step 1: ...", "STEP-1: ..." etc.
function parseV10Steps(text) {
  const steps = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    const m = t.match(/^(?:step|STEP)[-\s]?(\d+):\s*(.*)$/i);
    if (m) steps.push({ n: Number(m[1]), text: m[2] });
  }
  return steps;
}

// Legacy v8/v9 parse: Premises: P1: ... / Argument: STEP-1: ...
function parseLegacy(text) {
  const premises = [];
  const steps = [];
  const lines = text.split("\n");
  let section = null;
  for (const line of lines) {
    const t = line.trim();
    if (/^Premises:/i.test(t)) { section = "premises"; continue; }
    if (/^Argument:/i.test(t)) { section = "steps"; continue; }
    const pm = t.match(/^(P\d+):\s*(.*)/);
    if (pm && section === "premises") { premises.push({ id: pm[1], text: pm[2] }); continue; }
    const sm = t.match(/^(STEP-\d+):\s*(.*)/);
    if (sm) steps.push({ id: sm[1], text: sm[2] });
  }
  return { premises, steps };
}

// "Output ONLY one of: a | b | c." -> ["a","b","c"]
function parseOptions(text) {
  const m = text.match(/Output ONLY one of:\s*([^\n]+)/i);
  if (!m) return null;
  return m[1].split("|").map((s) => s.trim().replace(/[.\s]+$/, "")).filter(Boolean);
}

function scoreStep(step) {
  let score = 0;
  const hits = [];
  for (const [re, weight, note] of STEP_SIGNALS) {
    if (re.test(step.text)) {
      score += weight;
      hits.push(note);
    }
  }
  return { score, hits };
}

function scoreFallacy(text, option) {
  const signals = FALLACY_SIGNALS[option];
  if (!signals) return { score: 0, hits: [] };
  let score = 0;
  const hits = [];
  for (const [re, weight] of signals) {
    const m = text.match(re);
    if (m) {
      score += weight;
      hits.push(m[0].slice(0, 40));
    }
  }
  return { score, hits };
}

function main() {
  const argv = process.argv.slice(2);
  const promptFile = getArg(argv, "--prompt");
  if (!promptFile) {
    console.error("Usage: node solve-critique.mjs --prompt <file> [--chain-out <file>]");
    process.exit(2);
  }
  const text = readFileSync(promptFile, "utf8");

  // Never score the option list itself: an option's name can self-match a
  // signal (e.g. /correlat/ on "correlation-not-causation").
  const scoringText = text.replace(/^.*Output ONLY one of:.*$/gim, "");

  const isStepQuestion = /Which step contains the logical flaw/i.test(text);
  const isFallacyQuestion = /What (fallacy does this argument commit|is the flaw)/i.test(text);
  const options = parseOptions(text);

  let verdict = null;
  let chain = null;

  if (isStepQuestion) {
    // Variant A: flawed-step localization.
    const steps = parseV10Steps(text);
    if (steps.length === 0) {
      console.error("[solve-critique] FATAL: step question but no 'Step N:' lines parsed");
      process.exit(1);
    }
    let best = null;
    for (const step of steps) {
      const { score, hits } = scoreStep(step);
      const hasConclusion = /\b(therefore|thus|hence|so,?)\b/i.test(step.text);
      console.error(`[solve-critique] step-${step.n}: score=${score} ${hits.join("; ")}`);
      const key = [score, hasConclusion ? 1 : 0, step.n];
      if (!best || key[0] > best.key[0] ||
          (key[0] === best.key[0] && (key[1] > best.key[1] ||
            (key[1] === best.key[1] && key[2] > best.key[2])))) {
        best = { n: step.n, score, hits, key };
      }
    }
    if (best.score === 0) {
      console.error("[solve-critique] FATAL: inconclusive — no suspicion signals fired on any step; refusing to guess");
      process.exit(1);
    }
    verdict = `STEP-${best.n}`;
    console.error(`[solve-critique] winner=${verdict} (score ${best.score})`);
    chain = {
      claim: "Exactly one reasoning step contains a logical flaw",
      premises: steps.map((s) => ({ id: `P${s.n}`, text: s.text.slice(0, 200), source: "stated" })),
      steps: steps.map((s, i) => ({
        id: `S${s.n}`,
        from: i === 0 ? [`P${s.n}`] : steps.slice(0, i + 1).map((x) => `P${x.n}`),
        rule: "sequential-elaboration",
        to: `C${i + 1}`,
      })),
      conclusion: `C${steps.length}`,
    };
    for (let i = 0; i < steps.length; i++) {
      chain.premises.push({ id: `C${i + 1}`, text: steps[i].text.slice(0, 200), source: "derived" });
    }
  } else if (isFallacyQuestion && options) {
    // Variant B: fallacy-name classification.
    let best = null;
    for (const opt of options) {
      const { score, hits } = scoreFallacy(scoringText, opt);
      console.error(`[solve-critique] ${opt}: score=${score} ${hits.join("; ")}`);
      if (!best || score > best.score) best = { opt, score, hits };
    }
    if (!best || best.score === 0) {
      console.error("[solve-critique] FATAL: inconclusive — no fallacy signals fired for any listed option; refusing to guess");
      process.exit(1);
    }
    verdict = best.opt;
    console.error(`[solve-critique] winner=${verdict} (score ${best.score})`);
    const argText = text.split(/What (fallacy does this argument commit|is the flaw)/i)[0].trim().slice(0, 400);
    chain = {
      claim: `The argument commits the fallacy: ${verdict}`,
      premises: [{ id: "P1", text: argText, source: "stated" }],
      steps: [{ id: "S1", from: ["P1"], rule: "fallacy-classification", to: "C1" }],
      conclusion: "C1",
    };
    chain.premises.push({ id: "C1", text: `Fallacy classification: ${verdict}`, source: "derived" });
  } else {
    // Legacy v8/v9 format fallback.
    const { premises, steps } = parseLegacy(text);
    if (steps.length === 0) {
      console.error("[solve-critique] FATAL: no steps parsed (unrecognized format)");
      process.exit(1);
    }
    const body = steps.slice(0, -1);
    let best = null;
    for (const step of body) {
      const { score, hits } = scoreStep(step);
      console.error(`[solve-critique] ${step.id}: score=${score} ${hits.join("; ")}`);
      if (!best || score > best.score) best = { id: step.id, score, hits };
    }
    if (best.score === 0) {
      console.error("[solve-critique] FATAL: inconclusive — no suspicion signals fired on any step; refusing to guess");
      process.exit(1);
    }
    verdict = best.id;
    console.error(`[solve-critique] winner=${verdict} (score ${best.score})`);
    chain = {
      claim: "Exactly one argument step contains a logical flaw",
      premises: premises.map((p) => ({ id: p.id, text: p.text.slice(0, 200), source: "stated" })),
      steps: steps.map((s, i) => ({
        id: s.id,
        from: i === 0 ? premises.map((p) => p.id) : [...premises.map((p) => p.id), `C${i}`],
        rule: "sequential-elaboration",
        to: `C${i + 1}`,
      })),
      conclusion: `C${steps.length}`,
    };
    for (let i = 0; i < steps.length; i++) {
      chain.premises.push({ id: `C${i + 1}`, text: steps[i].text.slice(0, 200), source: "derived" });
    }
  }

  // Write chain.json for arg-check (structural validation of the parse).
  const chainOut = getArg(argv, "--chain-out");
  if (chainOut) {
    writeFileSync(chainOut, JSON.stringify(chain, null, 2) + "\n");
  }

  console.log(verdict);
}

main();
