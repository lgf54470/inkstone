import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../../test-render'
import { t } from '../../../i18n'
import { useUi } from '../../../../store/ui'
import type { BentoDoc, Slide } from '../types'
import { SlidesPrintSheet, printSheetCss, useSlidesPrint } from './slides-print'

const SETTLE_WAIT_MS = 400

function doc(slides: Slide[], size = { width: 1280, height: 720 }): BentoDoc {
  return {
    format: 'bento/slides',
    version: 1,
    title: 'Deck',
    size,
    theme: { background: '#ffffff', color: '#111111', accent: '#FF9E8A' },
    slides,
  }
}

function slide(id: string, label: string, over: Partial<Slide> = {}): Slide {
  return {
    id,
    elements: [
      { id: `${id}-text`, type: 'text', html: `<p>${label}</p>`, fontSize: 24, x: 0, y: 0, w: 400, h: 100 },
    ],
    ...over,
  }
}

let printCalls = 0
let mounted: ReturnType<typeof renderElement> | null = null

function mount(node: Parameters<typeof renderElement>[0]): ReturnType<typeof renderElement> {
  mounted = renderElement(node)
  return mounted
}

beforeEach(() => {
  useUi.setState({ toasts: [] })
  printCalls = 0
  vi.spyOn(window, 'print').mockImplementation(() => {
    printCalls += 1
  })
})

// A sheet left mounted would print into the next test's assertions, so every test starts clean.
afterEach(() => {
  mounted?.unmount()
  mounted = null
  vi.restoreAllMocks()
  document.querySelector('[data-bento-print]')?.remove()
})

/** The editor's own control, so the tests drive the export the way the print button does. */
function PrintHost({ deck }: { deck: BentoDoc }) {
  const { requestPrint, printSheet } = useSlidesPrint(deck)
  return createElement('div', null, createElement('button', { type: 'button', onClick: requestPrint }, 'print'), printSheet)
}

function clickPrint(): void {
  const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent === 'print')
  expect(button).toBeDefined()
  act(() => {
    button?.click()
  })
}

function sheet(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-bento-print]')
}

/** Everything in the sheet has to have settled before the dialog opens, so the wait is real time. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, SETTLE_WAIT_MS))
  })
}

describe('the paper a deck prints into', () => {
  it('makes the page box the deck own page size, which is what the page was drawn for', () => {
    expect(printSheetCss({ width: 1280, height: 720 })).toBe(
      '@page { size: 1280px 720px; margin: 0; }\n.bento-print-page { width: 1280px; height: 720px; }',
    )
  })

  it('rounds a fractional page size, because a page box is a whole number of pixels', () => {
    expect(printSheetCss({ width: 1280.4, height: 719.6 })).toContain('@page { size: 1280px 720px; margin: 0; }')
  })
})

describe('the pages a deck exports', () => {
  it('lays out one page per page the show walks, in order', () => {
    mount(
      createElement(SlidesPrintSheet, {
        doc: doc([slide('one', 'first'), slide('two', 'second')]),
        onDone: () => {},
      }),
    )
    const pages = document.querySelectorAll('.bento-print-page')
    expect(pages).toHaveLength(2)
    expect(pages[0]?.textContent).toContain('first')
    expect(pages[1]?.textContent).toContain('second')
  })

  it('leaves a hidden page off the paper', () => {
    mount(
      createElement(SlidesPrintSheet, {
        doc: doc([slide('one', 'first'), slide('two', 'second', { hidden: true }), slide('three', 'third')]),
        onDone: () => {},
      }),
    )
    const printed = [...document.querySelectorAll('.bento-print-page')].map((page) => page.textContent)
    expect(printed).toHaveLength(2)
    expect(printed[0]).toContain('first')
    expect(printed[1]).toContain('third')
    expect(printed.join(' ')).not.toContain('second')
  })

  it('lays the pages out off-screen and out of the tab order until the reader prints them', () => {
    mount(createElement(SlidesPrintSheet, { doc: doc([slide('one', 'first')]), onDone: () => {} }))
    const node = sheet()
    expect(node?.className).toContain('bento-print-sheet')
    expect(node?.getAttribute('aria-hidden')).toBe('true')
    expect(node?.hasAttribute('inert')).toBe(true)
  })
})

describe('handing the sheet to the browser', () => {
  it('waits for the sheet to settle, then hands it to the browser, and finishes on afterprint', async () => {
    const onDone = vi.fn()
    mount(createElement(SlidesPrintSheet, { doc: doc([slide('one', 'first')]), onDone }))
    expect(printCalls).toBe(0)

    await settle()
    expect(printCalls).toBe(1)
    expect(onDone).not.toHaveBeenCalled()

    act(() => {
      window.dispatchEvent(new Event('afterprint'))
    })
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})

describe('the editor control behind the export', () => {
  it('does not print a deck whose every page is hidden, and says so', () => {
    mount(createElement(PrintHost, { deck: doc([slide('one', 'first', { hidden: true })]) }))
    clickPrint()
    expect(sheet()).toBeNull()
    expect(printCalls).toBe(0)
    expect(useUi.getState().toasts.map((toast) => toast.title)).toEqual([t('slides.print_empty')])
  })

  it('opens the sheet from the editor control, honouring the deck page size', () => {
    mount(createElement(PrintHost, { deck: doc([slide('one', 'first')], { width: 1600, height: 900 }) }))
    expect(sheet()).toBeNull()

    clickPrint()
    const node = sheet()
    expect(node).not.toBeNull()
    expect(node?.querySelector('style')?.textContent).toContain('@page { size: 1600px 900px; margin: 0; }')
  })
})
