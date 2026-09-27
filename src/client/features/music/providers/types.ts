import type { MessageKey } from '../../../lib/i18n'
import type { MusicPreferences } from '../music-store/state'

// FEA-A1-1: an online provider is an identity plus a search capability. The
// switch lives in the user's preference map and every provider ships disabled —
// opting into third-party catalogues is an explicit, per-provider decision.
export interface MusicProvider {
  id: string
  /** The name the switch is shown under; a message id, because it is user-visible copy. */
  labelKey: MessageKey
  isEnabled: (prefs: MusicPreferences) => boolean
}

// One search hit before it becomes a library row: the upstream keeps its own
// song id, which the stream resolver needs to mint a playable URL per play.
export interface MusicProviderTrack {
  provider: string
  source: string
  sourceId: string
  title: string
  artist: string
  album: string
  /** Null when the catalogue did not report a length — which is a fact, not a zero. */
  durationMs: number | null
  /** FB-F5: the artwork id from the same hit; nothing else can ask for that cover later. */
  coverId: string | null
  /** FB-F5: the lyric id from the same hit. */
  lyricId: string | null
}
