import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { initI18n, t } from '../../lib/i18n'
import { EQ_BAND_COUNT, EQ_GAIN_RANGE_DB, eqBandLabel, emptyEqBands } from './music-eq-bands'
import { MusicEqPanel } from './music-transport-widgets'
import { useMusic } from './music-store'
import { EQ_PRESETS, matchEqPreset } from './music-eq-presets'

beforeAll(async () => {
  await initI18n()
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

let root: Root | null = null

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  vi.useRealTimers()
  useMusic.setState({ eqEnabled: false, eqBandsDb: emptyEqBands() })
  window.localStorage.clear()
})

function presetButton(label: string): HTMLElement | undefined {
  return [...document.querySelectorAll('button')].find((button) => button.textContent === label)
}

// Every preset has to voice every band: a short array would leave the tail of the spectrum at 0 dB
// while looking like a complete preset in the menu.
describe('EQ preset table', () => {
  it('states one gain per band for every preset', () => {
    for (const preset of EQ_PRESETS) {
      expect([preset.id, preset.bands.length]).toEqual([preset.id, EQ_BAND_COUNT])
      expect(preset.bands.every((db) => Number.isInteger(db) && Math.abs(db) <= 12)).toBe(true)
    }
  })

  it('makes flat the only preset that leaves every band alone', () => {
    const silent = EQ_PRESETS.filter((preset) => preset.bands.every((db) => db === 0))
    expect(silent.map((preset) => preset.id)).toEqual(['flat'])
  })
})

describe('EQ presets (F-7)', () => {
  it('moves every band in one step', () => {
    useMusic.getState().applyEqPreset('rock')
    expect(useMusic.getState().eqBandsDb).toEqual(EQ_PRESETS.find((preset) => preset.id === 'rock')?.bands)
  })

  // The preset table is a module constant, so handing it to the store by reference would let one
  // reader's slider move the voicing every other reader gets from the menu.
  it('does not let a band edit rewrite the preset it came from', () => {
    useMusic.getState().applyEqPreset('bass')
    const before = [...(EQ_PRESETS.find((preset) => preset.id === 'bass')?.bands ?? [])]
    useMusic.getState().setEqBand(3, -6)
    expect(EQ_PRESETS.find((preset) => preset.id === 'bass')?.bands).toEqual(before)
  })

  it('persists the preset so the next session opens on it', () => {
    vi.useFakeTimers()
    useMusic.getState().applyEqPreset('vocal')
    vi.advanceTimersByTime(500)
    const stored = JSON.parse(window.localStorage.getItem('inkstone.music-prefs.v2') ?? '{}')
    expect(stored.eqBandsDb).toEqual(EQ_PRESETS.find((preset) => preset.id === 'vocal')?.bands)
  })

  it('names the preset the current bands stand for', () => {
    expect(matchEqPreset(emptyEqBands())).toBe('flat')
    expect(matchEqPreset(EQ_PRESETS.find((preset) => preset.id === 'rock')?.bands ?? [])).toBe('rock')
  })

  it('reports no preset once a band was moved by hand', () => {
    const rock = [...(EQ_PRESETS.find((preset) => preset.id === 'rock')?.bands ?? [])]
    rock[2] = (rock[2] ?? 0) + 1
    expect(matchEqPreset(rock)).toBeNull()
  })
})

async function mountPanel(): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(MusicEqPanel))
  })
}

describe('MusicEqPanel (F-7)', () => {
  it('offers every preset and marks the one in force', async () => {
    useMusic.setState({ eqBandsDb: [...(EQ_PRESETS.find((preset) => preset.id === 'pop')?.bands ?? [])] })
    await mountPanel()
    for (const preset of EQ_PRESETS) expect(presetButton(t(preset.labelKey))).toBeDefined()
    expect(presetButton(t('music.eq_preset_pop'))?.getAttribute('aria-pressed')).toBe('true')
    expect(presetButton(t('music.eq_preset_rock'))?.getAttribute('aria-pressed')).toBe('false')
  })

  // FB3-U3: the panel is drawn at two widths — the player popover's 224px and the settings page's full
  // column — and the preset row kept three columns at both, so five presets read as 3 + 2 with a hole
  // beside the second row. The row asks its own container instead of the window.
  it('lets the preset row take one line of five where its container has the room', async () => {
    await mountPanel()
    const group = document.querySelector(`[role="group"][aria-label="${t('music.eq_presets')}"]`)
    expect(group?.className).toContain('grid-cols-3')
    expect(group?.className).toContain('@sm:grid-cols-5')
    expect(group?.parentElement?.className).toContain('@container')
  })

  it('arms the preset that was clicked', async () => {
    await mountPanel()
    const rock = EQ_PRESETS.find((preset) => preset.id === 'rock')
    await act(async () => {
      presetButton(t(rock!.labelKey))?.click()
    })
    expect(useMusic.getState().eqBandsDb).toEqual(rock?.bands)
    expect(matchEqPreset(useMusic.getState().eqBandsDb)).toBe('rock')
  })

})

// The sliders are named by their centre frequency and a band moves the filter it names, so both the
// count of sliders and the labels they carry come from the shared table.
describe('MusicEqPanel band sliders (F-7)', () => {
  it('draws one labelled slider per band, and none past the table', async () => {
    await mountPanel()
    for (let index = 0; index < EQ_BAND_COUNT; index += 1) {
      expect(document.querySelector(`[aria-label="${eqBandLabel(index)}"]`)).not.toBeNull()
    }
    expect(document.querySelector(`[aria-label="${eqBandLabel(EQ_BAND_COUNT)}"]`)).toBeNull()
  })

  it('ranges every slider over the shared gain window', async () => {
    await mountPanel()
    const slider = document.querySelector<HTMLInputElement>(`input[aria-label="${eqBandLabel(0)}"]`)
    expect([slider?.min, slider?.max]).toEqual([String(-EQ_GAIN_RANGE_DB), String(EQ_GAIN_RANGE_DB)])
  })
})
