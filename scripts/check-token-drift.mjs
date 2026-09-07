// AGENTS.md rule 2: the two UI trees share one design-token contract
// (src/client/styles/tokens.css and blog-frontend/src/styles/tokens.css).
// Tokens that exist in BOTH files are the shared layer — adding a token to
// only one app (or removing it from one side) silently diverges that layer.
// The baseline file snapshots the current shared-token set together with each
// token's value on both sides; the gate fails when a baseline token vanishes
// from either tree or when either side's value deviates from the snapshot
// (removing/renaming a shared token or changing its value is a deliberate act
// that needs a resnapshot), while tokens private to one app are free to
// diverge and newly shared tokens pass automatically.
// Usage: node scripts/check-token-drift.mjs [--update-baseline]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_TOKENS = 'src/client/styles/tokens.css'
const BLOG_TOKENS = 'blog-frontend/src/styles/tokens.css'
const BASELINE = 'scripts/check-token-drift.baseline.json'

// Custom-property declarations (--name: value;), with CSS escapes unescaped
// so the same logical token (--text-13\.5 vs --text-13.5) compares equal.
const DECL_RE = /(--[A-Za-z0-9_.\\-]+)\s*:\s*([^;]*);/g

function normalizeName(name) {
  return name
    .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\(.)/g, '$1')
}

// Values compare as text (whitespace-collapsed): the baseline records each
// side's spelling, so a var() reference and an equivalent literal only count
// as drift when one side actually changes.
function normalizeValue(value) {
  return value.trim().replace(/\s+/g, ' ')
}

// name -> normalized value; the per-side value pair is what the baseline
// snapshots for each shared token.
function tokenEntries(text) {
  const entries = new Map()
  for (const match of text.matchAll(DECL_RE)) {
    entries.set(normalizeName(match[1]), normalizeValue(match[2]))
  }
  return entries
}

// Shared-token set plus per-side values — the baseline payload.
function snapshotPayload(app, blog) {
  const tokens = [...app.keys()].filter((name) => blog.has(name)).sort()
  const values = {}
  for (const name of tokens) values[name] = { app: app.get(name), blog: blog.get(name) }
  return { tokens, values }
}

// A baseline token fails when it vanished from a side, or when a side's
// value no longer matches the snapshotted pair.
function driftProblems(app, blog, baseline) {
  const problems = []
  for (const name of baseline.tokens) {
    if (!app.has(name) || !blog.has(name)) {
      const sides = []
      if (!app.has(name)) sides.push(APP_TOKENS)
      if (!blog.has(name)) sides.push(BLOG_TOKENS)
      problems.push(`${name} missing from ${sides.join(' and ')}`)
      continue
    }
    const recorded = baseline.values && baseline.values[name]
    const current = { app: app.get(name), blog: blog.get(name) }
    if (recorded && (current.app !== recorded.app || current.blog !== recorded.blog)) {
      problems.push(`${name} value drifted: ${APP_TOKENS} '${current.app}' != baseline '${recorded.app}', ${BLOG_TOKENS} '${current.blog}' != baseline '${recorded.blog}'`)
    } else if (!recorded && current.app !== current.blog) {
      problems.push(`${name} value differs between trees: '${current.app}' vs '${current.blog}'`)
    }
  }
  return problems
}

// Importable by unit tests; the tree scan only runs when invoked as a CLI.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const app = tokenEntries(fs.readFileSync(APP_TOKENS, 'utf8'))
  const blog = tokenEntries(fs.readFileSync(BLOG_TOKENS, 'utf8'))

  if (process.argv.includes('--update-baseline')) {
    const payload = snapshotPayload(app, blog)
    fs.writeFileSync(BASELINE, `${JSON.stringify(payload, null, 2)}\n`)
    console.log(`token drift baseline updated: ${payload.tokens.length} shared tokens`)
    process.exit(0)
  }

  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
  const problems = driftProblems(app, blog, baseline)
  if (problems.length > 0) {
    console.error(`token drift check failed: ${problems.length} shared-token problem(s)`)
    for (const problem of problems) console.error(`  ${problem}`)
    console.error('removing/renaming a shared token or changing its value is a deliberate act: resnapshot with --update-baseline when intended')
    process.exit(1)
  }
  console.log(`token drift check passed: ${baseline.tokens.length} shared tokens across both trees with stable values`)
}

export { normalizeName, normalizeValue, tokenEntries, snapshotPayload, driftProblems }