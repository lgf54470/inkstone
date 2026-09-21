import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * SH-49: AGENTS.md rule 10 wants every interactive control in the share feature to come from the
 * component system (`components/primitives`, `components/form`, `components/overlay`), and it also
 * forbids imitating a control with a `div`/`span` plus a click handler. SH-33's guard already covers
 * the form controls (`input`/`select`/`textarea`); this one covers `button`, where the same rule was
 * being broken unnoticed — a bare `<button>` carries no accessible name of its own, and misses the
 * shared focus ring, hit area, disabled and busy behaviour the components bring.
 *
 * One file is allowed and named: `share-note-submenu.tsx` is the hand-rolled panel a note row's
 * Share entry opens. Its rows are not menu rows — `SubmenuList`'s shared row is 40px tall on phones,
 * under the 44px touch target SH-35 fixed for this panel — and two of its views hold text inputs
 * inside a menu panel, so retiring it is its own change rather than a swap; it is tracked as SH-92
 * in .qoder/improvement/share/plan-freebuff.md. Both directions fail: an unlisted file that grows a
 * bare button, and a listing for a file that no longer needs one.
 */
const SHARE_DIR = path.join('src', 'client', 'features', 'share')
const ALLOWLIST = new Set(['share-note-submenu.tsx'])
const BARE_BUTTON = /<button(?![a-zA-Z-])/
const FAKE_BUTTON = /<(?:div|span)(?=[\s>])[^>]*role='button'/

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

function matches(files: string[], pattern: RegExp, skip?: Set<string>): string[] {
  const found: string[] = []
  for (const file of files) {
    if (skip?.has(path.basename(file))) continue
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      if (pattern.test(line)) found.push(`${file}:${index + 1}: ${line.trim().slice(0, 48)}`)
    })
  }
  return found
}

describe('share buttons go through the component system (SH-49)', () => {
  const files = sourceFiles(SHARE_DIR)

  it('scans a non-empty share source set', () => {
    expect(files.length).toBeGreaterThan(10)
    expect(files.some((file) => file.endsWith('share-hub-sidebar.tsx'))).toBe(true)
  })

  it('declares no bare button outside the allowlisted panel', () => {
    expect(matches(files, BARE_BUTTON, ALLOWLIST)).toEqual([])
  })

  it('models no control as a div or span with a button role', () => {
    expect(matches(files, FAKE_BUTTON)).toEqual([])
  })

  it('keeps the allowlist honest: the file it names still needs it', () => {
    for (const name of ALLOWLIST) {
      const file = files.find((candidate) => path.basename(candidate) === name)
      expect(file, `${name} is allowlisted but no longer exists`).toBeDefined()
      const lines = fs.readFileSync(file!, 'utf8').split('\n')
      expect(lines.some((line) => BARE_BUTTON.test(line)), `${name} is allowlisted but has no bare button left`).toBe(true)
    }
  })
})
