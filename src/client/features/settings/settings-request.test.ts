import { describe, expect, it } from 'vitest'
import { useUi } from '../../store/ui'
import { resolveSettingsSection } from './settings-panel'

// FB-F4: the hub's gear opens the settings panel on the music page. The request travels as a
// plain string, so the panel is the place that decides whether it names a section it has.
describe('opening settings on a section (FB-F4)', () => {
  it('takes a section it knows', () => {
    expect(resolveSettingsSection('music')).toBe('music')
  })

  it('falls back to the first section for anything else', () => {
    expect(resolveSettingsSection(null)).toBe('appearance')
    expect(resolveSettingsSection('nonsense')).toBe('appearance')
  })

  it('records the request on the ui store', () => {
    useUi.getState().openSettings('music')
    expect(useUi.getState().panel).toBe('settings')
    expect(useUi.getState().settingsSection).toBe('music')
    useUi.getState().closePanel()
  })

  it('opens plainly when no section is asked for', () => {
    useUi.getState().openSettings('music')
    useUi.getState().openSettings()
    expect(useUi.getState().panel).toBe('settings')
    expect(useUi.getState().settingsSection).toBeNull()
    useUi.getState().closePanel()
  })
})
