import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Which slide is this? The show asks it for every slide, several times over: the cache keys the rail
 * and the projector read, the measured plans, the idle pass looking up what it has already listed,
 * and the page currently on screen. Answering it means hashing the slide's text, and when each of
 * those surfaces did it for itself, one debounced edit walked the deck's whole text three or four
 * times (measured in `use-show-deck.test.ts`: 31 hashes for a 6-slide deck).
 *
 * The deck answers once — `useShowDeck` splits the note and identifies each slide in the same pass —
 * and hands the answers out. This keeps a fifth surface from quietly re-walking the deck: a new call
 * to `hashContent` outside the deck itself is the shape this rule rejects.
 */
const CLIENT_ROOT = path.resolve('src/client')
// The one place that derives the deck's identities. `slide-html.ts` owns the function itself, which
// this scan skips: a definition is not a walk over the deck.
const HASH_OWNERS = ['features/presentation/use-show-deck.ts']

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.(ts|tsx)$/.test(entry.name)) return []
    return [full]
  })
}

function filesCalling(): string[] {
  const hits: string[] = []
  for (const file of sourceFiles(CLIENT_ROOT)) {
    const text = fs.readFileSync(file, 'utf8')
    const calls = text.split('\n').filter((line) => line.includes('hashContent(') && !line.trimStart().startsWith('export function'))
    if (calls.length) hits.push(path.relative(CLIENT_ROOT, file))
  }
  return [...new Set(hits)].sort()
}

describe('slide identity', () => {
  it('is derived in the deck and nowhere else', () => {
    expect(filesCalling()).toEqual(HASH_OWNERS)
  })

// Where the identities go: a surface that stops being handed them would go back to walking the deck,
// and the rule above cannot see that happen inside a component that derives them differently.
it('reaches every surface that asks for them', () => {
  const read = (file: string) => fs.readFileSync(path.join(CLIENT_ROOT, 'features', 'presentation', file), 'utf8')
  const session = read('use-presentation-session.ts')
  const preflight = read('slide-preflight.tsx')
  for (const wiring of ['useSlideCacheKeys(hashes', 'useSlidePlans(hashes)', 'deck, hashes, index: nav.index', 'preflight: { deck, hashes']) {
    expect(session, `the show stopped handing its identities to ${wiring}`).toContain(wiring)
  }
  expect(preflight, 'the measuring pass stopped using the deck identities').toContain('deck, hashes, index: cursor ?? 0')
})

  it('counts as one pass, not several, in that one owner', () => {
    const deck = fs.readFileSync(path.join(CLIENT_ROOT, 'features', 'presentation', 'use-show-deck.ts'), 'utf8')
    const calls = deck.split('\n').filter((line) => line.includes('hashContent(') && !line.includes('import'))
    expect(calls).toHaveLength(2)
  })
})
