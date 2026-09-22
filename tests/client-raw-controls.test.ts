import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * SH-49 asked for interactive controls to come from the component system, and for a `div`/`span`
 * with a click handler never to be passed off as one. That guard only read `features/share`, so the
 * shared components every feature uses kept the very shapes it forbade — the hub rows were
 * `div[role=button]` rows, and an account with any tag made the share center's own axe pass report
 * `button-name` and `nested-interactive` (SH-93). This reads the whole client tree instead.
 *
 * Three rules, in the order they matter:
 *
 *  1. No `div`/`span` that says `role='button'`. A fake control is wrong wherever it is, so this
 *     applies everywhere, and the handful of exceptions below carry the reason they exist.
 *  2. Every raw `<button>` has to carry an accessible name — `aria-label`, `aria-labelledby`,
 *     `title`, or visible text. This is the `button-name` rule axe applies, read statically, and it
 *     is what the 37 unnamed icon buttons across the app were failing. Names are read from the
 *     element's own attributes and its subtree: a name a wrapper component injects, or one spread
 *     in with `{...rest}`, is not something this can see, so an entry is never needed for it — but a
 *     raw button that only *looks* named because of a wrapper is not caught here either. That limit
 *     is the price of not rendering the app; the browser gates read what a real screen reader sees.
 *
 *     What counts as text was measured against a browser rather than guessed: an expression that
 *     renders an element — `{expanded ? <ChevronDown/> : <ChevronRight/>}` — is an icon, not a
 *     label, and axe reports those buttons as unnamed. Reading any expression as text (which is what
 *     this rule did at first) called eight icon-only buttons named while the browser called them
 *     nameless: the kanban board's row, group and list expand toggles, the attachment drive's two
 *     selection cells, a folder icon picker and the blog category colour swatches. `{t('…')}` and
 *     `{name}` are still text: they are what a label is usually written as, and no static read can
 *     tell a bare identifier apart from a variable holding an icon.
 *  3. Inside `src/client/components` — the layer every feature shares — a raw `<button>` needs a
 *     written reason. These are the primitive implementations and the rows and cells whose geometry
 *     the primitives cannot express (a menu row stretches a flexible label between two fixed slots,
 *     a calendar cell is a grid track); the rule's job is to keep the next one from arriving
 *     unnoticed, not to relitigate the ones already argued.
 *
 * Features outside that layer are not required to funnel every button through the primitives: that
 * is a per-context judgement (146 files and 397 sites today), and an allowlist of 146 entries would
 * be a graveyard rather than a reason. Rules 1 and 2 are the part that holds for them.
 *
 * Both directions fail throughout: an unlisted file that grows a violation, and an entry for a file
 * whose violation is gone.
 */
const CLIENT_DIR = path.join('src', 'client')

/** Card surfaces that stay one click target while hosting controls of their own. */
const FAKE_CONTROLS = new Map<string, string>([
  [
    'src/client/lib/markdown/kanban/ui/kanban-card.tsx',
    'The card body is the drop target and the open-detail affordance at once, and it holds controls of its own (its subtask rows, its menus): as a real button it would be a control inside a control. Keyboard and ARIA are implemented by hand (tabIndex, Enter/Space, the arrow keys that move it between columns) and read by the browser gate.',
  ],
  [
    'src/client/lib/markdown/kanban/ui/kanban-gallery-view.tsx',
    'Same card surface as the board view, drawn as a gallery tile: one click target over a body that carries its own controls, with Enter wired by hand. Changing it means redesigning the card, not renaming an element.',
  ],
  [
    'src/client/lib/markdown/kanban/ui/kanban-list-view.tsx',
    'Same card surface as a list row: the row opens the detail while the leading cell holds the selection control, so the row cannot be one button without swallowing it.',
  ],
])

/**
 * Buttons this rule reads as unnamed but a browser does not: the name is rendered by a component the
 * static read cannot see into. Entries are per file and fail in both directions, like the others.
 */
const COMPONENT_NAMED_BUTTONS = new Map<string, string>([
  [
    'src/client/features/tags/tag-row.tsx',
    'The tag row\'s name is the tag, rendered by `<TagNameHighlight>` (its only child): the browser reads that span\'s text, this read sees an element and nothing else. Adding an `aria-label` to satisfy the rule would state a second time what the row already shows — the one case where a name has to be trusted rather than written down.',
  ],
])

/**
 * The shared layer's raw buttons, each with why it is not a `Button`/`IconButton`. `Button` fixes a
 * height and padding per size and wraps its children in one inline-flex span, which is the wrong
 * shape for a row that stretches a label between two fixed slots or for a control drawn as a grid
 * cell; the primitives themselves are the files the components are supposed to come from.
 */
const SHARED_RAW_BUTTONS = new Map<string, string>([
  [
    'src/client/components/primitives.tsx',
    'The `<button>` inside `Button`/`IconButton` itself: the component system points here, so the element has to be written somewhere.',
  ],
  [
    'src/client/components/form.tsx',
    'Form primitives (chips, the segmented control, the switch and its rows) — the same position as `primitives.tsx`: this is the layer features call, not a caller of it.',
  ],
  [
    'src/client/components/overlay/menu-row.tsx',
    'The one menu row both menu surfaces draw. A row is a fixed-height track holding an icon, a label that has to stretch and truncate, a check mark and a shortcut or a panel arrow as siblings, and `Button` fixes a size and wraps its children in one non-stretching span, so the row owns its own element.',
  ],
  [
    'src/client/components/activity-calendar/year-view.tsx',
    'Calendar cells: the hit area is a grid track, and the element carries the roving tabIndex and `aria-label` the calendar navigation needs. `Button` sizes do not apply to a cell.',
  ],
  [
    'src/client/components/activity-calendar/month-view.tsx',
    'Calendar cells, the same grid geometry as the year view.',
  ],
  [
    'src/client/components/activity-calendar/weeks-strip.tsx',
    'Calendar cells and the note rows inside an expanded day, all laid out on the strip grid.',
  ],
  [
    'src/client/components/activity-calendar/header.tsx',
    'The calendar header control, aligned with the strip it heads rather than sized by the button scale.',
  ],
  [
    'src/client/components/date-range-popover-views.tsx',
    'The date grid, its preset pills and the range editor: cells are grid tracks carrying `aria-pressed` and a roving tabIndex, and the pills are a two-up switch whose geometry `Button` sizes do not express.',
  ],
  [
    'src/client/components/tag-filter-popover-views.tsx',
    "Rows and toggles inside the tag filter panel: option rows carry `role='option'` and `aria-selected`, the any/all pair is a two-up switch.",
  ],
  [
    'src/client/components/tag-pill.tsx',
    'The tag chip: its box follows its content, and its remove affordance is drawn inside that box rather than beside it.',
  ],
  [
    'src/client/components/hub-folder-row.tsx',
    'The hub row body: the row is a button whose label is the folder name, with the expand arrow and the row menu as siblings beside it (see hub-row-a11y.test.ts). Its track height and grid come from the sidebar, not from the button scale.',
  ],
  [
    'src/client/components/hub-tag-item.tsx',
    'The hub tag row, the same shape as the folder row above.',
  ],
])

/** A control a source file writes by hand, and whether it carries a name of its own. */
interface Site {
  file: string
  line: number
  named: boolean
}

function describeSite(site: Site): string {
  return `${site.file}:${site.line}`
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(full, out)
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

function relative(file: string): string {
  return path.relative(process.cwd(), file).replaceAll('\\', '/')
}

/** The attributes written on a JSX element, and whether it spreads any in. */
function attributesOf(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement): Map<string, ts.JsxAttribute['initializer']> {
  const attributes = new Map<string, ts.JsxAttribute['initializer']>()
  for (const property of node.attributes.properties) {
    if (ts.isJsxAttribute(property)) attributes.set(property.name.getText(), property.initializer)
  }
  return attributes
}

/** A literal attribute value, or `null` when it is an expression this cannot evaluate. */
function literalValue(initializer: ts.JsxAttribute['initializer']): string | null {
  if (!initializer) return null
  return ts.isStringLiteral(initializer) ? initializer.text : null
}

/**
 * Whether a subtree carries text a person could read as the name. A nested element is not text (it
 * is an icon), and neither is an expression that renders one — the browser is the judge of that, and
 * what it found is in the rule 2 note above. An expression that holds no element is text: `{t('…')}`
 * and `{name}` are how labels are written, and an identifier holding an icon cannot be told apart
 * from one holding a label by reading the source.
 */
function hasReadableText(node: ts.JsxChild): boolean {
  if (ts.isJsxText(node)) return node.text.trim().length > 0
  if (ts.isJsxExpression(node)) {
    const expression = node.expression
    if (!expression) return false
    return !rendersElement(expression)
  }
  if (ts.isJsxElement(node) || ts.isJsxFragment(node)) return node.children.some(hasReadableText)
  return false
}

/** Whether anything in this expression draws an element rather than text. */
function rendersElement(node: ts.Node): boolean {
  let found = false
  const visit = (child: ts.Node): void => {
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) || ts.isJsxFragment(child)) found = true
    ts.forEachChild(child, visit)
  }
  visit(node)
  return found
}

/** Whether a raw `<button>` carries a name: an attribute, or text inside it. */
function hasAccessibleName(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement, attributes: Map<string, ts.JsxAttribute['initializer']>): boolean {
  if (attributes.has('aria-label') || attributes.has('aria-labelledby') || attributes.has('title')) return true
  const element = node.parent
  return ts.isJsxElement(element) && element.children.some(hasReadableText)
}

/** Every raw button and every fake control the client tree writes by hand. */
function scan(): { rawButtons: Site[]; fakeControls: Site[] } {
  const rawButtons: Site[] = []
  const fakeControls: Site[] = []
  for (const file of sourceFiles(CLIENT_DIR)) {
    const text = fs.readFileSync(file, 'utf8')
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const name = relative(file)
    const visit = (node: ts.Node): void => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText()
        const attributes = attributesOf(node)
        const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1
        if (tag === 'button') rawButtons.push({ file: name, line, named: hasAccessibleName(node, attributes) })
        // Only a written-out role: one passed as an expression is read at runtime, and the browser
        // gates are what read it.
        if ((tag === 'div' || tag === 'span') && literalValue(attributes.get('role') ?? null) === 'button')
          fakeControls.push({ file: name, line, named: false })
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return { rawButtons, fakeControls }
}

const SCAN = scan()
const SHARED_PREFIX = 'src/client/components/'
const SHARED_BUTTON_FILES = new Set(SCAN.rawButtons.filter((site) => site.file.startsWith(SHARED_PREFIX)).map((site) => site.file))

describe('client controls are real and named (SH-93, widening SH-49)', () => {
  it('scans the whole client tree', () => {
    const scanned = sourceFiles(CLIENT_DIR)
    expect(scanned.length).toBeGreaterThan(400)
    expect(scanned.some((file) => file.endsWith('app-shell.tsx'))).toBe(true)
    expect(scanned.some((file) => fs.readFileSync(file, 'utf8').includes('<button'))).toBe(true)
  })

  it('models no control as a div or span with a button role', () => {
    const offenders = SCAN.fakeControls
      .filter((site) => !FAKE_CONTROLS.has(site.file))
      .map(describeSite)
    expect(offenders).toEqual([])
  })

  it('names every raw button it can read', () => {
    const offenders = SCAN.rawButtons
      .filter((site) => !site.named)
      .filter((site) => !COMPONENT_NAMED_BUTTONS.has(site.file))
      .map(describeSite)
    expect(offenders).toEqual([])
  })

  it('keeps the component-named exceptions honest', () => {
    for (const [file, reason] of COMPONENT_NAMED_BUTTONS) {
      expect(reason.length, `${file} has no reason written`).toBeGreaterThan(40)
      const unnamed = SCAN.rawButtons.filter((site) => site.file === file && !site.named)
      expect(unnamed.length, `${file} is listed as component-named but this rule now reads it`).toBeGreaterThan(0)
    }
  })

  it('keeps shared components on the component system, or says why not', () => {
    const offenders = SCAN.rawButtons
      .filter((site) => site.file.startsWith(SHARED_PREFIX))
      .filter((site) => !SHARED_RAW_BUTTONS.has(site.file))
      .map((site) => `${describeSite(site)} (no entry in this guard; use the component system or add it with its reason)`)
    expect(offenders).toEqual([])
  })

  it('keeps the fake-control exceptions honest', () => {
    for (const [file, reason] of FAKE_CONTROLS) {
      expect(reason.length, `${file} has no reason written`).toBeGreaterThan(40)
      const hits = SCAN.fakeControls.filter((site) => site.file === file)
      expect(hits.length, `${file} is listed as a fake control but no longer draws one`).toBeGreaterThan(0)
    }
  })

  it('keeps the shared-component exceptions honest', () => {
    for (const [file, reason] of SHARED_RAW_BUTTONS) {
      expect(reason.length, `${file} has no reason written`).toBeGreaterThan(40)
      expect(SHARED_BUTTON_FILES.has(file), `${file} is listed as a raw-button file but no longer writes one`).toBe(true)
    }
  })
})
