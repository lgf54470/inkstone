// AGENTS.md rule 4: modules communicate only through their public interface
// (the directory's index.ts). This walks the src tree with the TS AST so
// imports inside comments or strings never count, and resolves both relative
// and `@/`/`@shared/` aliased imports to their concrete files.
//
// A violation is an import that reaches PAST a module boundary: the resolved
// file sits under some directory that exposes an index.ts, but the importing
// file lives outside that directory. Importing the index itself (`../notes`,
// `./blog-store`) IS the public interface and stays allowed, and so do
// module-internal sibling imports.
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

// Scan scope is parameterizable so sibling workspaces (blog-frontend) reuse
// the same gate; the inkstone path aliases only exist for the root src tree.
const args = process.argv.slice(2)
function argValue(flag) {
  const index = args.indexOf(flag)
  return index === -1 ? null : args[index + 1]
}

const ROOT = argValue('--root') ?? 'src'
const ALIASES = ROOT === 'src'
  ? [
      { prefix: '@/files/', dir: 'src/client/files/' },
      { prefix: '@/', dir: 'src/client/' },
      { prefix: '@shared/', dir: 'src/shared/' },
    ]
  : []

function walk(directory, out = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) out = walk(target, out)
    else if ((entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) && !entry.name.endsWith('.d.ts')) out.push(target)
  }
  return out
}

function relative(file) {
  return path.relative(process.cwd(), file).replaceAll('\\', '/')
}

// Map<moduleDir, indexFile> for every src directory exposing index.ts.
const indexFiles = new Map()
for (const file of walk(ROOT)) {
  if (path.basename(file) === 'index.ts') indexFiles.set(relative(path.dirname(file)), relative(file))
}

function resolveToFile(fromFile, spec) {
  let base = null
  if (spec.startsWith('.')) {
    base = path.resolve(path.dirname(fromFile), spec)
  } else {
    const alias = ALIASES.find((a) => spec === a.prefix.slice(0, -1) || spec.startsWith(a.prefix))
    if (!alias) return null // bare packages and #aliases are out of scope
    base = path.join(alias.dir, spec.slice(alias.prefix.length))
  }
  const candidates = /\.(ts|tsx)$/.test(base)
    ? [base]
    : [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return relative(candidate)
  }
  return null
}

// The module boundary the resolved file belongs to (nearest ancestor with an
// index.ts), or null when the import is the interface itself / module-internal.
function boundaryCrossed(importer, resolvedFile) {
  const moduleDir = relative(path.dirname(resolvedFile))
  if (indexFiles.get(moduleDir) === resolvedFile) return null
  let dir = moduleDir
  // The `dir !== '.'` guard keeps a malformed moduleDir (outside ROOT) from
  // spinning forever at the filesystem root.
  while (dir !== ROOT && dir !== '.') {
    if (indexFiles.has(dir)) {
      const importerToModule = path.relative(dir, path.dirname(importer))
      const isInsideModule = importerToModule === '' || (!importerToModule.startsWith('..') && !path.isAbsolute(importerToModule))
      return isInsideModule ? null : dir
    }
    dir = path.dirname(dir)
  }
  return null
}

function extractImportSpecifiers(sf) {
  const specs = []
  function visit(node) {
    if (node.kind === ts.SyntaxKind.ImportDeclaration || node.kind === ts.SyntaxKind.ExportDeclaration) {
      const moduleSpecifier = node.moduleSpecifier
      if (moduleSpecifier && ts.isStringLiteralLike(moduleSpecifier)) {
        // `import type` / `export type` are erased at compile time, so they
        // cross no runtime boundary; the public-interface rule targets wiring.
        const isTypeOnly = node.importClause?.isTypeOnly === true || node.isTypeOnly === true
        specs.push({ spec: moduleSpecifier.text, isTypeOnly })
      }
    }
    if (node.kind === ts.SyntaxKind.CallExpression) {
      const call = node
      if (call.expression.kind === ts.SyntaxKind.ImportKeyword && call.arguments[0]?.kind === ts.SyntaxKind.StringLiteral) {
        specs.push({ spec: call.arguments[0].text, isTypeOnly: false })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return specs
}

// AGENTS.md rule 5: violations must be explicit and reasoned. Same pattern as
// ALLOWED_DOUBLE_CASTS in check-escape-hatches.mjs.
const ALLOWED_DEEP_IMPORTS = new Map([
  [
    'src/client/features/settings/backup-settings/target-card.tsx',
    'icon-tree references sibling settings/feature modules; index.ts re-exports only the component surface, and wiring the icons through it would invert the dependency',
  ],
])

const problems = []
for (const file of walk(ROOT).sort()) {
  const rel = relative(file)
  if (/\.test\.tsx?$/.test(rel)) continue // tests are white-box by design
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  for (const { spec, isTypeOnly } of extractImportSpecifiers(sf)) {
    if (isTypeOnly) continue
    const resolvedFile = resolveToFile(file, spec)
    if (resolvedFile === null) continue
    const moduleDir = boundaryCrossed(file, resolvedFile)
    if (moduleDir === null) continue
    problems.push(`${rel}: imports '${spec}' deep into '${moduleDir}' which exposes an index.ts (AGENTS.md rule 4); import from the module index instead`)
  }
}

if (problems.length > 0) {
  console.error(`deep import check failed: ${problems.length} violation(s)`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log('deep import check passed: no non-test file deep-imports into a module that exposes an index.ts')
