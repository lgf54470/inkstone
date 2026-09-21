import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserSettings } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/user-settings'
import { renderElement, type RenderedElement } from '../../lib/test-render'
import { t } from '../../lib/i18n'
import { api } from '../../lib/api'
import { confirm, prompt } from '../../components/overlay'
import { BlogSettingsModal } from './blog-settings-modal'

const session = vi.hoisted(() => ({
  state: {
    settings: {} as UserSettings,
    updateSettings: vi.fn(),
  },
  useSession: (selector: (state: typeof session.state) => unknown) => selector(session.state),
}))

vi.mock('../../store/session', () => ({ useSession: session.useSession }))

const blogStore = vi.hoisted(() => ({
  state: {
    settings: { siteName: 'Blog' },
    saveSettings: vi.fn(async () => {}),
    excludeBots: true,
    excludeSelfReferrers: false,
    excludeOwner: false,
    setFilters: vi.fn(),
  },
  useBlogStore: (selector: (state: typeof blogStore.state) => unknown) => selector(blogStore.state),
}))

vi.mock('./blog-store', () => ({ useBlogStore: blogStore.useBlogStore }))

vi.mock('../../lib/api', () => ({
  api: { blog: { cleanVisits: vi.fn(async () => ({ deleted: 2 })) } },
}))

vi.mock('../../components/overlay', async (importOriginal) => {
  const module = await importOriginal<typeof import('../../components/overlay')>()
  return {
    ...module,
    confirm: vi.fn(async () => true),
    prompt: vi.fn(async () => 'wipe-password-1'),
  }
})

function buttonByText(root: ParentNode, label: string): HTMLElement {
  const button = Array.from(root.querySelectorAll('button')).find((element) => element.textContent === label)
  if (!button) throw new Error(`option ${label} is missing`)
  return button as HTMLElement
}

function clickByText(root: ParentNode, label: string): HTMLElement {
  const button = buttonByText(root, label)
  act(() => { button.click() })
  return button
}

function retentionGroup(): HTMLElement {
  const groups = Array.from(document.querySelectorAll('[role="radiogroup"]'))
  const group = groups.find((element) => element.textContent?.includes('90d'))
  if (!group) throw new Error('the retention radiogroup did not render')
  return group as HTMLElement
}

function checkedLabel(group: HTMLElement): string | null {
  return group.querySelector('[aria-checked="true"]')?.textContent ?? null
}

// A test that fails before its unmount would otherwise leave its modal in the
// document, and the next test's button lookup would drive that stale instance.
let rendered: RenderedElement | null = null

function openModal(): void {
  rendered?.unmount()
  rendered = renderElement(createElement(BlogSettingsModal, { open: true, onClose: () => {} }))
}

function openTrafficTab(): void {
  clickByText(document, t('share.filter_traffic_title'))
}

async function save(): Promise<void> {
  const button = buttonByText(document, t('blog.save_settings'))
  await act(async () => { button.click() })
}

async function cleanOlderLogs(): Promise<void> {
  const button = buttonByText(document, t('share.clean_older_than_retention'))
  await act(async () => { button.click() })
}

async function cleanAllLogs(): Promise<void> {
  const button = buttonByText(document, t('share.clean_all_logs'))
  await act(async () => { button.click() })
}

beforeEach(() => {
  localStorage.clear()
  session.state.updateSettings.mockReset()
  blogStore.state.setFilters.mockReset()
  blogStore.state.saveSettings.mockClear()
  blogStore.state.excludeBots = true
  blogStore.state.excludeSelfReferrers = false
  blogStore.state.excludeOwner = false
  vi.mocked(api.blog.cleanVisits).mockClear()
  vi.mocked(confirm).mockClear()
  vi.mocked(prompt).mockClear()
  vi.mocked(prompt).mockResolvedValue('wipe-password-1')
})

afterEach(() => {
  rendered?.unmount()
  rendered = null
})

describe('blog settings modal keeps visit-log retention on the account (SH-43)', () => {
  it('shows the retention the account stored, not a period this browser cached', () => {
    session.state.settings = { ...DEFAULT_SETTINGS, blog: { visitLogRetentionDays: 90 } }
    localStorage.setItem('inkstone_blog_retention_settings', JSON.stringify({ logRetentionDays: 7, maxLogRecords: 5000 }))

    openModal()
    openTrafficTab()

    expect(checkedLabel(retentionGroup())).toBe('90d')
  })

  it('saves the chosen retention through the settings API, so the server sweep sees it', async () => {
    session.state.settings = { ...DEFAULT_SETTINGS, blog: { visitLogRetentionDays: 90 } }

    openModal()
    openTrafficTab()
    clickByText(retentionGroup(), '7d')
    await save()

    expect(session.state.updateSettings).toHaveBeenCalledTimes(1)
    expect(session.state.updateSettings).toHaveBeenCalledWith({ blog: { visitLogRetentionDays: 7 } })
    // The period belongs to the account: nothing in this save may re-cache it.
    expect(localStorage.getItem('inkstone_blog_retention_settings')).toBeNull()
  })

  it('leaves the share retention alone while saving the blog one', async () => {
    session.state.settings = { ...DEFAULT_SETTINGS, share: { ...DEFAULT_SETTINGS.share, visitLogRetentionDays: 7 }, blog: { visitLogRetentionDays: 30 } }

    openModal()
    openTrafficTab()
    await save()

    const patch = session.state.updateSettings.mock.calls[0]?.[0] as UserSettings
    expect(patch.blog.visitLogRetentionDays).toBe(30)
    expect('share' in patch).toBe(false)
  })
})

describe('blog log cleanup honours the account retention (SH-43)', () => {
  it('refuses to clean by age while the account keeps visits forever', async () => {
    session.state.settings = { ...DEFAULT_SETTINGS, blog: { visitLogRetentionDays: 0 } }

    openModal()
    openTrafficTab()
    await cleanOlderLogs()

    expect(api.blog.cleanVisits).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
  })

  it('cleans by the account retention when it is a real window', async () => {
    session.state.settings = { ...DEFAULT_SETTINGS, blog: { visitLogRetentionDays: 30 } }

    openModal()
    openTrafficTab()
    await cleanOlderLogs()

    // Cleaning by age needs no re-authentication, so the password stays unset.
    expect(api.blog.cleanVisits).toHaveBeenCalledWith('older_than', 30, undefined)
  })
})

describe('blog settings modal draws no record cap control (SH-45)', () => {
  it('leaves the retention period as the only traffic segmented control', () => {
    session.state.settings = { ...DEFAULT_SETTINGS, blog: { visitLogRetentionDays: 30 } }

    openModal()
    openTrafficTab()

    // The tab switcher and the retention period; nothing else asks for a count.
    expect(document.querySelectorAll('[role="radiogroup"]')).toHaveLength(2)
    expect(document.body.textContent).not.toContain('10K')
  })

  it('saves what is left: the traffic filters and the account retention', async () => {
    session.state.settings = { ...DEFAULT_SETTINGS, blog: { visitLogRetentionDays: 30 } }
    blogStore.state.excludeBots = false

    openModal()
    openTrafficTab()
    await save()

    expect(blogStore.state.setFilters).toHaveBeenCalledTimes(1)
    expect(blogStore.state.setFilters).toHaveBeenCalledWith({
      excludeBots: false,
      excludeSelfReferrers: false,
      excludeOwner: false,
    })
    expect(session.state.updateSettings).toHaveBeenCalledTimes(1)
    expect(session.state.updateSettings).toHaveBeenCalledWith({ blog: { visitLogRetentionDays: 30 } })
  })
})

describe('blog log wipe re-asks for the current password (SH-47)', () => {
  async function wipeWithPrompt(): Promise<void> {
    session.state.settings = { ...DEFAULT_SETTINGS, blog: { visitLogRetentionDays: 30 } }
    openModal()
    openTrafficTab()
    await cleanAllLogs()
  }

  it('forwards the entered password with the all-scope cleanup', async () => {
    await wipeWithPrompt()

    expect(prompt).toHaveBeenCalledTimes(1)
    expect(api.blog.cleanVisits).toHaveBeenCalledWith('all', 30, 'wipe-password-1')
  })

  it('sends nothing when the password prompt is dismissed', async () => {
    vi.mocked(prompt).mockResolvedValueOnce(null)

    await wipeWithPrompt()

    expect(api.blog.cleanVisits).not.toHaveBeenCalled()
  })

  it('does not ask for a password to clean bots', async () => {
    session.state.settings = { ...DEFAULT_SETTINGS, blog: { visitLogRetentionDays: 30 } }
    openModal()
    openTrafficTab()
    await act(async () => { buttonByText(document, t('share.clean_bots_only')).click() })

    expect(prompt).not.toHaveBeenCalled()
    expect(api.blog.cleanVisits).toHaveBeenCalledWith('bots', 30, undefined)
  })
})

describe('blog settings radiogroups carry accessible names (SH-46)', () => {
  function nameOf(group: HTMLElement): string | null {
    const id = group.getAttribute('aria-labelledby')
    return id === null ? group.getAttribute('aria-label') : (document.getElementById(id)?.textContent ?? null)
  }

  function tabGroup(): HTMLElement {
    const group = Array.from(document.querySelectorAll('[role="radiogroup"]'))
      .find((element) => element.textContent?.includes(t('blog.site_basic_info')))
    if (!group) throw new Error('the tab switcher did not render')
    return group as HTMLElement
  }

  it('names the retention period with its own visible label', () => {
    session.state.settings = { ...DEFAULT_SETTINGS, blog: { visitLogRetentionDays: 30 } }

    openModal()
    openTrafficTab()

    expect(nameOf(retentionGroup())).toBe(t('share.retention_days_label'))
  })

  it('names the section switcher that has no visible heading of its own', () => {
    session.state.settings = { ...DEFAULT_SETTINGS, blog: { visitLogRetentionDays: 30 } }

    openModal()

    expect(nameOf(tabGroup())).toBe(t('blog.settings_tab_label'))
  })
})
