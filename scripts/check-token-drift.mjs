// AGENTS.md rule 2: the two UI trees share one design-token contract
// (src/client/styles/tokens.css and blog-frontend/src/styles/tokens.css).
// Tokens that exist in BOTH files are the shared layer — adding a token to
// only one app (or removing it from one side) silently diverges that layer.
// The baseline file snapshots the current shared-token set; the gate fails
// when a baseline token vanishes from either tree (removing/renaming a shared
// token is a deliberate act that needs a resnapshot), while tokens private to
// one app are free to diverge and newly shared tokens pass automatically.
// Usage: node scripts/check-token-drift.mjs [--update-baseline]
import fs from 'node:fs'

const APP_TOKENS = 'src/client/styles/tokens.css'
const BLOG_TOKENS = 'blog-frontend/src/styles/tokens.css'
const BASELINE = 'scripts/check-token-drift.baseline.json'

// Custom-property declarations (--name:), with CSS escapes unescaped so the
// same logical token (--text-13\.5 vs --text-13.5) compares equal.
const DECL_RE = /(--[A-Za-z0-9_.\\-]+)\s*:/g

function tokenNames(file) {
  const text = fs.readFileSync(file, 'utf8')
  const names = new Set()
  for (const match of text.matchAll(DECL_RE)) {
    names.add(match[1]
      .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\(.)/g, '$1'))
  }
  return names
}

const app = tokenNames(APP_TOKENS)
const blog = tokenNames(BLOG_TOKENS)
const shared = [...app].filter((name) => blog.has(name)).sort()

if (process.argv.includes('--update-baseline')) {
  fs.writeFileSync(BASELINE, `${JSON.stringify({ tokens: shared }, null, 2)}\n`)
  console.log(`token drift baseline updated: ${shared.length} shared tokens`)
  process.exit(0)
}

const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))

const missing = baseline.tokens.filter((name) => !app.has(name) || !blog.has(name))
if (missing.length > 0) {
  console.error(`token drift check failed: ${missing.length} shared token(s) vanished from one tree`)
  for (const name of missing) {
    const sides = []
    if (!app.has(name)) sides.push(APP_TOKENS)
    if (!blog.has(name)) sides.push(BLOG_TOKENS)
    console.error(`  ${name} missing from ${sides.join(' and ')}`)
  }
  console.error('removing/renaming a shared token is a deliberate act: resnapshot with --update-baseline when intended')
  process.exit(1)
}
console.log(`token drift check passed: ${shared.length} shared tokens across both trees (baseline ${baseline.tokens.length})`)