import { describe, expect, it } from 'vitest'
import { EN_US_MESSAGES } from '@shared/locales/en-US'
import { GRAPH_APPEARANCE_TOGGLES, GRAPH_CLEAR_TOGGLES, GRAPH_SETTINGS_TOGGLES, GRAPH_SHOW_TOGGLES } from './graph-settings'
import { DEFAULT_PREFERENCES } from '../features/graph/graph-panel/constants'

describe('graph settings manifest', () => {
  it('lists exactly the boolean preferences the app ships', () => {
    // The manifest used to carry a `default` nobody read while `DEFAULT_PREFERENCES` wrote the seven
    // booleans out again, and this case pinned its own inline copy of them (G-36). The defaults are now
    // derived from the manifest, so the guard is the one that survives derivation: a boolean preference
    // the panel cannot toggle, or a toggle that governs nothing, fails here.
    const booleans = Object.keys(DEFAULT_PREFERENCES).filter((key) => typeof DEFAULT_PREFERENCES[key as keyof typeof DEFAULT_PREFERENCES] === 'boolean')
    expect(GRAPH_SETTINGS_TOGGLES.map((control) => control.prefKey).sort()).toEqual(booleans.sort())
  })

  it('ships the manifest default, not a second copy of it', () => {
    for (const control of GRAPH_SETTINGS_TOGGLES) {
      expect(DEFAULT_PREFERENCES[control.prefKey]).toBe(control.default)
    }
  })

  it('covers exactly the boolean graph preferences without duplicates', () => {
    const keys = GRAPH_SETTINGS_TOGGLES.map((control) => control.prefKey)
    expect(keys).toHaveLength(new Set(keys).size)
    expect(keys.sort()).toEqual(['arrows', 'clearClosesPanel', 'clearResetsTag', 'includeOrphans', 'includeUnresolved', 'labels', 'showTagNodes'])
  })

  it('splits into the three panel groups without overlap', () => {
    const groups = [GRAPH_CLEAR_TOGGLES, GRAPH_SHOW_TOGGLES, GRAPH_APPEARANCE_TOGGLES]
    const keys = groups.flatMap((group) => group.map((control) => control.prefKey))
    expect(keys).toHaveLength(GRAPH_SETTINGS_TOGGLES.length)
    expect(new Set(keys).size).toBe(GRAPH_SETTINGS_TOGGLES.length)
  })

  it('references label and hint keys that exist in the en-US locale', () => {
    for (const control of GRAPH_SETTINGS_TOGGLES) {
      expect(control.labelKey in EN_US_MESSAGES).toBe(true)
      if (control.hintKey)
        expect(control.hintKey in EN_US_MESSAGES).toBe(true)
    }
  })
})