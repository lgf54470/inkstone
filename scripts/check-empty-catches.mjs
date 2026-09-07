// AGENTS.md rule 5: an empty catch body swallows the failure without
// handling it or rethrowing with context, so a bare `catch {}` is banned.
// This walks src/scripts/tests and the root-level .ts configs with the TS
// AST (so the pattern inside comments or strings never counts) and flags
// catch clauses whose body has no statements AND no comment. A comment-only
// catch is documented intent: for src/scripts/tests the exact comment text
// is then enforced by check-comments.mjs, so an unexplained swallow cannot
// sneak through either gate.
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const DIRS = ['src', 'scripts', 'tests']
const ROOT_FILES = ['vite.config.ts', 'vitest.config.ts', 'pwa.config.ts']
const EXCLUDED_DIRS = new Set(['node_modules', 'dist', '.git', '.wrangler'])

function walk(directory, out = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(entry.name)) continue
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) out = walk(target, out)
    else if (/\.(ts|tsx|mjs|js|cjs)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(target)
  }
  return out
}

function emptyCatches(file, text) {
  const kind = /\.(ts|tsx)$/.test(file) ? ts.ScriptKind.TS : ts.ScriptKind.JS
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind)
  const found = []
  function visit(node) {
    if (node.kind === ts.SyntaxKind.TryStatement && node.catchClause && node.catchClause.block && node.catchClause.block.statements.length === 0) {
      const inner = text.slice(node.catchClause.block.getStart(sf), node.catchClause.block.getEnd())
      // A block with zero statements can only hold whitespace and comments,
      // so a comment scan over its raw text cannot false-positive.
      if (!/\/\*[\s\S]*?\*\/|\/\/[^\n]*/.test(inner)) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1
        found.push(`${file}:${line}: empty catch body with no rationale comment (AGENTS.md rule 5)`)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}

const problems = []
for (const root of DIRS) {
  for (const file of walk(path.resolve(root))) {
    const rel = path.relative(process.cwd(), file).replaceAll('\\', '/')
    problems.push(...emptyCatches(rel, fs.readFileSync(file, 'utf8')))
  }
}
for (const file of ROOT_FILES) {
  if (fs.existsSync(file)) problems.push(...emptyCatches(file, fs.readFileSync(file, 'utf8')))
}

if (problems.length > 0) {
  console.error(`empty catch check failed: ${problems.length} violation(s)`)
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}
console.log('empty catch check passed: no undocumented empty catch bodies across src/scripts/tests and root configs')