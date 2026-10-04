import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every block language the note can draw has an insert entry on both surfaces that offer them — the
 * editor toolbar's block menu and the blank canvas's right-click menu — and both lists are the languages
 * whose own context menu replaces the code block's.
 *
 * Three hand-written lists describe one fact, which is how a family ends up drawing but not inserting:
 * a ```echarts fence that renders and has no menu entry can only be typed out by someone who already
 * knows it exists, and the feature reads as missing to everyone else. The detection list is taken as the
 * source of truth because a language only appears there once its block has a menu of its own.
 */
const TOOLBAR = 'src/client/features/workspace/use-editor-toolbar.tsx'
const CANVAS = 'src/client/features/workspace/context-menu/canvas.tsx'
const DETECT = 'src/client/features/workspace/context-menu-detect/editor.ts'

/** Order says nothing about coverage, so every comparison is on the sorted names. */
function sorted(names: string[]): string[] {
  return [...names].sort()
}

function read(file: string): string {
  return fs.readFileSync(path.resolve(file), 'utf8')
}

/** The families a menu offers: the keys of its own diagram table. */
function menuFamilies(source: string): string[] {
  return [...source.matchAll(/^ {2}([a-z]+): \{ labelKey:/gm)].map((match) => match[1]!)
}

/** The families a menu actually lists, in the order it lists them. */
function listedFamilies(source: string, call: RegExp): string[] {
  return [...source.matchAll(call)].map((match) => match[1]!)
}

function detectedFamilies(): string[] {
  const union = /^type LiveFenceKind = (.+)$/m.exec(read(DETECT))![1]!
  return [...union.matchAll(/'([a-z-]+)'/g)].map((match) => match[1]!)
}

describe('the insert menus cover every block language', () => {
  it('the toolbar offers exactly the languages whose blocks have their own menu', () => {
    expect(sorted(menuFamilies(read(TOOLBAR)))).toEqual(sorted(detectedFamilies()))
  })

  it('the blank canvas offers exactly the same families as the toolbar', () => {
    expect(sorted(menuFamilies(read(CANVAS)))).toEqual(sorted(detectedFamilies()))
  })

  it('every family either menu describes is actually listed in the menu', () => {
    const toolbar = read(TOOLBAR)
    const canvas = read(CANVAS)
    expect(sorted(listedFamilies(toolbar, /diagramMenuItems\(run, '([a-z]+)'/g))).toEqual(sorted(menuFamilies(toolbar)))
    expect(sorted(listedFamilies(canvas, /diagramInsertItems\(ctx, '([a-z]+)'/g))).toEqual(sorted(menuFamilies(canvas)))
  })

  it('the chart families are insertable, not only writable by hand', () => {
    const families = detectedFamilies()
    expect(families).toContain('chart')
    expect(families).toContain('echarts')
  })
})
