import { act, createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderElement } from '../../../test-render'
import { t } from '../../../i18n'
import { parseSlidesOutline } from '../outline'
import type { BentoDoc } from '../types'
import { SlidesRoot } from './slides-root'

const source = ['# First slide', '', 'Body text'].join('\n')

let mounted: ReturnType<typeof renderElement> | null = null

function mountDeck() {
  const initialData: BentoDoc = parseSlidesOutline(source)
  const committed: BentoDoc[] = []
  mounted = renderElement(
    createElement(SlidesRoot, {
      initialData,
      isFullscreen: true,
      onUpdateData: (next: BentoDoc) => committed.push(next),
    }),
  )
  return { committed }
}

function dialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="dialog"]')
}

function clickToolbarButton(title: string): void {
  const button = document.querySelector<HTMLButtonElement>(`button[title="${title}"]`)
  expect(button, `toolbar button "${title}" should exist`).not.toBeNull()
  act(() => {
    button?.click()
  })
}

afterEach(() => {
  mounted?.unmount()
  mounted = null
})

describe('slides deck dialogs', () => {
  it('opens the settings panel from the gear and applies a canvas size preset', () => {
    const { committed } = mountDeck()
    expect(dialog()).toBeNull()

    clickToolbarButton(t('slides.tool_settings'))
    const panel = dialog()
    expect(panel?.textContent).toContain(t('slides.settings_title'))

    const preset = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === t('slides.settings_size_16_10'),
    )
    expect(preset).toBeDefined()
    act(() => {
      preset?.click()
    })
    expect(committed.at(-1)?.size).toEqual({ width: 1280, height: 800 })
  })

  it('opens the help panel from the question mark and lists the presenter keys', () => {
    mountDeck()

    clickToolbarButton(t('slides.tool_help'))
    const panel = dialog()
    expect(panel?.textContent).toContain(t('slides.help_title'))
    expect(panel?.textContent).toContain(t('slides.help_present_next'))
    expect(panel?.textContent).toContain(t('slides.speaker_notes'))
  })
})
