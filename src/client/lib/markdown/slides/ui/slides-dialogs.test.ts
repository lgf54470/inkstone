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

  it('adds a slide from the layout the reader picks', () => {
    const { committed } = mountDeck()

    const add = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === t('slides.add_slide'),
    )
    expect(add, 'the rail offers a way to add a slide').toBeDefined()
    act(() => {
      add?.click()
    })
    expect(dialog()?.textContent).toContain(t('slides.choose_layout'))

    const option = document.querySelector<HTMLButtonElement>(
      '[data-layout-option="layout-three-cards"]',
    )
    expect(option).not.toBeNull()
    act(() => {
      option?.click()
    })

    const deck = committed.at(-1)!
    expect(deck.slides).toHaveLength(2)
    const added = deck.slides[1]!
    expect(added.title).toBe(t('slides.layout_three_cards'))
    // Three cards, each a backdrop plus its text, behind the title.
    expect(added.elements).toHaveLength(7)
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
