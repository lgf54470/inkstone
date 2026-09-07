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
// one app are free to diverge and never affect the shared snapshot. Values
// compare after var() resolution and color-syntax canonicalization (hex
// shorthand, channel case, alpha defaults, percent vs number), so cosmetic
// edits never count as drift while real value changes still do.
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

// Color spellings are canonicalized so cosmetic edits (channel case, hex
// shorthand, alpha defaults, percent vs number) never count as drift; other
// values compare as whitespace-collapsed text.
function normalizeValue(value) {
  const text = value.trim().replace(/\s+/g, ' ')
  return normalizeColors(text.toLowerCase())
}

const HEX_RE = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})\b/g
const COLOR_FN_RE = /\b(oklch|oklab|rgb|rgba|hsl|hsla|hwb|lab|lch)\s*\(/g

// Channel kinds per function: 'frac' maps a % channel to 0..1, 'scaled' maps
// rgb % to 0..255, 'plain' keeps a % channel's numeric value (lab/lch
// lightness), 'angle' strips a trailing deg, 'number' keeps a bare number.
const COLOR_CHANNEL_KINDS = {
  oklch: ['frac', 'number', 'angle'],
  oklab: ['frac', 'number', 'number'],
  rgb: ['scaled', 'scaled', 'scaled'],
  rgba: ['scaled', 'scaled', 'scaled'],
  hsl: ['angle', 'frac', 'frac'],
  hsla: ['angle', 'frac', 'frac'],
  hwb: ['angle', 'frac', 'frac'],
  lab: ['plain', 'number', 'number'],
  lch: ['plain', 'number', 'angle'],
}

function fmtNumber(value) {
  const n = Math.round(Number(value) * 10000) / 10000
  return Object.is(n, -0) ? '0' : String(n)
}

function canonicalChannel(channel, kind) {
  const text = channel.trim()
  if (text.endsWith('%')) {
    const num = Number(text.slice(0, -1))
    if (!Number.isFinite(num)) return text
    if (kind === 'scaled') return fmtNumber(num * 2.55)
    if (kind === 'frac') return fmtNumber(num / 100)
    return fmtNumber(num) // 'plain'
  }
  const num = Number(text.replace(/deg$/, ''))
  if (!Number.isFinite(num)) return text
  return fmtNumber(num)
}

// Split a function body into top-level arguments, honoring nested parens so
// var()/color-mix() arguments stay whole.
function splitTopLevel(text) {
  const out = []
  let depth = 0
  let current = ''
  for (const ch of text) {
    if (ch === '(') depth += 1
    if (ch === ')') depth -= 1
    if (depth === 0 && (ch === ',' || /\s/.test(ch))) {
      if (current) out.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current) out.push(current)
  return out
}

function canonicalColorFn(name, body) {
  const parts = splitTopLevel(body)
  const slash = parts.indexOf('/')
  const channels = slash === -1 ? parts : parts.slice(0, slash)
  const kinds = COLOR_CHANNEL_KINDS[name] ?? []
  const canon = channels.map((channel, index) => canonicalChannel(channel, kinds[index] ?? 'number'))
  let alpha = slash === -1 ? undefined : canonicalChannel(parts.slice(slash + 1).join(' '), 'frac')
  // Alpha 1 is the default and is omitted, so oklch(...) == oklch(... / 1).
  const alphaPart = alpha !== undefined && alpha !== '1' ? ` / ${alpha}` : ''
  return `${name}(${canon.join(' ')}${alphaPart})`
}

// Canonicalize hex tokens and color-function calls anywhere in the value, so
// shadow lists and color-mix() arguments normalize too.
function normalizeColors(text) {
  let out = ''
  let cursor = 0
  const hexOut = text.replace(HEX_RE, (match) => {
    const hex = match.slice(1)
    return hex.length === 3 || hex.length === 4
      ? `#${[...hex].map((c) => c + c).join('')}`
      : match
  })
  for (const match of hexOut.matchAll(COLOR_FN_RE)) {
    out += hexOut.slice(cursor, match.index)
    let depth = 1
    let close = match.index + match[0].length
    while (close < hexOut.length && depth > 0) {
      if (hexOut[close] === '(') depth += 1
      else if (hexOut[close] === ')') depth -= 1
      close += 1
    }
    const body = hexOut.slice(match.index + match[0].length, close - 1)
    out += canonicalColorFn(match[1], body)
    cursor = close
  }
  return out + hexOut.slice(cursor)
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
// the baseline snapshots for each shared token. Normalization runs again on
// the resolved value so a var()-alias spelling change compares equal.
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
        entries.set(name, normalizeValue(next))
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

export { normalizeName, normalizeValue, normalizeColors, resolveVars, tokenEntries, snapshotPayload, driftProblems, staleProblems }