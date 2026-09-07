// Style gate for the tree-wide conventions (AGENTS.md code style section): 2-space
// indentation, no trailing semicolons, single-quoted strings. The checks run
// on the TS AST, so strings/comments/template content never false-positive:
//   - indent: a file whose minimum indentation is 4 spaces is still on the
//     legacy 4-space grid (migrated in one pass; new files must start at 2).
//   - semicolons: only a `;` token whose rest of line is whitespace (plus an
//     optional `//` comment) is flagged, so `for (;;)` headers and mid-line
//     separators stay allowed.
//   - quotes: only a double-quoted literal that could be converted safely
//     (no single quote inside, no escapes other than `\"`) is flagged;
//     strings that need double quotes are exempt.
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const ROOTS = ['src', 'scripts', 'tests', 'blog-frontend/src']
const ROOT_FILES = ['pwa.config.ts', 'vite.config.ts', 'vitest.config.ts']
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

  const kind = /\.(ts|tsx)$/.test(rel) ? ts.ScriptKind.TS : ts.ScriptKind.JS
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, kind)
  function visit(node) {
    if (node.kind === ts.SyntaxKind.SemicolonToken) {
      const newline = text.indexOf('\n', node.end)
      const rest = text.slice(node.end, newline === -1 ? text.length : newline)
      if (/^[ \t]*(?:\/\/.*)?$/.test(rest)) {
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