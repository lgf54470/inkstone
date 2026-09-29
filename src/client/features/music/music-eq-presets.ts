import type { MessageKey } from '../../lib/i18n'
import { EQ_BAND_COUNT } from './music-eq-bands'

export type MusicEqPresetId = 'flat' | 'pop' | 'rock' | 'vocal' | 'bass'

export interface MusicEqPreset {
  id: MusicEqPresetId
  labelKey: MessageKey
  /** One gain per band, in `EQ_BANDS` order; the table's length is the contract a test pins. */
  bands: number[]
}

// Ten bands now, so a preset can state a voicing instead of hinting at one: the shapes below read
// left to right as sub-bass through air, and each is a starting point for the sliders rather than a
// claim about how the music was mastered.
export const EQ_PRESETS: readonly MusicEqPreset[] = [
  { id: 'flat', labelKey: 'music.eq_preset_flat', bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  // A gentle scoop through the low mids with a lift on both ends: the loudness smile pop was mixed for.
  { id: 'pop', labelKey: 'music.eq_preset_pop', bands: [-1, -1, 0, 1, 2, 1, 0, 1, 2, 2] },
  // Weight at the bottom, a dip where guitars and snares fight, presence on top.
  { id: 'rock', labelKey: 'music.eq_preset_rock', bands: [4, 4, 3, 1, -2, -2, 0, 2, 3, 3] },
  // Room for a voice: rumble and boom out of the way, the consonant range forward, the top tamed so
  // sibilance does not ride over it.
  { id: 'vocal', labelKey: 'music.eq_preset_vocal', bands: [-3, -3, -2, 0, 3, 4, 3, 1, 0, -1] },
  // Sub and bass up, everything above left alone to roll off rather than being cut to make room.
  { id: 'bass', labelKey: 'music.eq_preset_bass', bands: [6, 6, 5, 3, 0, -1, -2, -3, -4, -4] },
]

// Which preset the sliders currently stand for; null once one was moved by hand. Compared
// positionally, band by band: a preset that named its own bands could sit out of step with the
// sliders and still match, which is exactly the drift the shared table exists to prevent.
export function matchEqPreset(bandsDb: number[]): MusicEqPresetId | null {
  const match = EQ_PRESETS.find((preset) => preset.bands.length === EQ_BAND_COUNT &&
    preset.bands.every((db, index) => db === (bandsDb[index] ?? 0)))
  return match?.id ?? null
}
