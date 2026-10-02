import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * A ref written while the component is rendering is a value that belongs to a render that may never be
 * committed: React 19 renders twice in development and drops a render when a higher update supersedes it.
 * The graph's header controls used to be handed over that way (G-39), and the two shapes behave exactly
 * the same to every behavioural test — jsdom flushes effects inside `act`, so a commit-phase write is
 * indistinguishable from a render-phase one. The only check that can hold the line is the source itself
 * (F-09), which is what 6.5 registered as its own gap.
 *
 * A write inside a callback is not a render-phase write: `useEffect` runs after the commit it belongs to,
 * and the handlers the canvas hands out fire long after any render. So only an assignment whose nearest
 * enclosing function *is* the hook counts here.
 */
const ROOT = 'src/client/features/graph'

function sources(directory: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(path.resolve(directory), { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) out = sources(file, out)
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts') && !entry.name.includes('.test.')) out.push(file)
  }
  return out
}

function isHookDeclaration(node: ts.Node): node is ts.SignatureDeclaration {
  if (ts.isFunctionDeclaration(node)) return !!node.name && /^use[A-Z]/.test(node.name.text)
  if (ts.isVariableDeclaration(node) && node.initializer && ts.isArrowFunction(node.initializer)) {
    return node.name.getText().startsWith('use')
  }
  return false
}

function isRefAssignment(node: ts.Node): boolean {
  if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return false
  return /\.current(\.[A-Za-z_$][\w$]*)?$/.test(node.left.getText())
    && /Ref$|Ref\./.test(node.left.getText())
}

function renderPhaseWrites(file: string): number[] {
  const text = fs.readFileSync(path.resolve(file), 'utf8')
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX)
  const lineOf = (index: number) => text.slice(0, index).split('\n').length
  const found: number[] = []
  const walk = (node: ts.Node, hook: ts.SignatureDeclaration | null) => {
    const insideHook = isHookDeclaration(node) ? node : hook
    if (insideHook && insideHook === hook && isRefAssignment(node)) {
      // A write nested in any function below the hook body happens after the render, so only the nearest
      // enclosing function being the hook itself is a render-phase write.
      const nested = ts.findAncestor(node, (ancestor) => ancestor === hook
        || ts.isArrowFunction(ancestor) || ts.isFunctionExpression(ancestor) || ts.isFunctionDeclaration(ancestor))
      if (!nested || ts.isFunctionDeclaration(nested)) found.push(lineOf(node.getStart()))
    }
    node.forEachChild((child) => walk(child, insideHook))
  }
  source.statements.forEach((statement) => walk(statement, null))
  return found
}

describe('a graph hook never writes a ref while it renders (G-39, F-09)', () => {
  const files = sources(ROOT)
  const flagged = files.flatMap((file) => renderPhaseWrites(file).map((line) => `${file}:${line}`))

  it('reads the hook files it is meant to cover', () => {
    // A scan that finds no file passes by accident; the graph module is far larger than this floor.
    expect(files.length).toBeGreaterThanOrEqual(15)
  })

  it('finds no ref written in a hook body outside an effect', () => {
    expect(flagged).toEqual([])
  })
})
