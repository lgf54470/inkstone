/**
 * A bento-slides body is untrusted input rendered as MARKUP (a note can carry a deck from
 * anywhere), so every injection site has to pass through lib/markdown/slides/sanitize.ts.
 * The renderer is where a bypass would be introduced — one `dangerouslySetInnerHTML` fed
 * a model field straight — and a bypass is invisible in review, because the code looks
 * like every other renderer in the tree. This walks the feature's source the way
 * tests/fullscreen-policy.test.ts walks src/client for native full screen: the shape is
 * the contract, and a new site that skips the gate fails here instead of shipping.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SLIDES_DIR = path.resolve('src/client/lib/markdown/slides')
const EXPRESSION = /\{\{\s*__html:\s*(.+?)\s*\}\}/gs
const DIRECT_ASSIGNMENT = /(?<![\w.])innerHTML\s*=/g

function sourceFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const target = path.join(dir, entry.name)
      if (entry.isDirectory()) return sourceFiles(target)
      if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return []
      return [target]
    })
}

describe('slides markup policy', () => {
  it('sanitizes every dangerouslySetInnerHTML expression', () => {
    const sites: Array<{ file: string; expression: string }> = []
    for (const file of sourceFiles(SLIDES_DIR)) {
      const text = fs.readFileSync(file, 'utf8')
      for (const match of text.matchAll(EXPRESSION)) {
        sites.push({ file: path.relative(process.cwd(), file), expression: match[1] ?? '' })
      }
    }
    expect(sites.length).toBeGreaterThanOrEqual(3)
    expect(sites.filter((site) => !site.expression.includes('sanitize'))).toEqual([])
  })

  it('keeps direct innerHTML assignment inside the sanitizer module', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(SLIDES_DIR)) {
      const relative = path.relative(process.cwd(), file)
      if (relative.endsWith('slides/sanitize.ts')) continue
      const text = fs.readFileSync(file, 'utf8')
      if (DIRECT_ASSIGNMENT.test(text)) offenders.push(relative)
    }
    expect(offenders).toEqual([])
  })
})
