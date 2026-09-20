import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * The share feature must stay code-split (SH-20): its five modals carry
 * qrcode.react and the analytics charts, so any *static* import that reaches
 * them regrows the shell chunk the note list already loads. The modals are
 * only allowed behind `src/client/features/share/modals` and must arrive via
 * `lazy(() => import(...))`.
 *
 * The build itself is too heavy for CI-level feedback, so this test walks the
 * static import graph (dynamic `import()` calls are boundaries, not edges)
 * and asserts no module outside the share feature reaches the modal graph —
 * which is exactly the state the 2026-09-17 dist measurement contradicted.
 */
const CLIENT_ROOT = path.resolve('src/client')
const SHARE_DIR = path.join(CLIENT_ROOT, 'features', 'share')

// The lazy-only surface: the five modal components plus their dedicated entry.
const BANNED = [
  path.join('share-hub-modal.tsx'),
  path.join('share-edit-modal', 'index.tsx'),
  path.join('share-note-analytics-modal.tsx'),
  path.join('share-note-submenu.tsx'),
  path.join('share-qr-modal.tsx'),
  path.join('modals', 'index.ts'),
].map((rel) => path.join(SHARE_DIR, rel))

// Files that must pull the modals in dynamically instead of statically.
const LAZY_CONSUMERS = [
  path.join('features', 'shell', 'app-shell.tsx'),
  path.join('features', 'list', 'note-list', 'note-row-ui.tsx'),
  path.join('features', 'list', 'note-list', 'note-row-items.tsx'),
]

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

const ALL_FILES = sourceFiles(CLIENT_ROOT)
const ALL_FILE_SET = new Set(ALL_FILES)

function resolveSpecifier(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null
  const base = path.resolve(path.dirname(fromFile), spec)
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (ALL_FILE_SET.has(candidate)) return candidate
  }
  return null
}

interface ModuleEdges {
  staticDeps: string[]
  dynamicTargets: string[]
}

const edgeCache = new Map<string, ModuleEdges>()

function edgesOf(file: string): ModuleEdges {
  const cached = edgeCache.get(file)
  if (cached) return cached
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const edges: ModuleEdges = { staticDeps: [], dynamicTargets: [] }
  function add(spec: string, isStatic: boolean) {
    const resolved = resolveSpecifier(file, spec)
    if (!resolved) return
    if (isStatic) edges.staticDeps.push(resolved)
    else edges.dynamicTargets.push(resolved)
  }
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const specifier = node.moduleSpecifier
      if (specifier && ts.isStringLiteralLike(specifier)) {
        const isTypeOnly = ts.isImportDeclaration(node)
          ? node.importClause?.isTypeOnly === true
          : node.isTypeOnly === true
        add(specifier.text, !isTypeOnly)
      }
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteralLike(node.arguments[0])) {
      add(node.arguments[0].text, false)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  edgeCache.set(file, edges)
  return edges
}

// Files whose static closure touches each banned module (pre-image of the
// ban), computed by one reverse-DFS over static edges.
function staticPreimage(target: string): Set<string> {
  const reachable = new Set<string>([target])
  let grew = true
  while (grew) {
    grew = false
    for (const file of ALL_FILES) {
      if (reachable.has(file)) continue
      if (edgesOf(file).staticDeps.some((dep) => reachable.has(dep))) {
        reachable.add(file)
        grew = true
      }
    }
  }
  return reachable
}

function offendersFor(target: string): string[] {
  const preimage = staticPreimage(target)
  return ALL_FILES
    .filter((file) => preimage.has(file) && !file.startsWith(SHARE_DIR + path.sep))
    .map((file) => path.relative(CLIENT_ROOT, file))
    .sort()
}

describe('share modals stay behind a dynamic boundary (SH-20)', () => {
  it('bans every lazy-only surface, so the graph walk sees all of them', () => {
    for (const target of BANNED) {
      expect(fs.existsSync(target), `missing lazy-only share surface ${target}`).toBe(true)
    }
  })

  it('no module outside the share feature statically reaches the modal graph', () => {
    const offenders = new Set<string>()
    for (const target of BANNED) {
      if (!fs.existsSync(target)) continue
      for (const offender of offendersFor(target)) offenders.add(offender)
    }
    expect([...offenders].sort()).toEqual([])
  })

  it('the shell and note-row consumers import the modals dynamically', () => {
    const singleModalFiles = BANNED.filter((target) => !target.endsWith(path.join('modals', 'index.ts')))
    const rootBarrel = path.join(SHARE_DIR, 'index.ts')
    const rel = (file: string) => path.join(CLIENT_ROOT, file)
    for (const consumer of LAZY_CONSUMERS) {
      const targets = edgesOf(rel(consumer)).dynamicTargets
      expect(targets.filter((t) => t.startsWith(path.join(SHARE_DIR, 'modals'))).length, `${consumer} must import share/modals dynamically`).toBeGreaterThan(0)
      expect(targets.includes(rootBarrel), `${consumer} must not lazy-import the root barrel: the modals left it in SH-20`).toBe(false)
      expect(targets.filter((t) => singleModalFiles.includes(t)).length, `${consumer} must import the modals entry, not single modal files`).toBe(0)
    }
  })

  it('the QR modal still owns qrcode.react, keeping the ban meaningful', () => {
    expect(fs.readFileSync(path.join(SHARE_DIR, 'share-qr-modal.tsx'), 'utf8')).toMatch(/from ['"]qrcode\.react['"]/)
  })
})
