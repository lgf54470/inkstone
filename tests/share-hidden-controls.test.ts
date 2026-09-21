import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * SH-51: the share center's only way to create a folder or a tag was a `+` control revealed by
 * hovering its section header. It stayed keyboard-focusable but invisible while focused (WCAG 2.4.7
 * focus visible), and a touch device has no hover at all, so the one entry to those features could
 * not be found. The app already has the answer everywhere else — `opacity-100 md:opacity-0` with a
 * reveal for the pointer *and* for the keyboard — and this guard keeps the share feature on it.
 *
 * Two rules, both read off the class list on the line that hides something: a hidden control must
 * come back when it has the keyboard (`focus-visible`), and it may only be hidden from the `md`
 * breakpoint up, because below that width there is no hover to reveal it with.
 */
const SHARE_DIR = path.join('src', 'client', 'features', 'share')
const HIDDEN = /opacity-0(?![.\d])/
const FOCUS_REVEAL = /(?:group-)?focus-visible(?:\/\w+)?:opacity-100/
/** Furniture that is not a control and is allowed to stay hidden — none of these today. */
const ALLOWLIST = new Set<string>()

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(full, out)
    else if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) out.push(full)
  }
  return out
}

describe('hidden-until-hover controls in the share center (SH-51)', () => {
  const files = sourceFiles(SHARE_DIR).filter((file) => !ALLOWLIST.has(path.basename(file)))

  it('scans the share source set', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it('never hides a control without a focus reveal', () => {
    const violations: string[] = []
    for (const file of files) {
      fs.readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
        if (HIDDEN.test(line) && !FOCUS_REVEAL.test(line)) violations.push(`${file}:${index + 1}: ${line.trim().slice(0, 60)}`)
      })
    }
    expect(violations).toEqual([])
  })

  it('keeps the hide behind the breakpoint that has a pointer to hover with', () => {
    const violations: string[] = []
    for (const file of files) {
      fs.readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
        if (HIDDEN.test(line) && !/md:opacity-0/.test(line)) violations.push(`${file}:${index + 1}: ${line.trim().slice(0, 60)}`)
      })
    }
    expect(violations).toEqual([])
  })

  it('keeps the allowlist honest', () => {
    for (const name of ALLOWLIST) {
      expect(files.some((file) => path.basename(file) === name), `${name} is allowlisted but no longer scanned`).toBe(true)
    }
  })
})
