import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { t } from '../../lib/i18n'
import { MusicSleepStatus } from './music-transport-widgets'
import { useMusic } from './music-store'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

let root: Root | null = null

async function mountStatus(): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(MusicSleepStatus))
  })
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useMusic.setState({ sleepEndsAt: null, sleepAfterCurrentTrack: false })
})

describe('sleep countdown semantics (UI-17)', () => {
  it('counts down as a timer, not a live region re-announced every second', async () => {
    useMusic.setState({ sleepEndsAt: Date.now() + 10 * 60_000 })
    await mountStatus()
    const countdown = document.querySelector('[role="timer"]')
    expect(countdown).not.toBeNull()
    expect(countdown?.getAttribute('aria-live')).toBe('off')
    expect(countdown?.textContent?.trim()).not.toBe('')
  })

  it('renders nothing while no sleep timer is armed', async () => {
    await mountStatus()
    expect(document.querySelector('[role="timer"], [role="status"]')).toBeNull()
  })

  it('states the after-current stop once instead of counting', async () => {
    useMusic.setState({ sleepAfterCurrentTrack: true })
    await mountStatus()
    const status = document.querySelector('[role="status"]')
    expect(status?.textContent).toBe(t('music.sleep_after_current'))
  })
})
