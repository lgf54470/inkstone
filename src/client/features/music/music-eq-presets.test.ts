import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { initI18n, t } from '../../lib/i18n'
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
  useMusic.setState({ eqEnabled: false, eqLowDb: 0, eqMidDb: 0, eqHighDb: 0 })
  window.localStorage.clear()
})

function presetButton(label: string): HTMLElement | undefined {
  return [...document.querySelectorAll('button')].find((button) => button.textContent === label)
}

describe('EQ presets (F-7)', () => {
  it('moves all three bands in one step', () => {
    useMusic.getState().applyEqPreset('rock')
    const state = useMusic.getState()
    expect([state.eqLowDb, state.eqMidDb, state.eqHighDb]).toEqual([4, -2, 3])
  })

  it('persists the preset so the next session opens on it', () => {
    vi.useFakeTimers()
    useMusic.getState().applyEqPreset('vocal')
    vi.advanceTimersByTime(500)
    const stored = JSON.parse(window.localStorage.getItem('inkstone.music-prefs.v2') ?? '{}')
    expect([stored.eqLowDb, stored.eqMidDb, stored.eqHighDb]).toEqual([-2, 3, 1])
  })

  it('names the preset the current bands stand for', () => {
    expect(matchEqPreset({ low: 0, mid: 0, high: 0 })).toBe('flat')
    expect(matchEqPreset({ low: 4, mid: -2, high: 3 })).toBe('rock')
  })

  it('reports no preset once a band was moved by hand', () => {
    expect(matchEqPreset({ low: 4, mid: -1, high: 3 })).toBeNull()
  })
})

describe('MusicEqPanel preset row (F-7)', () => {
  async function mountPanel(): Promise<void> {
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(createElement(MusicEqPanel))
    })
  }

  it('offers every preset and marks the one in force', async () => {
    useMusic.setState({ eqLowDb: 2, eqMidDb: -1, eqHighDb: 2 })
    await mountPanel()
    for (const preset of EQ_PRESETS) expect(presetButton(t(preset.labelKey))).toBeDefined()
    expect(presetButton(t('music.eq_preset_pop'))?.getAttribute('aria-pressed')).toBe('true')
    expect(presetButton(t('music.eq_preset_rock'))?.getAttribute('aria-pressed')).toBe('false')
  })

  it('arms the preset that was clicked', async () => {
    await mountPanel()
    const rock = EQ_PRESETS.find((preset) => preset.id === 'rock')
    await act(async () => {
      presetButton(t(rock!.labelKey))?.click()
    })
    const state = useMusic.getState()
    expect([state.eqLowDb, state.eqMidDb, state.eqHighDb]).toEqual([4, -2, 3])
    expect(matchEqPreset({ low: state.eqLowDb, mid: state.eqMidDb, high: state.eqHighDb })).toBe('rock')
  })
})
