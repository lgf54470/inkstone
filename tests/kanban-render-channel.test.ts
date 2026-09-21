import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every surface that enhances markdown has to say what it does with a ```kanban fence.
 *
 * A board is a React root, and a root needs a host that mounts it and a fence to write
 * back to. The preview pane has both; a share page, an exported document, a slide, a link
 * hover card and the editor's live preview have neither, and for as long as `enhancePreview`
 * knew nothing about boards those surfaces sat at "Loading kanban…" with `aria-busy` up
 * forever (review #21). The option still defaults to "show the source", so a new surface is
 * never broken — but a new surface that forgot to answer is a board the reader cannot read,
 * and that is what this scan catches: each caller has to name its channel, and since P-01 it has to
 * name where the fence bodies come from too.
 */
const CLIENT_ROOT = path.resolve('src/client')
const DEFINITION = path.join('lib', 'markdown', 'enhance', 'index.ts')
const CALL = /enhancePreview\([\s\S]*?\}\)/g
/**
 * Two hosts hand their blocks the bodies in their own way, because their markup was rendered before
 * the enhancement ran and reaches a surface that keeps no set of its own: the editor's live block
 * registers on the widget's element, and a printed deck registers per page — its sheet holds pages
 * from different slides, which no single document's numbering could answer for. A host that hands a
 * set to `enhancePreview` does not have to register it itself: the shared enhancement puts the set
 * on that root before it draws, which is what the preview pane, the share page, an export and a card
 * rely on.
 */
const SELF_REGISTERING = new Set([
  path.join('editor', 'live-preview.ts'),
  path.join('features', 'presentation', 'deck-print.tsx'),
])

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.(ts|tsx)$/.test(entry.name)) return []
    return [full]
  })
}

function enhancementCalls(): { file: string, call: string }[] {
  return sourceFiles(CLIENT_ROOT).flatMap((file) => {
    if (path.relative(CLIENT_ROOT, file) === DEFINITION) return []
    const text = fs.readFileSync(file, 'utf8')
    return [...text.matchAll(CALL)].map((match) => ({ file: path.relative(CLIENT_ROOT, file), call: match[0] }))
  })
}

/** Where the bodies of the blocks in this call come from: the option, or the host's own registration. */
function fenceSourceOf(file: string, call: string): 'option' | 'registered' | 'none' {
  if (/fences\s*[,:]/.test(call)) return 'option'
  // The named exception holds only while the file really does register, so a host that drops its
  // registration cannot inherit one of these two labels by sitting in the list.
  const registersOwn = SELF_REGISTERING.has(file) && fs.readFileSync(path.join(CLIENT_ROOT, file), 'utf8').includes('registerFenceBodies(')
  return registersOwn ? 'registered' : 'none'
}

describe('kanban render channels', () => {
  it('names a kanban channel at every enhancement call site', () => {
    const offenders = enhancementCalls()
      .filter(({ call }) => !/kanban:\s*['"](live|snapshot)['"]/.test(call))
      .map(({ file }) => file)
    expect(offenders).toEqual([])
  })

  it('sees the channels it lists, so the check cannot pass by finding nothing', () => {
    const channels = new Map(enhancementCalls().map(({ file, call }) => [file, /kanban:\s*'(\w+)'/.exec(call)?.[1]]))
    expect(Object.fromEntries([...channels].sort())).toEqual({
      [path.join('editor', 'live-preview.ts')]: 'snapshot',
      [path.join('features', 'presentation', 'deck-print.tsx')]: 'snapshot',
      [path.join('features', 'presentation', 'use-slide-html.ts')]: 'snapshot',
      [path.join('features', 'preview', 'card-content.ts')]: 'snapshot',
      [path.join('features', 'preview', 'preview-stage.ts')]: 'live',
      [path.join('features', 'share', 'share-page', 'use-share-page.ts')]: 'snapshot',
      [path.join('lib', 'export-note.ts')]: 'snapshot',
    })
  })

  /**
   * P-01 took the fence bodies out of the markup, so a surface that draws a block has to be handed
   * them from wherever the markup was rendered. A call that names neither is a surface where every
   * board, map, whiteboard and deck reads as an empty fence — the loud error state, on every block.
   */
  it('names where the fence bodies come from at every enhancement call site', () => {
    const sources = new Map(enhancementCalls().map(({ file, call }) => [file, fenceSourceOf(file, call)]))
    expect(Object.fromEntries([...sources].sort())).toEqual({
      [path.join('editor', 'live-preview.ts')]: 'registered',
      [path.join('features', 'presentation', 'deck-print.tsx')]: 'registered',
      [path.join('features', 'presentation', 'use-slide-html.ts')]: 'option',
      [path.join('features', 'preview', 'card-content.ts')]: 'option',
      [path.join('features', 'preview', 'preview-stage.ts')]: 'option',
      [path.join('features', 'share', 'share-page', 'use-share-page.ts')]: 'option',
      [path.join('lib', 'export-note.ts')]: 'option',
    })
  })
})
