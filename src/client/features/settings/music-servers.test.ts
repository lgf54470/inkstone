import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { renderElement } from '../../lib/test-render'
import { t } from '../../lib/i18n'
import { useMusic } from '../music'
import { MusicServers } from './music-servers'

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
      },
    },
  }
})

import { api } from '../../lib/api'

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  useMusic.setState({
    serverSources: [], serverSourcesLoading: false, serverSourcesError: null,
    serverProbe: null, serverProbingId: null,
  })
})

afterEach(() => {
  document.body.innerHTML = ''
  window.localStorage.clear()
})

// FB-M16: the settings group is the registration home, and it is the host that asks for the list —
// the panel itself never fetches, so the group has to do it or the page would open empty.
describe('music servers settings section (FB-M16)', () => {
  it('asks for the registrations when it opens', async () => {
    const container = renderElement(createElement(MusicServers)).container
    await act(async () => { await Promise.resolve() })
    expect(api.music.listServerSources).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain(t('music.server_title'))
  })

  it('shows the registered server and the way in from the library', async () => {
    const container = renderElement(createElement(MusicServers)).container
    await act(async () => { await Promise.resolve() })
    expect(container.textContent).toContain('Home')
    expect(container.textContent).toContain(t('music.server_hint'))
  })
})
