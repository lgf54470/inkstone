import { describe, expect, it } from 'vitest'
import type { UserSettings } from './types'
import {
  DEFAULT_SETTINGS,
  assertUnchangedSettingsSections,
  mergeSettings,
  mergeSettingsPatch,
} from './constants'

describe('mergeSettingsPatch', () => {
  it('returns the same object when the patch is empty', () => {
    const current = mergeSettings(DEFAULT_SETTINGS)
    expect(mergeSettingsPatch(current, {})).toBe(current)
  })

  it('keeps untouched sections by reference', () => {
    const current = mergeSettings(DEFAULT_SETTINGS)
    const next = mergeSettingsPatch(current, { editor: { lineNumbers: true } })

    expect(next).not.toBe(current)
    expect(next.editor.lineNumbers).toBe(true)
    expect(next.editor).not.toBe(current.editor)
    expect(next.appearance).toBe(current.appearance)
    expect(next.preview).toBe(current.preview)
    expect(next.backup).toBe(current.backup)
    expect(next.sync).toBe(current.sync)
  })

  it('sanitizes patched values against current values', () => {
    const current = mergeSettings({
      ...DEFAULT_SETTINGS,
      editor: { ...DEFAULT_SETTINGS.editor, fontSize: 20 },
    })
    const next = mergeSettingsPatch(current, { editor: { fontSize: 99 } })

    expect(next.editor.fontSize).toBe(22)
    expect(next.editor.fontSize).not.toBe(current.editor.fontSize)
  })

  it('falls back to the current value for invalid patch values', () => {
    const current = mergeSettings(DEFAULT_SETTINGS)
    const next = mergeSettingsPatch(current, { appearance: { theme: 'not-a-theme' } })

    expect(next.appearance.theme).toBe(current.appearance.theme)
  })

  it('round-trips patched sections through validation', () => {
    const current = mergeSettings(DEFAULT_SETTINGS)
    const next = mergeSettingsPatch(current, {
      appearance: { proseSize: 18, proseLineHeight: 1.75 },
      preview: { math: false },
      sync: { pollIntervalMs: 30_000 },
      backup: { schedule: 'daily' },
    })

    expect(next.appearance.proseSize).toBe(18)
    expect(next.appearance.proseLineHeight).toBe(1.75)
    expect(next.preview.math).toBe(false)
    expect(next.sync.pollIntervalMs).toBe(30_000)
    expect(next.backup.schedule).toBe('daily')
  })
})

describe('assertUnchangedSettingsSections', () => {
  it('passes for mergeSettingsPatch output', () => {
    const current = mergeSettings(DEFAULT_SETTINGS)
    const next = mergeSettingsPatch(current, { editor: { lineNumbers: true } })
    expect(() => assertUnchangedSettingsSections(current, next, { editor: { lineNumbers: true } }))
      .not.toThrow()
  })

  it('passes when every section is touched', () => {
    const current = mergeSettings(DEFAULT_SETTINGS)
    const next = mergeSettingsPatch(current, {
      appearance: { density: 'compact' },
      editor: { tabSize: 4 },
      preview: { math: false },
      backup: { schedule: 'hourly' },
      sync: { realtime: false },
    })
    expect(() => assertUnchangedSettingsSections(current, next, {
      appearance: { density: 'compact' },
      editor: { tabSize: 4 },
      preview: { math: false },
      backup: { schedule: 'hourly' },
      sync: { realtime: false },
    })).not.toThrow()
  })

  it('throws when an untouched section was rebuilt', () => {
    const current = mergeSettings(DEFAULT_SETTINGS)
    const rebuilt: UserSettings = {
      ...current,
      appearance: { ...current.appearance },
    }
    expect(() => assertUnchangedSettingsSections(current, rebuilt, { editor: { lineNumbers: true } }))
      .toThrow(/appearance/)
  })
})

describe('mergeSettings', () => {
  it('builds a full settings object from defaults', () => {
    const settings = mergeSettings({})
    expect(settings).toEqual(DEFAULT_SETTINGS)
    expect(settings).not.toBe(DEFAULT_SETTINGS)
  })

  it('validates nested values', () => {
    const settings = mergeSettings({ editor: { lineNumbers: 'yes' as unknown as boolean } })
    expect(settings.editor.lineNumbers).toBe(false)
  })
})