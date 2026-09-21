import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserSettings } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/user-settings'
import { renderElement } from '../../lib/test-render'
import { t } from '../../lib/i18n'
import { ShareSettingsModal } from './share-settings-modal'

const session = vi.hoisted(() => ({
  state: {
    settings: {} as UserSettings,
    updateSettings: vi.fn(),
  },
  useSession: (selector: (state: typeof session.state) => unknown) => selector(session.state),
}))

vi.mock('../../store/session', () => ({ useSession: session.useSession }))

const shareStore = vi.hoisted(() => ({
  state: {
    excludeBots: true,
    excludeSelfReferrers: false,
    excludeOwner: false,
    setFilters: vi.fn(),
  },
  useShareStore: (selector: (state: typeof shareStore.state) => unknown) => selector(shareStore.state),
}))

vi.mock('./share-store', () => ({ useShareStore: shareStore.useShareStore }))

/**
 * The retention control, found by the label it is named with rather than by its options: the modal
 * grew a second segmented control (SH-70's hygiene threshold), and a lookup keyed on one of the
 * retention's own option texts would be one copy away from picking that control up instead.
 */
function retentionGroup(): HTMLElement {
  const group = groupNamedBy(t('share.retention_days_label'))
  if (!group) throw new Error('the retention radiogroup did not render')
  return group
}

function groupNamedBy(label: string): HTMLElement | null {
  return Array.from(document.querySelectorAll('[role="radiogroup"]')).find(
    (element) => document.getElementById(element.getAttribute('aria-labelledby') ?? '')?.textContent === label,
  ) as HTMLElement | null
}

function optionLabel(group: HTMLElement): string | null {
  const checked = group.querySelector('[aria-checked="true"]')
  return checked?.textContent ?? null
}

function clickByText(group: HTMLElement, label: string): void {
  const button = Array.from(group.querySelectorAll('button')).find((element) => element.textContent === label)
  if (!button) throw new Error(`option ${label} is missing`)
  act(() => { button.click() })
}

async function save(): Promise<void> {
  const button = Array.from(document.querySelectorAll('button'))
    .find((element) => element.textContent === t('common.save'))
  if (!button) throw new Error('the save button is missing')
  await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}

beforeEach(() => {
  localStorage.clear()
  session.state.updateSettings.mockReset()
  shareStore.state.setFilters.mockReset()
  shareStore.state.excludeBots = true
  shareStore.state.excludeSelfReferrers = false
  shareStore.state.excludeOwner = false
})

describe('share settings modal keeps visit-log retention on the account (SH-05c)', () => {
  it('offers the retention the account stored instead of this browser cache', () => {
    session.state.settings = { ...DEFAULT_SETTINGS, share: { ...DEFAULT_SETTINGS.share, visitLogRetentionDays: 90 } }
    localStorage.setItem('inkstone_share_retention', JSON.stringify({ logRetentionDays: 7, maxLogRecords: 5000 }))

    const rendered = renderElement(createElement(ShareSettingsModal, { open: true, onClose: () => {} }))
    expect(optionLabel(retentionGroup())).toBe('90d')
    rendered.unmount()
  })

  it('saves the chosen retention through the settings API, so other devices get it too', async () => {
    session.state.settings = { ...DEFAULT_SETTINGS, share: { ...DEFAULT_SETTINGS.share, visitLogRetentionDays: 90 } }

    const rendered = renderElement(createElement(ShareSettingsModal, { open: true, onClose: () => {} }))
    clickByText(retentionGroup(), '7d')
    await save()

    expect(session.state.updateSettings).toHaveBeenCalledWith({ share: { ...DEFAULT_SETTINGS.share, visitLogRetentionDays: 7 } })
    rendered.unmount()
  })

  it('stops writing the retention into browser storage', async () => {
    session.state.settings = { ...DEFAULT_SETTINGS, share: { ...DEFAULT_SETTINGS.share, visitLogRetentionDays: 30 } }

    const rendered = renderElement(createElement(ShareSettingsModal, { open: true, onClose: () => {} }))
    clickByText(retentionGroup(), '30d')
    await save()

    expect(session.state.updateSettings).toHaveBeenCalledWith({ share: { ...DEFAULT_SETTINGS.share, visitLogRetentionDays: 30 } })
    expect(localStorage.getItem('inkstone_share_retention')).toBeNull()
    rendered.unmount()
  })

  it('still shows the account retention when the browser never cached one', () => {
    session.state.settings = { ...DEFAULT_SETTINGS, share: { ...DEFAULT_SETTINGS.share, visitLogRetentionDays: 180 } }

    const rendered = renderElement(createElement(ShareSettingsModal, { open: true, onClose: () => {} }))
    expect(optionLabel(retentionGroup())).toBe('180d')
    rendered.unmount()
  })
})

describe('share settings modal draws no record cap control (SH-39)', () => {
  it('draws the two thresholds the server acts on and no record cap', () => {
    session.state.settings = { ...DEFAULT_SETTINGS, share: { ...DEFAULT_SETTINGS.share, visitLogRetentionDays: 30 } }

    const rendered = renderElement(createElement(ShareSettingsModal, { open: true, onClose: () => {} }))
    // SH-70 added the second one: how long a link may stay unread before it is reported. Both are
    // named controls with the label the eye reads, which is what keeps this from being a count of
    // controls for its own sake.
    const labels = Array.from(document.querySelectorAll('[role="radiogroup"]'))
      .map((group) => document.getElementById(group.getAttribute('aria-labelledby') ?? '')?.textContent)
    expect(labels).toEqual([t('share.retention_days_label'), t('share.stale_days_label')])
    expect(document.body.textContent).not.toContain('10K')
    rendered.unmount()
  })

  it('saves what is left: the traffic filters and the account retention', async () => {
    session.state.settings = { ...DEFAULT_SETTINGS, share: { ...DEFAULT_SETTINGS.share, visitLogRetentionDays: 30 } }
    shareStore.state.excludeBots = false

    const rendered = renderElement(createElement(ShareSettingsModal, { open: true, onClose: () => {} }))
    await save()

    expect(shareStore.state.setFilters).toHaveBeenCalledTimes(1)
    expect(shareStore.state.setFilters).toHaveBeenCalledWith({
      excludeBots: false,
      excludeSelfReferrers: false,
      excludeOwner: false,
    })
    expect(session.state.updateSettings).toHaveBeenCalledTimes(1)
    expect(session.state.updateSettings).toHaveBeenCalledWith({ share: { ...DEFAULT_SETTINGS.share, visitLogRetentionDays: 30 } })
    rendered.unmount()
  })
})

describe('the retention control has a name and a keyboard path (SH-40)', () => {
  it('names the retention control with the label the eye reads', () => {
    session.state.settings = { ...DEFAULT_SETTINGS, share: { ...DEFAULT_SETTINGS.share, visitLogRetentionDays: 30 } }

    const rendered = renderElement(createElement(ShareSettingsModal, { open: true, onClose: () => {} }))
    const group = retentionGroup()
    const labelledBy = group.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    expect(document.getElementById(labelledBy as string)?.textContent).toBe(t('share.retention_days_label'))
    // The visible text is the name; a second hidden label would only drift.
    expect(group.getAttribute('aria-label')).toBeNull()
    rendered.unmount()
  })

  it('moves the retention choice with the arrow keys and keeps focus on the new option', () => {
    session.state.settings = { ...DEFAULT_SETTINGS, share: { ...DEFAULT_SETTINGS.share, visitLogRetentionDays: 30 } }

    const rendered = renderElement(createElement(ShareSettingsModal, { open: true, onClose: () => {} }))
    const checked = retentionGroup().querySelector('[aria-checked="true"]') as HTMLElement
    act(() => { checked.focus() })
    act(() => {
      checked.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })

    expect(optionLabel(retentionGroup())).toBe('90d')
    expect(document.activeElement?.textContent).toBe('90d')
    rendered.unmount()
  })
})
