import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * SH-35: the note submenu rows were 30px tall (`h-7.5`), below the 44px
 * touch target on phones. The base height must stay large for narrow
 * screens while desktop keeps the compact row.
 */
const SUBMENU_FILE = path.join('src', 'client', 'features', 'share', 'share-note-submenu.tsx')

describe('share submenu touch targets (SH-35)', () => {
  it('gives submenu rows the 44px mobile hit area while staying compact on desktop', () => {
    const source = fs.readFileSync(SUBMENU_FILE, 'utf8')
    expect(source).toMatch(/h-11 .*md:h-7\.5/)
    expect(source).not.toMatch(/'flex h-7\.5 w-full/)
  })
})
