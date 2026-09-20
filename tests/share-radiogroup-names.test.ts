import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * SH-40: a `Segmented` renders a `role='radiogroup'`, and the component only
 * names it through `label` (an `aria-label`) or `aria-labelledby`. Every share
 * control that sits under a visible heading instead of passing one of those is
 * announced as an unnamed group of options, so the scan below is the guard: a
 * new `Segmented` must say what it is.
 */
const SHARE_DIR = path.join('src', 'client', 'features', 'share')

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(full, out)
    else if (entry.name.endsWith('.tsx')) out.push(full)
  }
  return out
}

function unnamedSegmented(file: string): string[] {
  const source = fs.readFileSync(file, 'utf8')
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const found: string[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText() === 'Segmented') {
      const names = node.attributes.properties
        .filter(ts.isJsxAttribute)
        .map((attribute) => attribute.name.getText())
      if (!names.includes('label') && !names.includes('aria-labelledby')) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
        found.push(`${file}:${line + 1}`)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

describe('every share radiogroup is named (SH-40)', () => {
  it('finds the share segmented controls to read', () => {
    expect(sourceFiles(SHARE_DIR).length).toBeGreaterThan(10)
  })

  it('passes label or aria-labelledby at every Segmented site', () => {
    const unnamed = sourceFiles(SHARE_DIR).flatMap(unnamedSegmented)
    expect(unnamed).toEqual([])
  })
})
