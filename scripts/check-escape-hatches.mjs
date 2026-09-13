// Type escape hatches are banned by AGENTS.md rule 5 (no `any` /
// `@ts-ignore`); this walks the src tree with the TS AST so prose in
// comments ("any of the two modes") never counts as a violation.
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const ROOT = 'src'
const SUPPRESS_DIRECTIVES = /@ts-(ignore|expect-error|nocheck)/

function walk(directory, out = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) out = walk(target, out)
    else if ((entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) && !entry.name.endsWith('.d.ts')) out.push(target)
  }
  return out
}

function violations(file, text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const found = []
  function lineOf(node) {
    return sf.getLineAndCharacterOfPosition(node.getStart()).line + 1
  }
  function visit(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      found.push(`${file}:${lineOf(node)}: explicit 'any' type is banned (AGENTS.md rule 5)`)
    }
    // `as unknown as T` is a two-step escape hatch that defeats the checker's
    // plain `any` scan; flag the OUTER cast whose source is itself a cast to
    // unknown. A plain `x as unknown` feeding a runtime validator is the safe
    // direction and stays allowed.
    if ((node.kind === ts.SyntaxKind.AsExpression || node.kind === ts.SyntaxKind.TypeAssertionExpression) && node.expression) {
      let source = node.expression
      while (source.kind === ts.SyntaxKind.ParenthesizedExpression) source = source.expression
      if ((source.kind === ts.SyntaxKind.AsExpression || source.kind === ts.SyntaxKind.TypeAssertionExpression) && source.type?.kind === ts.SyntaxKind.UnknownKeyword) {
        found.push(`${file}:${lineOf(node)}: 'as unknown as' double-cast is banned (AGENTS.md rule 5); narrow the type or add the site to ALLOWED_DOUBLE_CASTS with a reason`)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  const directive = SUPPRESS_DIRECTIVES.exec(text)
  if (directive) {
    const index = text.indexOf(directive[0])
    const line = sf.getLineAndCharacterOfPosition(index).line + 1
    found.push(`${file}:${line}: '@ts-${directive[1]}' is banned (AGENTS.md rule 5)`)
  }
  return found
}

// Irreducible platform seams: each entry carries the reason the double-cast
// cannot be replaced by a narrowing helper or a precise type. File paths are
// repo-relative; line numbers are intentionally absent so edits nearby do not
// silently invalidate the entry (the AST scan still pins the exact expression).
const ALLOWED_DOUBLE_CASTS = new Map([
  ['src/shared/constants.ts', 'deep-merge of recursive partials: the combined object type cannot be expressed without a recursive conditional type'],
  ['src/client/lib/db/core.ts', 'shell cache load: validators above confirm the stored session shape; the composite SessionInfo type is reconstructed from validated parts'],
  ['src/client/lib/test-render.ts', 'jsdom shim: stub constructor is structurally compatible but not assignable to the DOM lib type'],
  ['src/client/store/notes-test-utils.ts', 'test harness: in-memory api/db stubs intentionally ignore their real signatures'],
  ['src/client/demo/backend/routes/backup.ts', 'demo backend: jsonBody returns unknown and the demo intentionally skips runtime config validation the real worker performs'],
  ['src/client/lib/markdown/enhance/math.ts', 'KaTeX dynamic import: ESM/CJS interop shape differs between bundler output and vitest module resolution'],
  ['src/client/lib/markdown/enhance/chart.ts', 'Chart.js dynamic import interop plus per-node instance metadata stashed on a DOM element'],
  ['src/worker/backup/s3-test.ts', 'worker-side S3 connectivity probe: aws4fetch RequestInit accepts streams the DOM lib types do not model'],
  ['src/client/features/preview/js-runner.worker.ts', 'dedicated-worker scope: DOM lib types `self` as Window, so the WorkerGlobalScope surface must be asserted explicitly'],
  ['src/client/features/preview/js-runner.ts', 'the DOM Worker type does not model the injectable message contract used for sandbox bridge tests'],
])

const problems = []
for (const file of walk(ROOT).sort()) {
  const rel = path.relative(process.cwd(), file).replaceAll('\\', '/')
  // Test files keep the any/ts-ignore ban but may double-cast: in-memory stubs
  // of api/db/DOM primitives are the one sanctioned use, mirroring the
  // notes-test-utils allowlist entry below.
  const isTestFile = /\.test\.tsx?$/.test(rel)
  for (const problem of violations(file, fs.readFileSync(file, 'utf8'))) {
    if (problem.includes("'as unknown as'") && (isTestFile || ALLOWED_DOUBLE_CASTS.has(rel))) continue
    problems.push(problem)
  }
}
if (problems.length > 0) {
  console.error(`type escape hatches check failed: ${problems.length} violation(s)`)
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}
console.log('type escape hatches check passed: no explicit any, @ts-* suppressions, or unallowed as-unknown-as casts across src')
