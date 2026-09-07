// AGENTS.md rule 2: the two UI trees share one design-token contract
// (src/client/styles/tokens.css and blog-frontend/src/styles/tokens.css).
// Tokens that exist in BOTH files are the shared layer — adding a token to
// only one app (or removing it from one side) silently diverges that layer.
// The baseline file snapshots the current shared-token set together with each
// token's value on both sides; the gate fails when a baseline token vanishes
// from either tree or when either side's value deviates from the snapshot
// (removing/renaming a shared token or changing its value is a deliberate act
// that needs a resnapshot), and also when the baseline itself is stale (a
// token newly shared by both trees is not in the snapshot). Tokens private to
// one app are free to diverge and never affect the shared snapshot.
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

// Values compare as text (whitespace-collapsed).
function normalizeValue(value) {
  return value.trim().replace(/\s+/g, ' ')
}

// Replace var(--x) references with the referenced token's own value until
// stable, so semantically identical spellings (a literal vs var(--alias))
// compare equal instead of drifting. Unresolvable or self-referential
// references stay verbatim; bounded passes keep cycles from looping.
function resolveVars(value, entries) {
  let result = value
  for (let depth = 0; depth < 8; depth += 1) {
    const next = result.replace(/var\((--[\w.-]+)\)/g, (match, name) => {
      const target = entries.get(normalizeName(name))
      return target === undefined || target === match ? match : target
    })
    if (next === result) return result
    result = next
  }
  return result
}

// name -> normalized, var()-resolved value; the per-side value pair is what
// the baseline snapshots for each shared token.
function tokenEntries(text) {
  const entries = new Map()
  for (const match of text.matchAll(DECL_RE)) {
    entries.set(normalizeName(match[1]), normalizeValue(match[2]))
  }
  let changed = true
  for (let depth = 0; depth < 8 && changed; depth += 1) {
    changed = false
    for (const [name, value] of entries) {
      const next = resolveVars(value, entries)
      if (next !== value) {
        entries.set(name, next)
        changed = true
      }
    }
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

// The snapshot is the source of truth: a token both trees now share but the
// baseline does not record leaves the snapshot stale even though nothing
// vanished or drifted.
function staleProblems(app, blog, baseline) {
  const snapshot = snapshotPayload(app, blog)
  const baselineTokens = new Set(baseline.tokens)
  return snapshot.tokens
    .filter((name) => !baselineTokens.has(name))
    .map((name) => `${name} added to both trees but absent from the baseline`)
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
  const problems = [...driftProblems(app, blog, baseline), ...staleProblems(app, blog, baseline)]
  if (problems.length > 0) {
    console.error(`token drift check failed: ${problems.length} shared-token problem(s)`)
    for (const problem of problems) console.error(`  ${problem}`)
    console.error('changing the shared token layer is a deliberate act: resnapshot with --update-baseline when intended')
    process.exit(1)
  }
  console.log(`token drift check passed: baseline matches the current shared token layer (${baseline.tokens.length} tokens, values stable)`)
}

export { normalizeName, normalizeValue, resolveVars, tokenEntries, snapshotPayload, driftProblems, staleProblems }