import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicTrack } from '@shared/types'
import { initI18n, t } from '../../lib/i18n'
import { api } from '../../lib/api'
import { toastMusic, toastMusicError } from './music-feedback'
import { MusicUrlImportButton } from './music-url-import'
import { useMusic } from './music-store'

// The barrel composes `api` from the domain objects at import time, so the patch
// must land on `api.music` — replacing the bare `music` export reaches nobody.
vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      music: {
        ...actual.api.music,
        importTrackFromUrl: vi.fn(async () => null),
      },
    },
  }
})

vi.mock('./music-feedback', () => ({
  toastMusic: vi.fn(),
  toastMusicError: vi.fn(),
  toastMusicNotice: vi.fn(),
}))

beforeAll(async () => {
  await initI18n()
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

// sizeBytes 0 keeps the duration probe short-circuited, exactly like a real
// external reference row.
const importedTrack = { id: 'ext-1', title: 'Remote song', source: 'external', sizeBytes: 0 } as unknown as MusicTrack

let root: Root | null = null

async function mount(): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(MusicUrlImportButton))
  })
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useMusic.setState({ tracks: [] })
  vi.clearAllMocks()
})

describe('URL import dialog (FEA-B3)', () => {
  it('submits the url, appends the returned track and closes on success', async () => {
    vi.mocked(api.music.importTrackFromUrl).mockResolvedValue(importedTrack)
    await mount()
    const trigger = [...document.querySelectorAll('button')].find((button) => button.textContent?.includes(t('music.import_url')))
    await act(async () => {
      trigger?.click()
    })
    const url = document.querySelector('input[aria-label="' + t('music.import_url_address') + '"]') as HTMLInputElement
    const title = document.querySelector('input[aria-label="' + t('music.import_url_name') + '"]') as HTMLInputElement
    await act(async () => {
      url.value = 'https://cdn.example.com/remote song.mp3'
      url.dispatchEvent(new Event('input', { bubbles: true }))
      title.value = 'Remote song'
      title.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const add = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === t('music.import_url_add')) as HTMLButtonElement
    await act(async () => {
      add.click()
    })
    await act(async () => {})
    expect(api.music.importTrackFromUrl).toHaveBeenCalledWith({ url: 'https://cdn.example.com/remote song.mp3', title: 'Remote song' })
    expect(toastMusic).toHaveBeenCalledWith('music.imported')
    expect(useMusic.getState().tracks.map((track) => track.id)).toContain('ext-1')
    expect(url.isConnected).toBe(false)
  })

  it('reports a failed import and keeps the dialog open', async () => {
    vi.mocked(api.music.importTrackFromUrl).mockRejectedValue(new Error('offline'))
    await mount()
    const trigger = [...document.querySelectorAll('button')].find((button) => button.textContent?.includes(t('music.import_url')))
    await act(async () => {
      trigger?.click()
    })
    const url = document.querySelector('input[aria-label="' + t('music.import_url_address') + '"]') as HTMLInputElement
    await act(async () => {
      url.value = 'https://cdn.example.com/a.mp3'
      url.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const add = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === t('music.import_url_add')) as HTMLButtonElement
    await act(async () => {
      add.click()
    })
    await act(async () => {})
    expect(toastMusicError).toHaveBeenCalled()
    expect(url.isConnected).toBe(true)
  })
})
