// Style gate for the tree-wide conventions (AGENTS.md code style section): 2-space
// indentation, no trailing semicolons, single-quoted strings. The checks run
// on the TS AST, so strings/comments/template content never false-positive:
//   - indent: a file whose minimum indentation is 4 spaces is still on the
//     legacy 4-space grid (migrated in one pass; new files must start at 2).
//   - semicolons: a trailing `;` is flagged unless removing it would change
//     semantics (do-while terminators and ASI hazards). for(;;) headers and
//     mid-line separators never end a line, so they stay allowed.
//   - quotes: only a double-quoted literal that could be converted safely
//     (no single quote inside, no escapes other than `\"`) is flagged;
//     strings that need double quotes are exempt.
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const ROOTS = ['src', 'scripts', 'tests', 'blog-frontend/src']
const ROOT_FILES = ['pwa.config.ts', 'vite.config.ts', 'vitest.config.ts']
const EXCLUDED_DIRS = new Set(['node_modules', 'dist', '.git', '.wrangler'])
// Tokens that continue the previous expression after a newline; ASI would
// not insert a semicolon before them, so a trailing `;` must stay.
const ASI_CONTINUATION_START = new Set(['(', '[', '`', "'", '"', '+', '-', '/', '*', ',', '.', '{', '<'])

function walk(directory, out = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(entry.name)) continue
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) out = walk(target, out)
    else if (/\.(ts|tsx|mjs|js|cjs)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(target)
  }
  return out
}

// First non-trivia character after `from`; skips whitespace and comments so
// an ASI hazard stays visible across them.
function nextNonTrivia(text, from) {
  let index = from
  while (index < text.length) {
    const ch = text[index]
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      index++
      continue
    }
    if (ch === '/' && text[index + 1] === '/') {
      index += 2
      while (index < text.length && text[index] !== '\n') index++
      continue
    }
    if (ch === '/' && text[index + 1] === '*') {
      index += 2
      while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) index++
      index += 2
      continue
    }
    return ch
  }
  return ''
}

// forEachChild never surfaces punctuation tokens, so a `;` is found through
// the statement that owns it: the node whose text ends at the semicolon.
// An empty-statement body (if/while/for, labels) needs its `;`; removing it
// would delete the body itself.
function isRemovableTrailingSemicolon(node, text) {
  // SourceFile/EndOfFileToken span the whole file and would match any `;`
  // that happens to be the last character.
  if (node.kind === ts.SyntaxKind.SourceFile || node.kind === ts.SyntaxKind.EndOfFileToken)
    return false
  if (node.kind === ts.SyntaxKind.EmptyStatement || node.kind === ts.SyntaxKind.DoStatement)
    return false
  if (text[node.end - 1] !== ';')
    return false
  let trailingEmptyChild = false
  ts.forEachChild(node, (child) => {
    if (child.kind === ts.SyntaxKind.EmptyStatement && child.end === node.end)
      trailingEmptyChild = true
  })
  if (trailingEmptyChild)
    return false
  const newline = text.indexOf('\n', node.end)
  const rest = text.slice(node.end, newline === -1 ? text.length : newline)
  if (!/^[ \t]*(?:\/\/.*)?$/.test(rest))
    return false
  return !ASI_CONTINUATION_START.has(nextNonTrivia(text, node.end))
}

const problems = []
const files = [
  ...ROOTS.flatMap((root) => walk(path.resolve(root))),
  ...ROOT_FILES.filter((f) => fs.existsSync(f)).map((f) => path.resolve(f)),
]
for (const file of files) {
  const rel = path.relative(process.cwd(), file).replaceAll('\\', '/')
  const text = fs.readFileSync(file, 'utf8')
  let minIndent = 0
  for (const line of text.split('\n')) {
    const m = /^ +[^ ]/.exec(line)
    if (m) {
      const n = m[0].length - 1
      if (minIndent === 0 || n < minIndent) minIndent = n
    }
  }
  if (minIndent === 4) problems.push(`${rel}: 4-space indentation (use 2-space)`)

  // pass the real kind so .tsx parses as TSX; parsing it as plain TS turned
  // JSX into a parse-error tree whose string/quote tokens never materialized
  const kind = rel.endsWith('.tsx') ? ts.ScriptKind.TSX : /\.(ts|tsx)$/.test(rel) ? ts.ScriptKind.TS : ts.ScriptKind.JS
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, kind)
  const flagged = new Set()
  function visit(node) {
    // A statement and its outer wrapper (if/while/case/label) can end at the
    // same `;`; report each position once.
    if (isRemovableTrailingSemicolon(node, text)) {
      const position = node.end - 1
      if (!flagged.has(position)) {
        flagged.add(position)
        problems.push(`${rel}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}: trailing semicolon (omit it)`)
      }
    } else if (node.kind === ts.SyntaxKind.StringLiteral) {
      const raw = text.slice(node.getStart(sf), node.end)
      if (raw.startsWith('"')) {
        const inner = raw.slice(1, -1)
        if (!inner.includes("'") && !/\\[^"]/.test(inner)) {
          problems.push(`${rel}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}: convertible double-quoted string (use single quotes)`)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
}

if (problems.length > 0) {
  console.error(`code style check failed: ${problems.length} violation(s)`)
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}
console.log('code style check passed: 2-space indent, no trailing semicolons, single quotes across all trees')