import { describe, expect, it } from 'vitest'
import { GDS_SOURCES, PROVIDER_SCOPE_ALL } from './gds'
import { NO_SOURCE_SELECTION, enabledSources, moveSource, orderedSources, scopeSources } from './selection'

const selection = (enabled: Record<string, boolean>, order: string[] = []) => ({ enabled, order })

// FB3-F2: the aggregate used to be a fixed fan-out over all five catalogues. The reader's own table —
// which ones are on, and in what order they are asked — is the missing half of that preference, and
// these are the two facts the rest of the module reads from it.
describe('the source table behind an aggregate search (FB3-F2)', () => {
  it('asks every catalogue, in the shared order, until the reader says otherwise', () => {
    expect(orderedSources(NO_SOURCE_SELECTION)).toEqual([...GDS_SOURCES])
    expect(enabledSources(NO_SOURCE_SELECTION)).toEqual([...GDS_SOURCES])
    expect(scopeSources(PROVIDER_SCOPE_ALL)).toEqual([...GDS_SOURCES])
  })

  it('keeps the identity of the shared list when nothing has been chosen', () => {
    expect(scopeSources(PROVIDER_SCOPE_ALL)).toBe(GDS_SOURCES)
    expect(scopeSources('unknown')).toBe(GDS_SOURCES)
    expect(scopeSources('migu')).toEqual(['migu'])
  })

  it('honours the reader order, with the catalogues they never moved keeping the shared order behind it', () => {
    expect(orderedSources(selection({}, ['bilibili', 'netease']))).toEqual(['bilibili', 'netease', 'kuwo', 'migu', 'qq'])
  })

  it('leaves out the catalogues that are switched off', () => {
    expect(enabledSources(selection({ kuwo: false, qq: false }))).toEqual(['netease', 'migu', 'bilibili'])
    expect(enabledSources(selection({ kuwo: false, qq: false }, ['qq', 'kuwo']))).toEqual(['netease', 'migu', 'bilibili'])
  })

  it('asks nothing when the reader has switched every catalogue off', () => {
    const all = Object.fromEntries(GDS_SOURCES.map((source) => [source, false]))
    expect(enabledSources(selection(all))).toEqual([])
    expect(scopeSources(PROVIDER_SCOPE_ALL, selection(all))).toEqual([])
  })

  it('never lets a stored list name something the proxy would refuse', () => {
    expect(orderedSources(selection({}, ['spotify', 'netease']))).toEqual(['netease', 'kuwo', 'migu', 'qq', 'bilibili'])
    expect(enabledSources(selection({ spotify: false }))).toEqual([...GDS_SOURCES])
    // A repeated entry is one entry: the order is a permutation, not a list with duplicates in it.
    expect(orderedSources(selection({}, ['qq', 'qq', 'netease']))).toEqual(['qq', 'netease', 'kuwo', 'migu', 'bilibili'])
  })

  it('moves one entry within the order and leaves the rest where they were', () => {
    const order = [...GDS_SOURCES]
    expect(moveSource(order, 'migu', -1)).toEqual(['netease', 'migu', 'kuwo', 'qq', 'bilibili'])
    expect(moveSource(order, 'migu', 1)).toEqual(['netease', 'kuwo', 'qq', 'migu', 'bilibili'])
    // The ends hold: a move past the edge is the same order rather than a rotation.
    expect(moveSource(order, 'netease', -1)).toEqual([...GDS_SOURCES])
    expect(moveSource(order, 'bilibili', 1)).toEqual([...GDS_SOURCES])
    expect(moveSource(order, 'nope', -1)).toEqual([...GDS_SOURCES])
  })
})

// FB3-F1's scope and the per-source switches have to agree: asking a catalogue the reader switched off
// is the switch not meaning anything. A scope that names one is read as the reader's table instead —
// and the store also drops such a scope when the switch goes off, so this is the belt to that braces.
describe('a scope that names a switched-off catalogue (FB3-F1 + FB3-F2)', () => {
  it('lets the switch win over a stale scope', () => {
    expect(scopeSources('kuwo', selection({ kuwo: false }))).toEqual(['netease', 'migu', 'qq', 'bilibili'])
    expect(scopeSources('kuwo', selection({ kuwo: true }))).toEqual(['kuwo'])
  })
})
