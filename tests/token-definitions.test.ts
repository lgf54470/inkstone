import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx|css)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) out.push(full)
  }
  return out
}

// A token counts as defined either in a stylesheet or as a quoted '--x' literal
// in TS (runtime setProperty / inline-style keys resolve the same way).
function collectDefined(files: string[]): Set<string> {
  const defined = new Set<string>()
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const pattern = file.endsWith('.css') ? /(--[a-z0-9-]+)\s*:/g : /["'](--[a-z0-9-]+)["']/g
    for (const match of source.matchAll(pattern)) defined.add(match[1]!)
  }
  return defined
}

// Debt owned by other audits (kanban, preview, attachments, music, slides,
// excalidraw). Registered in the plan.md common-defects section; fixing them
// here would be a drive-by. Removing an entry requires the owning module to
// define the token.
const LEGACY_DANGLING = new Map<string, string>([
  ['--text-8', 'preview activity-calendar/date-range and kanban chart type-scale refs'],
  ['--text-20', 'kanban chart-view private type scale'],
  ['--border-focus', 'focus border in shared hub rows and attachments sidebar'],
  ['--bg-subtle', 'attachments board background'],
  ['--sp-0', 'preview outline plus three third-party css files, private spacing scale'],
  ['--sp-11', 'slides.css private spacing scale'],
  ['--sp-12', 'music track-row private spacing scale'],
  ['--surface-hover', 'preview property editor private surface-layer naming'],
  ['--surface-primary', 'preview property editor private surface-layer naming'],
  ['--surface-secondary', 'preview property editor private surface-layer naming'],
  ['--surface-tertiary', 'preview property editor private surface-layer naming'],
  ['--danger-softer', 'preview property-row lighter danger wash'],
  ['--kanban-tag-', 'kanban colors.ts template prefix (var(--kanban-tag-N) by index)'],
  ['--bg-surface-subtle', 'kanban board-view private surface'],
  ['--accent-fg', 'kanban tag-picker foreground'],
  ['--code-font-size', 'code font size injected by JS in excalidraw/mindmap/rich-embeds'],
  ['--code-line-height', 'code line height injected by JS in excalidraw/mindmap'],
  ['--deck-page-width', 'deck page width injected by presentation.css layout'],
  ['--deck-page-height', 'deck page height injected by presentation.css layout'],
  ['--deck-pad-x', 'deck horizontal padding injected by presentation.css'],
  ['--deck-pad-y', 'deck vertical padding injected by presentation.css'],
  ['--bento-code-c', 'slides code-palette.ts runtime key-templated highlight color'],
  ['--bento-code-k', 'slides code-palette.ts runtime key-templated highlight color'],
  ['--bento-code-n', 'slides code-palette.ts runtime key-templated highlight color'],
  ['--bento-code-p', 'slides code-palette.ts runtime key-templated highlight color'],
  ['--bento-code-s', 'slides code-palette.ts runtime key-templated highlight color'],
  ['--bento-code-f', 'slides code-palette.ts runtime key-templated highlight color'],
])

describe('every design token referenced by the client is defined (SH-37)', () => {
  const files = walk(path.join('src', 'client'))
  const defined = collectDefined(files)

  it('scans a non-trivial source set', () => {
    expect(files.length).toBeGreaterThan(500)
    expect(defined.size).toBeGreaterThan(100)
  })

  it('references no status-color *-subtle aliases after the -soft unification', () => {
    const aliased = files.filter((file) => /var\(--(danger|warning|success|accent)-subtle\)/.test(readFileSync(file, 'utf8')))
    expect(aliased).toEqual([])
  })

  it('defines every var() token except the whitelisted legacy debt', () => {
    const dangling = new Map<string, string[]>()
    for (const file of files) {
      for (const match of readFileSync(file, 'utf8').matchAll(/var\((--[a-z0-9-]+)/g)) {
        const name = match[1]!
        if (defined.has(name) || LEGACY_DANGLING.has(name)) continue
        dangling.set(name, [...(dangling.get(name) ?? []), file])
      }
    }
    expect([...dangling.entries()]).toEqual([])
  })
})
