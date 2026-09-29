#!/usr/bin/env node
/**
 * One-off regeneration of the comment allowlist inside check-comments.mjs.
 * Reads the comments through the same scanner the checker uses
 * (`scripts/lib/comment-scan.mjs`), so the allowlist stays an exact inventory of
 * every comment in the scanned files. Run: node scripts/sync-comments-allowlist.mjs
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { commentsIn } from './lib/comment-scan.mjs'

const ROOTS = ['src', 'scripts', 'tests']
const EXTRA_FILES = ['vite.config.ts', 'vitest.config.ts', 'pwa.config.ts', 'index.html', 'wrangler.toml']

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(target)
    else yield target
  }
}

function relative(file) {
  return path.relative(process.cwd(), file).replaceAll('\\', '/')
}

function commentsOf(file, text) {
  return commentsIn(file, text).map((comment) => comment.text)
}

const inventory = new Map()
const files = [
  ...ROOTS.filter((root) => existsSync(root)).flatMap((root) => [...walk(path.resolve(root))]),
  ...EXTRA_FILES.map((file) => path.resolve(file)),
]
for (const file of files) {
  const extension = path.extname(file).toLowerCase()
  if (!['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(extension)) continue
  const name = relative(file)
  const comments = commentsOf(file, readFileSync(file, 'utf8'))
  if (comments.length) inventory.set(name, comments)
}

function jsEscape(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
}

const lines = ['const allowed = new Map([']
for (const [name, comments] of [...inventory.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
  lines.push(`  ['${name}', [`)
  for (const comment of comments) lines.push(`    '${jsEscape(comment)}',`)
  lines.push('  ]],')
}
lines.push('])')

const target = 'scripts/check-comments.mjs'
const text = readFileSync(target, 'utf8')
const start = text.indexOf('const allowed = new Map([')
const endMatch = /\n\]\)\n/.exec(text.slice(start))
if (start < 0 || !endMatch) {
  console.error('could not locate the allowlist map')
  process.exit(1)
}
const end = start + endMatch.index + endMatch[0].length
writeFileSync(target, text.slice(0, start) + lines.join('\n') + '\n' + text.slice(end))
console.log(`regenerated allowlist: ${inventory.size} files, ${[...inventory.values()].reduce((n, c) => n + c.length, 0)} comments`)