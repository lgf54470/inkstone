import { describe, expect, it } from 'vitest'
import type { UserSettings } from './types'
import {
  DEFAULT_SETTINGS,
  STALE_LINK_DEFAULT_DAYS,
  STALE_LINK_MAX_DAYS,
  VISIT_LOG_RETENTION_DEFAULT_DAYS,
  VISIT_LOG_RETENTION_MAX_DAYS,
  assertUnchangedSettingsSections,
  mergeSettings,
  mergeSettingsPatch,
} from './user-settings'

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
    expect(next.notes).toBe(current.notes)
    expect(next.share).toBe(current.share)
    expect(next.blog).toBe(current.blog)
  })

  it('backfills missing sections when merging patch onto incomplete settings', () => {
    const legacy = {
      appearance: { ...DEFAULT_SETTINGS.appearance },
      editor: { ...DEFAULT_SETTINGS.editor },
      preview: { ...DEFAULT_SETTINGS.preview },
      backup: { ...DEFAULT_SETTINGS.backup },
      sync: { ...DEFAULT_SETTINGS.sync },
    }
    const next = mergeSettingsPatch(legacy, { preview: { layout: 'preview' } })
    expect(next.notes).toBeDefined()
    expect(next.notes.todoTag).toBeNull()
    expect(next.preview.layout).toBe('preview')
    expect(next.share.visitLogRetentionDays).toBe(DEFAULT_SETTINGS.share.visitLogRetentionDays)
    expect(next.blog.visitLogRetentionDays).toBe(DEFAULT_SETTINGS.blog.visitLogRetentionDays)
  })
})

describe('mergeSettingsPatch sanitization', () => {
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
      notes: { syncFrontMatterTitle: false },
      share: { visitLogRetentionDays: 90 },
    })

    expect(next.appearance.proseSize).toBe(18)
    expect(next.appearance.proseLineHeight).toBe(1.75)
    expect(next.preview.math).toBe(false)
    expect(next.sync.pollIntervalMs).toBe(30_000)
    expect(next.backup.schedule).toBe('daily')
    expect(next.notes.syncFrontMatterTitle).toBe(false)
    expect(next.notes.newNoteTemplate).toBe(DEFAULT_SETTINGS.notes.newNoteTemplate)
    expect(next.share.visitLogRetentionDays).toBe(90)
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
      share: { visitLogRetentionDays: 7 },
    })
    expect(() => assertUnchangedSettingsSections(current, next, {
      appearance: { density: 'compact' },
      editor: { tabSize: 4 },
      preview: { math: false },
      backup: { schedule: 'hourly' },
      sync: { realtime: false },
      share: { visitLogRetentionDays: 7 },
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

describe('share visit log retention setting (SH-05c)', () => {
  it('ships a bounded default so the sweep works without the browser that set it', () => {
    expect(mergeSettings({}).share.visitLogRetentionDays).toBe(VISIT_LOG_RETENTION_DEFAULT_DAYS)
  })

  it('keeps "keep forever" as zero instead of falling back to the default', () => {
    const next = mergeSettingsPatch(mergeSettings({}), { share: { visitLogRetentionDays: 0 } })
    expect(next.share.visitLogRetentionDays).toBe(0)
  })

  it('clamps retention into the supported range', () => {
    const current = mergeSettingsPatch(mergeSettings({}), { share: { visitLogRetentionDays: 90 } })
    expect(mergeSettingsPatch(current, { share: { visitLogRetentionDays: 100_000 } }).share.visitLogRetentionDays)
      .toBe(VISIT_LOG_RETENTION_MAX_DAYS)
    expect(mergeSettingsPatch(current, { share: { visitLogRetentionDays: -3 } }).share.visitLogRetentionDays).toBe(0)
    expect(mergeSettingsPatch(current, { share: { visitLogRetentionDays: 90.6 } }).share.visitLogRetentionDays).toBe(91)
  })

  it('falls back to the stored retention for a value that is not a number', () => {
    const current = mergeSettingsPatch(mergeSettings({}), { share: { visitLogRetentionDays: 90 } })
    const next = mergeSettingsPatch(current, { share: { visitLogRetentionDays: '30' } })
    expect(next.share.visitLogRetentionDays).toBe(90)
  })

})

describe('share link hygiene threshold setting (SH-70)', () => {
  it('leaves the hygiene threshold alone when only the retention is patched', () => {
    // Both live in the share section, which used to be one knob: the second must not be wiped by a
    // patch that never mentioned it.
    const current = mergeSettingsPatch(mergeSettings({}), { share: { staleLinkDays: 30 } })
    const next = mergeSettingsPatch(current, { share: { visitLogRetentionDays: 7 } })
    expect(next.share.staleLinkDays).toBe(30)
    expect(next.share.visitLogRetentionDays).toBe(7)
  })

  it('ships the hygiene threshold default for an account whose document predates it (SH-70)', () => {
    // The dashboard reads this number to decide what to report, so an account that never opened
    // the modal must still get a bounded answer rather than an absent one.
    expect(mergeSettings({}).share.staleLinkDays).toBe(STALE_LINK_DEFAULT_DAYS)
    const legacy = mergeSettingsPatch(mergeSettings({ share: { visitLogRetentionDays: 30 } }), { share: { visitLogRetentionDays: 7 } })
    expect(legacy.share.staleLinkDays).toBe(STALE_LINK_DEFAULT_DAYS)
  })

  it('clamps the hygiene threshold, keeping the off switch at zero', () => {
    const current = mergeSettings({})
    expect(mergeSettingsPatch(current, { share: { staleLinkDays: 0 } }).share.staleLinkDays).toBe(0)
    expect(mergeSettingsPatch(current, { share: { staleLinkDays: 100_000 } }).share.staleLinkDays)
      .toBe(STALE_LINK_MAX_DAYS)
    expect(mergeSettingsPatch(current, { share: { staleLinkDays: -1 } }).share.staleLinkDays).toBe(0)
  })

  it('survives a settings round-trip through stored JSON', () => {
    const saved = JSON.stringify(mergeSettingsPatch(mergeSettings({}), { share: { visitLogRetentionDays: 180 } }))
    expect(mergeSettings(JSON.parse(saved)).share.visitLogRetentionDays).toBe(180)
  })
})

describe('blog visit log retention setting (SH-43)', () => {
  it('ships a bounded default so the sweep works without the browser that set it', () => {
    expect(mergeSettings({}).blog.visitLogRetentionDays).toBe(VISIT_LOG_RETENTION_DEFAULT_DAYS)
  })

  it('keeps "keep forever" as zero instead of falling back to the default', () => {
    const next = mergeSettingsPatch(mergeSettings({}), { blog: { visitLogRetentionDays: 0 } })
    expect(next.blog.visitLogRetentionDays).toBe(0)
  })

  it('clamps retention into the supported range', () => {
    const current = mergeSettingsPatch(mergeSettings({}), { blog: { visitLogRetentionDays: 90 } })
    expect(mergeSettingsPatch(current, { blog: { visitLogRetentionDays: 100_000 } }).blog.visitLogRetentionDays)
      .toBe(VISIT_LOG_RETENTION_MAX_DAYS)
    expect(mergeSettingsPatch(current, { blog: { visitLogRetentionDays: '30' } }).blog.visitLogRetentionDays).toBe(90)
  })

  it('saves the blog knob without disturbing the share twin', () => {
    const before = mergeSettingsPatch(mergeSettings({}), { share: { visitLogRetentionDays: 7 } })
    const next = mergeSettingsPatch(before, { blog: { visitLogRetentionDays: 180 } })
    expect(next.blog.visitLogRetentionDays).toBe(180)
    expect(next.share.visitLogRetentionDays).toBe(7)
  })
})
