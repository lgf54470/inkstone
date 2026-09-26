import type { MessageKey } from '../../lib/i18n'
import type { MusicEqBand } from './music-store'

export type MusicEqPresetId = 'flat' | 'pop' | 'rock' | 'vocal' | 'bass'

export interface MusicEqPreset {
  id: MusicEqPresetId
  labelKey: MessageKey
  bands: Record<MusicEqBand, number>
}

// Three bands only, so the presets stay deliberately coarse: they are a starting
// point for the sliders, not a voicing claim.
export const EQ_PRESETS: readonly MusicEqPreset[] = [
  { id: 'flat', labelKey: 'music.eq_preset_flat', bands: { low: 0, mid: 0, high: 0 } },
  { id: 'pop', labelKey: 'music.eq_preset_pop', bands: { low: 2, mid: -1, high: 2 } },
  { id: 'rock', labelKey: 'music.eq_preset_rock', bands: { low: 4, mid: -2, high: 3 } },
  { id: 'vocal', labelKey: 'music.eq_preset_vocal', bands: { low: -2, mid: 3, high: 1 } },
  { id: 'bass', labelKey: 'music.eq_preset_bass', bands: { low: 6, mid: 0, high: -2 } },
]

// Which preset the sliders currently stand for; null once one was moved by hand.
export function matchEqPreset(bands: Record<MusicEqBand, number>): MusicEqPresetId | null {
  const match = EQ_PRESETS.find((preset) =>
    preset.bands.low === bands.low && preset.bands.mid === bands.mid && preset.bands.high === bands.high)
  return match?.id ?? null
}
