import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const TABLE_HEADER_FILES = [
  path.join('src', 'client', 'features', 'share', 'share-table-view', 'index.tsx'),
  path.join('src', 'client', 'features', 'share', 'share-visit-logs-modal.tsx'),
]

describe('share table headers declare their scope (SH-36)', () => {
  it.each(TABLE_HEADER_FILES)('%s gives every column header a col scope', (file) => {
    const source = readFileSync(file, 'utf8')
    // (?=[\s>]) keeps <thead> from reading as an unscoped <th>.
    const unscoped = [...source.matchAll(/<th(?=[\s>])(?![^>]*scope=')[^>]*>/g)].map((match) => match[0])
    expect(unscoped).toEqual([])
  })
})

describe('visit log timestamps use the app locale (SH-36)', () => {
  it('does not format times with the runtime-default locale', () => {
    const file = path.join('src', 'client', 'features', 'share', 'share-visit-logs-modal.tsx')
    expect(readFileSync(file, 'utf8')).not.toContain('toLocaleTimeString([]')
  })
})
