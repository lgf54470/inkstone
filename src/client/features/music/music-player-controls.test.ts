import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { t } from '../../lib/i18n'
import { MusicPlayerControls } from './music-player-controls'
import { useMusic } from './music-store'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

let root: Root | null = null

async function mountControls(): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(MusicPlayerControls, { queueOpen: false, onToggleQueue: () => {} }))
  })
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useMusic.setState({ loopRange: null })
})

// The loop markers used to live only in the immersive player, so a range marked there
// was invisible and uncleanable everywhere else; the hub footer is the always-open surface.
describe('the hub footer loop entry', () => {
  it('offers the A-B markers and clear next to the transport', async () => {
    await mountControls()
    expect(document.querySelector(`button[aria-label="${t('music.loop_start')}"]`)).not.toBeNull()
    expect(document.querySelector(`button[aria-label="${t('music.loop_end')}"]`)).not.toBeNull()
  })

  it('shows the region on its seek bar only for the track it was marked on', async () => {
    useMusic.setState({ queue: ['x'], currentIndex: 0, loopRange: { trackId: 'x', startMs: 1000, endMs: 4000 } })
    await mountControls()
    expect(document.querySelector('[data-loop-region]')).not.toBeNull()
    act(() => useMusic.setState({ loopRange: { trackId: 'other', startMs: 1000, endMs: 4000 } }))
    expect(document.querySelector('[data-loop-region]')).toBeNull()
  })
})
