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
 * and that is what this scan catches: each caller has to name its channel.
 */
const CLIENT_ROOT = path.resolve('src/client')
const DEFINITION = path.join('lib', 'markdown', 'enhance', 'index.ts')
const CALL = /enhancePreview\([\s\S]*?\}\)/g

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
      [path.join('features', 'preview', 'use-preview.ts')]: 'live',
      [path.join('features', 'share', 'share-page', 'use-share-page.ts')]: 'snapshot',
      [path.join('lib', 'export-note.ts')]: 'snapshot',
    })
  })
})
