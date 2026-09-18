import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { t } from '../../lib/i18n'
import { MusicImmersivePlayer } from './music-immersive-player'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

let root: Root | null = null

async function mountPlayer(onClose: () => void): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(MusicImmersivePlayer, { open: true, onClose }))
  })
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

describe('MusicImmersivePlayer close affordances', () => {
  it('names the dialog instead of leaving the generic overlay label', async () => {
    await mountPlayer(vi.fn())
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-label')).toBe(t('music.immersive'))
  })

  it('offers a visible close button that calls onClose', async () => {
    const onClose = vi.fn()
    await mountPlayer(onClose)
    const close = [...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === t('music.exit_immersive'))
    expect(close).toBeDefined()
    await act(async () => {
      close?.click()
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
