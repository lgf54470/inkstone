import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * SH-32: the share feature styled some states with raw Tailwind palette
 * classes (`text-amber-500`, `bg-white`, `text-white`), which bypass the
 * theme tokens and keep one hue across both themes. `check-hardcoded` only
 * scans hex literals and arbitrary values, so palette classes need this
 * narrower guard: every drawn color inside `features/share` must come from
 * `src/client/styles/tokens.css`.
 */
const SHARE_DIR = path.join('src', 'client', 'features', 'share')

const PALETTE_CLASS = /\b(?:bg|text|border|fill|ring|shadow|outline|decoration|divide|from|via|to)-(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?:\/\d{1,3})?)/

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

describe('share colors go through design tokens (SH-32)', () => {
  const files = sourceFiles(SHARE_DIR)

  it('scans a non-empty share source set', () => {
    expect(files.length).toBeGreaterThan(10)
    expect(files.some((file) => file.endsWith('share-visit-logs-modal.tsx'))).toBe(true)
    expect(files.some((file) => file.endsWith('share-item-common.tsx'))).toBe(true)
  })

  it('draws no raw Tailwind palette class', () => {
    const violations: string[] = []
    for (const file of files) {
      const lines = fs.readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, index) => {
        const match = line.match(PALETTE_CLASS)
        if (match) violations.push(`${file}:${index + 1}: ${match[0]}`)
      })
    }
    expect(violations).toEqual([])
  })
})
