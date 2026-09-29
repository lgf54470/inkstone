// The equalizer's own vocabulary: how many bands, where they sit, how far each one may move. It lives
// in a leaf module with no imports of its own because three very different callers need it — the audio
// graph builds the filters from it, the presets are written against it, and the sliders label
// themselves from it — and because the graph must not reach back into the store to learn its own
// band count (that path is a cycle: store → player → graph → store).

// The ten octave bands, declared once. An ordering that lived in three places could drift into a
// panel whose 500 Hz slider moved the 1 kHz filter — a bug that sounds like a wrong answer rather
// than a broken control.
//
// The ends are shelves rather than peaks: below 31 Hz and above 16 kHz there is no neighbouring band
// to blend with, so a shelf is what actually shapes the last octave instead of leaving a step.
export interface MusicEqBandSpec {
  frequencyHz: number
  type: BiquadFilterType
  q?: number
}

// One octave wide, which is the spacing of the centres themselves — wider would make neighbouring
// sliders fight over the same frequencies.
const PEAK_Q = 1.41

export const EQ_BANDS: readonly MusicEqBandSpec[] = [
  { frequencyHz: 31, type: 'lowshelf' },
  { frequencyHz: 62, type: 'peaking', q: PEAK_Q },
  { frequencyHz: 125, type: 'peaking', q: PEAK_Q },
  { frequencyHz: 250, type: 'peaking', q: PEAK_Q },
  { frequencyHz: 500, type: 'peaking', q: PEAK_Q },
  { frequencyHz: 1_000, type: 'peaking', q: PEAK_Q },
  { frequencyHz: 2_000, type: 'peaking', q: PEAK_Q },
  { frequencyHz: 4_000, type: 'peaking', q: PEAK_Q },
  { frequencyHz: 8_000, type: 'peaking', q: PEAK_Q },
  { frequencyHz: 16_000, type: 'highshelf' },
]

export const EQ_BAND_COUNT = EQ_BANDS.length

export const EQ_GAIN_RANGE_DB = 12

export function emptyEqBands(): number[] {
  return EQ_BANDS.map(() => 0)
}

export function readEqDb(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.min(EQ_GAIN_RANGE_DB, Math.max(-EQ_GAIN_RANGE_DB, Math.round(value)))
}

// What a stored array has to look like to be usable: one gain per band, each in range. A shorter
// array is padded from wherever it stops, so a voicing saved under an earlier band count keeps the
// part it did express instead of being discarded for not matching today's length.
export function readEqBands(value: unknown): number[] {
  const stored = Array.isArray(value) ? value : []
  return EQ_BANDS.map((_, index) => readEqDb(stored[index]))
}

// The centre frequency is the band's name, so the label is built rather than translated: a reader
// looking for the 1 kHz slider wants to find it by the number every other equalizer taught them.
export function eqBandLabel(index: number): string {
  const hz = EQ_BANDS[index]?.frequencyHz
  if (hz === undefined) return ''
  return hz >= 1_000 ? `${hz / 1_000} kHz` : `${hz} Hz`
}
