// Core/program_settings/guide_settings/guidanceLevel.js
const vscode = require("vscode");

function getGuidanceLevel() {
  return vscode.workspace
    .getConfiguration("echocode")
    .get("guidanceLevel", "balanced");
}

function norm(t) {
  return (t ?? "").toString().replace(/\s+/g, " ").trim();
}

function firstSentence(t) {
  const s = norm(t);
  if (!s) return "";
  const m = s.match(/^(.+?[.!?])(\s|$)/);
  return m ? m[1].trim() : s;
}

function trim(t, max = 220) {
  const s = norm(t);
  if (!s) return "";
  if (s.length <= max) return s;

  const slice = s.slice(0, max);
  const stop = Math.max(
    slice.lastIndexOf("."),
    slice.lastIndexOf("!"),
    slice.lastIndexOf("?")
  );
  if (stop > 80) return slice.slice(0, stop + 1).trim();

  return slice.trimEnd() + "...";
}

/**
 * Backwards compatible inputs:
 * - where
 * - summary
 * - raw
 * - ruleHint
 * - suggestions (array)
 *
 * New structured inputs (recommended):
 * - detail, why, steps
 */
function formatHelpByGuidance(input) {
  const level = getGuidanceLevel();

  const where = input.where;
  const summary = input.summary;
  const detail = input.detail ?? input.raw;
  const why = input.why ?? input.ruleHint;
  const steps = input.steps ?? input.suggestions ?? [];

  const W = where ? `${norm(where)}.` : "";
  const S = norm(summary) || firstSentence(detail) || "I found something to improve here.";
  const D = norm(detail);
  const Y = norm(why);

  const step1 = norm(steps[0]);
  const step2 = norm(steps[1]);

  if (level === "guided") {
    // Coaching / checklist feel
    return [
      W,
      trim(S, 180),
      step1 ? `Next, ${trim(step1, 180)}` : "",
      step2 ? `Then, ${trim(step2, 180)}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (level === "balanced") {
    // Quick tutor feel
    return [
      W,
      trim(S, 200),
      Y ? trim(Y, 160) : "",
      step1 ? trim(step1, 200) : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  // Concise: location + ONE sentence only
  const conciseCore = firstSentence(D) || firstSentence(S);
  return [W, trim(conciseCore, 220)].filter(Boolean).join(" ");
}

module.exports = {
  getGuidanceLevel,
  formatHelpByGuidance,
};
