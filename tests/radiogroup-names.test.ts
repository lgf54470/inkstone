import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * SH-40 named every `Segmented` inside the share feature; SH-46 lifted the scan to
 * the whole client tree, because the same defect kept appearing in other modules'
 * toolbars. A `Segmented` renders a `role='radiogroup'`, and the component only
 * names it through `label` (an `aria-label`) or `aria-labelledby`.
 *
 * One site may stay attribute-free: a `Segmented` that is the single child of a
 * `Field`, because `Field` clones `aria-labelledby` onto its control. That
 * exemption is proved behaviourally in src/client/components/form-segmented.test.ts
 * rather than trusted from here.
 */
const CLIENT_DIR = path.join('src', 'client')

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(full, out)
    else if (entry.name.endsWith('.tsx')) out.push(full)
  }
  return out
}

function jsxAttributes(node: ts.JsxSelfClosingElement | ts.JsxOpeningElement): string[] {
  return node.attributes.properties.filter(ts.isJsxAttribute).map((attribute) => attribute.name.getText())
}

function isLabelledField(node: ts.JsxElement): boolean {
  const opening = node.openingElement
  return opening.tagName.getText() === 'Field'
    && jsxAttributes(opening).includes('label')
    && meaningfulChildren(node).length === 1
}

// Indentation inside JSX survives the parse as whitespace-only text children.
function meaningfulChildren(node: ts.JsxElement): ts.JsxChild[] {
  return node.children.filter((child) => !(ts.isJsxText(child) && child.getText().trim() === ''))
}

function scanSource(file: string, source: string): { sites: string[]; unnamed: string[] } {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const sites: string[] = []
  const unnamed: string[] = []
  const line = (node: ts.Node) => `${file}:${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1}`
  const visit = (node: ts.Node, namedByParent: boolean): void => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText() === 'Segmented') {
      const names = jsxAttributes(node)
      const named = namedByParent || names.includes('label') || names.includes('aria-labelledby')
      sites.push(line(node))
      if (!named) unnamed.push(line(node))
    }
    if (ts.isJsxElement(node)) {
      const kids = meaningfulChildren(node)
      const labelled = isLabelledField(node)
      node.children.forEach((child) => visit(child, labelled && child === kids[0]))
      ts.forEachChild(node.openingElement, (child) => visit(child, false))
      ts.forEachChild(node.closingElement, (child) => visit(child, false))
      return
    }
    ts.forEachChild(node, (child) => visit(child, false))
  }
  visit(sourceFile, false)
  return { sites, unnamed }
}

function scanFile(file: string): { sites: string[]; unnamed: string[] } {
  return scanSource(file, fs.readFileSync(file, 'utf8'))
}

function scanAll(): { sites: string[]; unnamed: string[] } {
  return sourceFiles(CLIENT_DIR).reduce(
    (acc, file) => {
      const { sites, unnamed } = scanFile(file)
      acc.sites.push(...sites)
      acc.unnamed.push(...unnamed)
      return acc
    },
    { sites: [], unnamed: [] } as { sites: string[]; unnamed: string[] },
  )
}

describe('every client radiogroup is named (SH-40, SH-46)', () => {
  it('finds the segmented controls across the whole client tree', () => {
    expect(scanAll().sites.length).toBeGreaterThanOrEqual(12)
  })

  it('passes label, aria-labelledby, or a Field wrapper at every Segmented site', () => {
    expect(scanAll().unnamed).toEqual([])
  })
})

describe('the Field exemption is bounded by what Field actually does', () => {
  // Field clones its label id onto the child only when `children` is a single
  // valid element, and the id is worthless without a `label`, so a multi-child or
  // label-less Field must still be reported. Line numbers are the fixture's own.
  // `aria-label` is not a Segmented prop at all (it renders one from `label`), so
  // writing it on the control names nothing and must not satisfy the guard.
  const FIXTURE = `export function Form() {
  return (
    <form>
      <Field label='a'><Segmented options={[]} /></Field>
      <Field label='b'><Segmented options={[]} /><Segmented options={[]} /></Field>
      <Field><Segmented options={[]} /></Field>
      <div><Segmented options={[]} label='c' /></div>
      <div><Segmented options={[]} aria-label='d' /></div>
      <div><Segmented options={[]} /></div>
    </form>
  )
}
`

  it('names only the single labelled Field child and reports every other bare control', () => {
    const { sites, unnamed } = scanSource('fixture.tsx', FIXTURE)
    expect(sites).toHaveLength(7)
    expect(unnamed).toEqual([
      'fixture.tsx:5',
      'fixture.tsx:5',
      'fixture.tsx:6',
      'fixture.tsx:8',
      'fixture.tsx:9',
    ])
  })
})
