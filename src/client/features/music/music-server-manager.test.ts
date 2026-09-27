import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { renderElement } from '../../lib/test-render'
import { t } from '../../lib/i18n'
import { useMusic } from './music-store'
import { MusicServerManager } from './music-server-manager'

const SERVER = {
  id: 'sv-1', name: 'Home', kind: 'subsonic' as const, url: 'https://music.example.com',
  username: 'me', createdAt: 1, updatedAt: 1,
}

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      music: {
        ...actual.api.music,
        listServerSources: vi.fn(async () => ({ servers: [SERVER] })),
        createServerSource: vi.fn(async () => SERVER),
        deleteServerSource: vi.fn(async () => ({ ok: true })),
        probeServerSource: vi.fn(async () => ({ ok: true })),
      },
    },
  }
})
// The confirmation is a separate host; the contract this file checks is that Remove asks before it
// deletes, and with whose name — driving the dialog itself is the overlay's own test.
vi.mock('../../components/overlay', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../components/overlay')>()
  return { ...actual, confirm: vi.fn(async () => true) }
})

import { api } from '../../lib/api'
import { confirm } from '../../components/overlay'

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  useMusic.setState({
    serverSources: [],
    serverSourcesLoading: false,
    serverSourcesError: null,
    serverProbe: null,
    serverProbingId: null,
  })
})

afterEach(() => {
  document.body.innerHTML = ''
  window.localStorage.clear()
})

// The panel draws the list; its hosts ask for it. These cases are about the drawing, so they mount
// the panel and load the list the way a host does — one ask, then a flush.
async function mount(): Promise<HTMLElement> {
  const container = renderElement(createElement(MusicServerManager)).container
  await act(async () => { await useMusic.getState().loadServerSources() })
  return container
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find((button) => button.textContent?.trim() === text)
  if (!found) throw new Error(`no button reading ${text}`)
  return found as HTMLButtonElement
}

function fieldByLabel(container: HTMLElement, label: string): HTMLInputElement {
  const found = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)
  if (!found) throw new Error(`no field labelled ${label}`)
  return found
}

function type(input: HTMLInputElement, value: string): void {
  act(() => {
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('music server manager (FB-M16)', () => {
  it('lists the registered servers with their type', async () => {
    const container = await mount()
    expect(container.textContent).toContain('Home')
    expect(container.textContent).toContain(t('music.server_kind_subsonic'))
  })

  it('says an empty account is empty rather than showing nothing', async () => {
    vi.mocked(api.music.listServerSources).mockResolvedValueOnce({ servers: [] })
    const container = await mount()
    // The empty state and the form to fix it are both on screen: the words alone would leave the
    // reader with nothing to press.
    expect(container.textContent).toContain(t('music.server_none'))
    expect(container.querySelector('form')).not.toBeNull()
  })

  // A registration is only worth keeping if it answers, so Test is a real round trip and its verdict
  // stays beside the row instead of disappearing with a toast.
  it('keeps the verdict of a test beside the row', async () => {
    const container = await mount()
    await act(async () => { buttonByText(container, t('music.server_test')).click() })
    await act(async () => { await Promise.resolve() })
    expect(api.music.probeServerSource).toHaveBeenCalledWith('sv-1')
    expect(container.textContent).toContain(t('music.server_test_ok'))
  })

  it('names the reason when the server did not answer', async () => {
    vi.mocked(api.music.probeServerSource).mockRejectedValueOnce(new Error('401 Unauthorized'))
    const container = await mount()
    await act(async () => { buttonByText(container, t('music.server_test')).click() })
    await act(async () => { await Promise.resolve() })
    expect(container.textContent).toContain(t('music.server_test_failed', { value0: '401 Unauthorized' }))
  })
})

describe('music server registration form (FB-M16)', () => {
  // A half-filled form must not reach the worker: the server would be asked to register a URL nobody
  // typed, and the answer would be about the wrong thing.
  it('does not send an incomplete registration', async () => {
    const container = await mount()
    await act(async () => { buttonByText(container, t('music.server_add')).click() })
    expect(api.music.createServerSource).not.toHaveBeenCalled()
  })

  it('sends every field that was typed, and clears them once it lands', async () => {
    const container = await mount()
    type(fieldByLabel(container, t('music.server_name')), 'Studio')
    type(fieldByLabel(container, t('music.server_url')), 'https://studio.example.com')
    type(fieldByLabel(container, t('music.server_username')), 'me')
    type(fieldByLabel(container, t('music.server_password')), 'pw')
    await act(async () => { buttonByText(container, t('music.server_add')).click() })
    await act(async () => { await Promise.resolve() })
    expect(api.music.createServerSource).toHaveBeenCalledWith({
      name: 'Studio', kind: 'subsonic', url: 'https://studio.example.com', username: 'me', password: 'pw',
    })
    expect(fieldByLabel(container, t('music.server_url')).value).toBe('')
  })

  it('keeps a refused registration as typed, so a wrong password is one edit away', async () => {
    vi.mocked(api.music.createServerSource).mockRejectedValueOnce(new Error('unauthorized'))
    const container = await mount()
    type(fieldByLabel(container, t('music.server_name')), 'Studio')
    type(fieldByLabel(container, t('music.server_url')), 'https://studio.example.com')
    type(fieldByLabel(container, t('music.server_username')), 'me')
    type(fieldByLabel(container, t('music.server_password')), 'wrong')
    await act(async () => { buttonByText(container, t('music.server_add')).click() })
    await act(async () => { await Promise.resolve() })
    expect(fieldByLabel(container, t('music.server_password')).value).toBe('wrong')
  })

  it('asks before removing a server, naming it', async () => {
    const container = await mount()
    await act(async () => {
      container.querySelector<HTMLButtonElement>(`button[aria-label="${t('music.server_delete')}: Home"]`)!.click()
    })
    await act(async () => { await Promise.resolve() })
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
      description: t('music.server_delete_confirm', { value0: 'Home' }),
      tone: 'danger',
    }))
    expect(api.music.deleteServerSource).toHaveBeenCalledWith('sv-1')
  })
})
