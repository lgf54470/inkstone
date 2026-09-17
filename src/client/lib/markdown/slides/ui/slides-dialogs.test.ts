import { act, createElement, useState } from 'react'
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

/**
 * The same deck hosted the way the app hosts it: the committed document is handed back in as
 * `initialData`, which is what tells the history the change came from this surface rather than
 * from another writer, and what makes the editor keep painting what was just committed.
 */
function LiveDeck() {
  const [data, setData] = useState<BentoDoc>(() => parseSlidesOutline(source))
  return createElement(SlidesRoot, { initialData: data, isFullscreen: true, onUpdateData: setData })
}

function mountLiveDeck() {
  mounted = renderElement(createElement(LiveDeck))
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

  it('says a morph transition is not drawn yet, at the moment it is chosen', () => {
    mountLiveDeck()
    const select = [...document.querySelectorAll<HTMLSelectElement>('select')].find((candidate) =>
      [...candidate.options].some((option) => option.value === 'morph'),
    )
    expect(select, 'the inspector offers the page transition').toBeDefined()
    expect(document.querySelector('[data-slide-morph-pending]')).toBeNull()

    // A select's own value assignment updates React's tracker without firing its change, so the
    // value is written the way the browser writes it and the event is dispatched after.
    const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
    act(() => {
      if (!select || !setValue) return
      setValue.call(select, 'morph')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(document.querySelector('[data-slide-morph-pending]')?.textContent).toBe(
      t('slides.transition_morph_pending'),
    )
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
