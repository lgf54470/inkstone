import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { t } from '../../lib/i18n'
import { renderElement } from '../../lib/test-render'
import { useMusic } from './music-store'
import { MusicHealthModal } from './music-health-modal'

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>()
  return {
    ...actual,
    api: { ...actual.api, music: { ...actual.api.music, checkReferenceHealth: vi.fn(async () => ({ results: [] })) } },
  }
})

const DEAD = { id: 'dead', title: 'Gone Song', artist: 'Ann', album: '', durationMs: 1000, source: 'provider', providerSource: 'netease', providerSongId: 'a1' } as never
const SLOW = { id: 'slow', title: 'Slow Song', artist: 'Ann', album: '', durationMs: 1000, source: 'external' } as never

let rendered: ReturnType<typeof renderElement> | null = null

function bodyText(): string {
  return document.body.textContent ?? ''
}

function buttonsByText(text: string): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].filter((button) => button.textContent?.trim() === text)
}

function mount(): void {
  rendered = renderElement(createElement(MusicHealthModal))
}

afterEach(() => {
  act(() => rendered?.unmount())
  rendered = null
  document.body.innerHTML = ''
  useMusic.setState({ healthOpen: false, healthScanning: false, healthFailed: false, healthResults: null, tracks: [] })
  vi.clearAllMocks()
})

// FB-F9: the panel lists what did not answer — never the healthy majority — and says which of the two
// kinds of trouble each row is in.
describe('the health panel states (FB-F9)', () => {
  it('draws nothing while the panel is closed', () => {
    mount()
    expect(document.body.textContent ?? '').toBe('')
  })

  it('says the library is healthy when every reference row answered', () => {
    useMusic.setState({ healthOpen: true, healthResults: [{ id: 'a', status: 'ok' }] })
    mount()
    expect(bodyText()).toContain(t('music.health_ok'))
  })

  it('names a scan that could not be finished and offers a retry', async () => {
    const openHealthScan = vi.fn(async () => {})
    useMusic.setState({ healthOpen: true, healthFailed: true, healthResults: null, openHealthScan })
    mount()
    expect(bodyText()).toContain(t('music.health_failed'))
    const retry = buttonsByText(t('music.retry'))[0]
    await act(async () => { retry?.click() })
    expect(openHealthScan).toHaveBeenCalled()
  })

  // FB-F9: what the group headings are for — the reader tells a link that is gone apart from a host
  // that was only slow, because only the first one is worth acting on.
  it('names every row that did not answer, grouped by what kind of trouble it is in', () => {
    useMusic.setState({
      healthOpen: true, tracks: [DEAD, SLOW],
      healthResults: [{ id: 'dead', status: 'dead' }, { id: 'slow', status: 'unreachable' }],
    })
    mount()
    expect(bodyText()).toContain(t('music.health_dead', { value0: 1 }))
    expect(bodyText()).toContain(t('music.health_unreachable', { value0: 1 }))
    expect(bodyText()).toContain('Gone Song')
  })
})

// FB-F9: the row actions — re-point a dead online row, or clear any dead row out of the library.
describe('acting on a dead link from the panel (FB-F9)', () => {
  it('hands the row to the repair or the trash when its own control is pressed', async () => {
    const repairDeadReference = vi.fn(async () => {})
    const trashDeadReferences = vi.fn(async () => {})
    useMusic.setState({
      healthOpen: true, tracks: [DEAD, SLOW], repairDeadReference, trashDeadReferences,
      healthResults: [{ id: 'dead', status: 'dead' }, { id: 'slow', status: 'unreachable' }],
    })
    mount()
    const repair = document.querySelector<HTMLButtonElement>(`[aria-label="${t('music.health_repair')}"]`)
    await act(async () => { repair?.click() })
    expect(repairDeadReference).toHaveBeenCalledWith('dead')

    const trashes = [...document.querySelectorAll<HTMLButtonElement>(`[aria-label="${t('music.health_trash')}"]`)]
    await act(async () => { trashes[0]?.click() })
    expect(trashDeadReferences).toHaveBeenCalledWith(['dead'])

    const trashAll = buttonsByText(t('music.health_trash_all', { value0: 1 }))[0]
    await act(async () => { trashAll?.click() })
    expect(trashDeadReferences).toHaveBeenLastCalledWith(['dead'])
  })

  // Re-pointing is an online-row action: an external or Alist row has no catalogue to ask, and a
  // control that cannot do anything must not look like it can.
  it('offers no re-point for a row that is not online, and no batch clear when nothing is dead', () => {
    useMusic.setState({ healthOpen: true, tracks: [SLOW], healthResults: [{ id: 'slow', status: 'unreachable' }] })
    mount()
    const repair = document.querySelector<HTMLButtonElement>(`[aria-label="${t('music.health_repair')}"]`) as HTMLButtonElement
    expect(repair.disabled).toBe(true)
    const trashAll = buttonsByText(t('music.health_trash_all', { value0: 0 }))[0]
    expect(trashAll.disabled).toBe(true)
  })
})
