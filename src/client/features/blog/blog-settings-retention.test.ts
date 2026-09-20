import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserSettings } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/user-settings'
import { renderElement, type RenderedElement } from '../../lib/test-render'
import { t } from '../../lib/i18n'
import { api } from '../../lib/api'
import { confirm } from '../../components/overlay'
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
    maxLogRecords: 1000,
    setFilters: vi.fn(),
    setRetentionSettings: vi.fn(),
  },
  useBlogStore: (selector: (state: typeof blogStore.state) => unknown) => selector(blogStore.state),
}))

vi.mock('./blog-store', () => ({ useBlogStore: blogStore.useBlogStore }))

vi.mock('../../lib/api', () => ({
  api: { blog: { cleanVisits: vi.fn(async () => ({ deleted: 2 })) } },
}))

vi.mock('../../components/overlay', async (importOriginal) => {
  const module = await importOriginal<typeof import('../../components/overlay')>()
  return { ...module, confirm: vi.fn(async () => true) }
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

beforeEach(() => {
  localStorage.clear()
  session.state.updateSettings.mockReset()
  blogStore.state.setFilters.mockReset()
  blogStore.state.setRetentionSettings.mockReset()
  blogStore.state.saveSettings.mockClear()
  vi.mocked(api.blog.cleanVisits).mockClear()
  vi.mocked(confirm).mockClear()
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
    expect(blogStore.state.setRetentionSettings).toHaveBeenCalledWith({ maxLogRecords: 1000 })
    // The period belongs to the account: nothing in this save may re-cache it.
    expect(localStorage.getItem('inkstone_blog_retention_settings')).toBeNull()
  })

  it('leaves the share retention alone while saving the blog one', async () => {
    session.state.settings = { ...DEFAULT_SETTINGS, share: { visitLogRetentionDays: 7 }, blog: { visitLogRetentionDays: 30 } }

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

    expect(api.blog.cleanVisits).toHaveBeenCalledWith('older_than', 30)
  })
})
