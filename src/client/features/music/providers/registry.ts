import type { MusicPreferences } from '../music-store/state'
import { GDS_PROVIDER_ID } from './gds'
import type { MusicProvider } from './types'

const PROVIDERS: MusicProvider[] = [
  {
    id: GDS_PROVIDER_ID,
    labelKey: 'music.provider_gds',
    isEnabled: (prefs: MusicPreferences) => prefs.providerEnabled[GDS_PROVIDER_ID] === true,
  },
]

export function listProviders(): MusicProvider[] {
  return PROVIDERS
}
