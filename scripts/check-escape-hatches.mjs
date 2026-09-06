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

const problems = []
for (const file of walk(ROOT).sort()) {
  problems.push(...violations(file, fs.readFileSync(file, 'utf8')))
}
if (problems.length > 0) {
  console.error(`type escape hatches check failed: ${problems.length} violation(s)`)
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}
console.log('type escape hatches check passed: no explicit any or @ts-* suppressions across src')
