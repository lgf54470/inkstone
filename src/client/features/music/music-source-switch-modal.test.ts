import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { t } from '../../lib/i18n'
import { renderElement } from '../../lib/test-render'
import { useMusic } from './music-store'
import { MusicSourceSwitchModal } from './music-source-switch-modal'

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>()
  return {
    ...actual,
    api: { ...actual.api, music: { ...actual.api.music, providerSearch: vi.fn(async () => ({ results: [] })) } },
  }
})

const CANDIDATE = {
  provider: 'gds', source: 'kuwo', sourceId: 'kuwo-1', title: 'Song A', artist: 'Ann',
  album: 'Album', durationMs: 245_000, coverId: null, lyricId: null,
}

const ROW = {
  id: 'dead', title: 'Song A', artist: 'Ann', album: 'Album', durationMs: 245_000,
  source: 'provider', providerSource: 'netease', providerSongId: 'netease-1',
} as never

let rendered: ReturnType<typeof renderElement> | null = null

function bodyText(): string {
  return document.body.textContent ?? ''
}

function buttonsByText(text: string): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].filter((button) => button.textContent?.trim() === text)
}

function mount(): void {
  rendered = renderElement(createElement(MusicSourceSwitchModal))
}

afterEach(() => {
  act(() => rendered?.unmount())
  rendered = null
  document.body.innerHTML = ''
  useMusic.setState({ tracks: [], sourceSwitchTrackId: null, sourceSwitchCandidates: null, sourceSwitchLoading: false, sourceSwitchFailed: false })
  vi.clearAllMocks()
})

// FB-F8: every state of the panel has words — loading, the failure with its retry, the list, and the
// honest empty answer where no other catalogue has the song at all.
describe('the source switch panel states (FB-F8)', () => {
  it('draws nothing at all when no row asked for a switch', () => {
    mount()
    expect(document.body.textContent ?? '').toBe('')
  })

  it('says it is loading', () => {
    useMusic.setState({ tracks: [ROW], sourceSwitchTrackId: 'dead', sourceSwitchLoading: true })
    mount()
    expect(bodyText()).toContain(t('common.loading'))
  })

  it('names the failure and offers the retry', async () => {
    useMusic.setState({ tracks: [ROW], sourceSwitchTrackId: 'dead', sourceSwitchFailed: true })
    const openSourceSwitch = vi.fn(async () => {})
    useMusic.setState({ openSourceSwitch })
    mount()
    expect(bodyText()).toContain(t('music.source_switch_failed'))
    const retry = buttonsByText(t('music.retry'))[0]
    expect(retry).toBeTruthy()
    await act(async () => { retry?.click() })
    expect(openSourceSwitch).toHaveBeenCalledWith('dead')
  })

  it('says no other catalogue has the song instead of showing an empty list', () => {
    useMusic.setState({ tracks: [ROW], sourceSwitchTrackId: 'dead', sourceSwitchCandidates: [] })
    mount()
    expect(bodyText()).toContain(t('music.source_switch_none'))
  })
})

describe('the source switch list (FB-F8)', () => {
  it('names each candidate by its catalogue and hands the chosen one over', async () => {
    const switchTrackSource = vi.fn(async () => {})
    useMusic.setState({
      tracks: [ROW], sourceSwitchTrackId: 'dead', sourceSwitchCandidates: [CANDIDATE], switchTrackSource,
    })
    mount()
    expect(bodyText()).toContain(t('music.source_switch_desc', { value0: 'Song A' }))
    expect(bodyText()).toContain(t('music.provider_source_kuwo'))
    expect(bodyText()).toContain('04:05')

    const use = buttonsByText(t('music.source_switch_use'))[0]
    expect(use).toBeTruthy()
    await act(async () => { use?.click() })
    expect(switchTrackSource).toHaveBeenCalledWith(CANDIDATE)
  })
})
