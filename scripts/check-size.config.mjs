// Single source of truth for the AGENTS.md code-size limits (single file
// <= maxFileLines, single function <= maxFnLines, nesting <= maxNesting).
// Override per invocation with SIZE_LIMITS='{"maxFnLines":80}' for experiments.
const DEFAULT_SIZE_LIMITS = Object.freeze({
  maxFileLines: 500,
  maxFnLines: 50,
  maxNesting: 3,
})

export function readSizeLimits(env = process.env) {
  const raw = env.SIZE_LIMITS
  if (!raw) return DEFAULT_SIZE_LIMITS
  const parsed = JSON.parse(raw)
  const pick = (key, fallback) =>
    Number.isInteger(parsed[key]) && parsed[key] > 0 ? parsed[key] : fallback
  return {
    maxFileLines: pick('maxFileLines', DEFAULT_SIZE_LIMITS.maxFileLines),
    maxFnLines: pick('maxFnLines', DEFAULT_SIZE_LIMITS.maxFnLines),
    maxNesting: pick('maxNesting', DEFAULT_SIZE_LIMITS.maxNesting),
  }
}
