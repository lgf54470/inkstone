import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * SH-33: interactive controls inside the share feature must come from the
 * component system (`components/form`, `components/primitives`), not bare
 * `<input>` markup with hand-written styles. `share-note-submenu.tsx` keeps
 * two embedded search inputs out of this rule for now — they belong to the
 * hand-rolled submenu panel whose dedup is already a registered leftover.
 */
const SHARE_DIR = path.join('src', 'client', 'features', 'share')

const ALLOWLIST = new Set(['share-note-submenu.tsx'])

const BARE_CONTROL = /<(?:input|select|textarea)(?![\w-])/

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

describe('share form controls go through the component system (SH-33)', () => {
  const files = sourceFiles(SHARE_DIR)

  it('scans a non-empty share source set', () => {
    expect(files.length).toBeGreaterThan(10)
    expect(files.some((file) => file.endsWith('share-hub-toolbar.tsx'))).toBe(true)
  })

  it('declares no bare input/select/textarea outside the allowlisted submenu', () => {
    const violations: string[] = []
    for (const file of files) {
      if (ALLOWLIST.has(path.basename(file))) continue
      const lines = fs.readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, index) => {
        if (BARE_CONTROL.test(line)) violations.push(`${file}:${index + 1}: ${line.trim().slice(0, 40)}`)
      })
    }
    expect(violations).toEqual([])
  })
})
