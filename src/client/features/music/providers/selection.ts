import { GDS_SOURCES, isProviderScope, PROVIDER_SCOPE_ALL } from './gds'

// FB3-F2: the aggregate was one switch over a fixed fan-out of five catalogues. The reader's own table
// is these two lists: which catalogues are on, and in what order they are asked. Both are stored as the
// *difference* from the shared list (an absent switch is on, an absent order is the shared order), so a
// catalogue added to the proxy later is asked by default instead of silently missing from everyone's
// settings.
export interface ProviderSourceSelection {
  enabled: Record<string, boolean>
  order: string[]
}

export const NO_SOURCE_SELECTION: ProviderSourceSelection = { enabled: {}, order: [] }

// The reader's order first, then everything they never moved in the shared order. Unknown names — a
// stale preference, a hand-edited localStorage — are dropped rather than passed on, and a name that
// appears twice is one name: this list is what a request is built from (FB3-S1).
export function orderedSources(selection: ProviderSourceSelection = NO_SOURCE_SELECTION): string[] {
  const moved = new Set<string>()
  const ordered: string[] = []
  for (const source of selection.order) {
    if (!(GDS_SOURCES as readonly string[]).includes(source) || moved.has(source)) continue
    moved.add(source)
    ordered.push(source)
  }
  for (const source of GDS_SOURCES) {
    if (!moved.has(source)) ordered.push(source)
  }
  return ordered
}

export function enabledSources(selection: ProviderSourceSelection = NO_SOURCE_SELECTION): string[] {
  return orderedSources(selection).filter((source) => selection.enabled[source] !== false)
}

// FB3-F1 + FB3-F2, one rule: which catalogues a search asks. A named scope asks that one catalogue —
// unless the reader has switched it off, in which case their table wins and the scope is read as the
// aggregate. The aggregate expands to the reader's enabled list, which may be empty: asking nothing is
// the honest answer to "ask these zero catalogues", and the panel says so rather than asking all five
// behind a switch that is off.
export function scopeSources(scope: unknown, selection: ProviderSourceSelection = NO_SOURCE_SELECTION): readonly string[] {
  if (!isProviderScope(scope) || scope === PROVIDER_SCOPE_ALL) {
    return selection === NO_SOURCE_SELECTION ? GDS_SOURCES : enabledSources(selection)
  }
  return selection.enabled[scope] === false ? enabledSources(selection) : [scope]
}

// FB3-F2: moving one catalogue one place. The ends hold — a move past either edge returns the same
// order rather than rotating the list — and the result is always a full permutation of the shared list,
// which is what the settings rows draw from.
export function moveSource(order: readonly string[], source: string, delta: number): string[] {
  const sources = orderedSources({ enabled: {}, order: [...order] })
  const from = sources.indexOf(source)
  const to = from + delta
  if (from < 0 || to < 0 || to >= sources.length) return sources
  const next = [...sources]
  next.splice(from, 1)
  next.splice(to, 0, source)
  return next
}
