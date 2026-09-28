export { listProviders } from './registry'
export { mergeProviderResults } from './dedupe'
export {
  GDS_PROVIDER_ID, GDS_SOURCES, PROVIDER_SCOPE_ALL, PROVIDER_SCOPES, isProviderScope,
  searchGds, searchGdsPages, type MusicProviderScope, type ProviderSearchOutcome, type ProviderSourcePage,
} from './gds'
export {
  NO_SOURCE_SELECTION, enabledSources, moveSource, orderedSources, scopeSources, type ProviderSourceSelection,
} from './selection'
export { providerSourceLabel } from './labels'
export { matchScore, type MatchCandidate } from './match'
export type { MusicProvider, MusicProviderTrack } from './types'
