import { beforeAll, describe, expect, it } from 'vitest'
import { act, createElement } from 'react'
import type { ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { WikiLinkHoverCard, type WikiLinkHoverCardState } from './wiki-link-hover-card'
import { applyHighlightToHtml, buildHighlightTerms } from './card-content'
import { pushLinkHoverTarget, subscribeLinkHoverTarget } from './link-signal'
import { useLinkHover } from './link-hover'
import { useNotes } from '../../store/notes'
import { loadPersisted, usePinnedWindows } from '../../store/pinned-windows'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  if (typeof (globalThis as Record<string, unknown>).ResizeObserver === 'undefined') {
    ;(globalThis as Record<string, unknown>).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})

const WIKILINK_HTML = '<a class="wikilink" data-wikilink="b64.Qm90ZSBC" href="#">[[Note B]]</a>'
const wikilinkHtmlObject = { __html: WIKILINK_HTML }

function summary(id: string, title: string) {
  return {
    id,
    title,
    excerpt: '',
    folderId: null,
    tags: [],
    isPinned: false,
    isStarred: false,
    isArchived: false,
    wordCount: 0,
    charCount: 0,
    rev: 1,
    position: 0,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
  }
}

function seedNotes(entries: Array<[string, string]>, peek: (id: string) => string): void {
  useNotes.setState({
    notes: Object.fromEntries(entries.map(([id, title]) => [id, summary(id, title)])),
    contents: {},
    peekContent: async (id: string) => peek(id),
  })
}

async function mountCard(state: WikiLinkHoverCardState, props: Partial<ComponentProps<typeof WikiLinkHoverCard>> = {}): Promise<{ root: Root; container: HTMLDivElement }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(WikiLinkHoverCard, {
      card: state,
      path: [state.noteId ?? ''].filter(Boolean),
      depth: 1,
      dark: false,
      onClose: () => {},
      onEnter: () => {},
      onLeave: () => {},
      onPin: () => {},
      ...props,
    }))
  })
  return { root, container }
}

function findButtonByLabel(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find(
    (button) => button.getAttribute('aria-label') === label,
  )
}

function renderHoverHarness(resolve: (link: HTMLElement) => WikiLinkHoverCardState | null, delay: number) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const refs: { host: HTMLDivElement | null; machine: ReturnType<typeof useLinkHover> | null } = { host: null, machine: null }
  const Harness = () => {
    const machine = useLinkHover({ resolve, delay, enabled: true })
    refs.machine = machine
    return createElement(
      'div',
      null,
      createElement('div', {
        ref: (node: HTMLDivElement | null) => { refs.host = node },
        onMouseMove: machine.handleMouseMove,
        dangerouslySetInnerHTML: wikilinkHtmlObject,
      }),
      machine.card
        ? createElement(WikiLinkHoverCard, {
            card: machine.card,
            path: machine.card.noteId ? [machine.card.noteId] : [],
            depth: 1,
            dark: false,
            onClose: machine.hideNow,
            onEnter: machine.clearPendingHide,
            onLeave: machine.armHide,
            onPin: () => {},
          })
        : null,
    )
  }
  return { root, refs, Harness }
}

describe('hover machine opens a card from mousemove', () => {
  it('opens a card from a mousemove inside the host', async () => {
    seedNotes([['a', 'Note A'], ['b', 'Note B']], (id) => (id === 'a' ? 'Content of A with [[Note B]] inside.' : 'Content of B'))

    const { root, refs, Harness } = renderHoverHarness((link) => {
      const target = (link.textContent ?? '').replace(/\[\[|\]\]/g, '')
      return { anchor: link, title: target, noteId: 'b', missing: false }
    }, 50)
    await act(async () => root.render(createElement(Harness)))
    const link = refs.host!.querySelector<HTMLElement>('[data-wikilink]')!
    await act(async () => {
      link.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 120))
    })
    expect(refs.machine!.card).not.toBeNull()
    expect(document.querySelectorAll('[role="tooltip"]').length).toBeGreaterThan(0)
    act(() => root.unmount())
  })
})

describe('hover machine nested and immediate cards', () => {
  it('opens a nested card when hovering a wiki link inside the card body', async () => {
    seedNotes([['a', 'Note A'], ['b', 'Note B']], (id) => (id === 'a' ? 'Content of A with [[Note B]] inside.' : 'Content of B'))

    const anchor = document.createElement('span')
    document.body.appendChild(anchor)
    const state: WikiLinkHoverCardState = { anchor, title: 'Note A', noteId: 'a', missing: false }

    const { root } = await mountCard(state)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
    })

    const outer = document.querySelector('[role="tooltip"]')
    expect(outer).not.toBeNull()
    const nestedLink = outer?.querySelector<HTMLElement>('.wiki-hover-body a[data-wikilink]')
    expect(nestedLink?.textContent).toBe('Note B')

    await act(async () => {
      nestedLink!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 420))
    })

    const cards = [...document.querySelectorAll('[role="tooltip"]')]
    expect(cards.length).toBe(2)
    act(() => root.unmount())
  })

  it('opens the card immediately when proposing with the immediate option', async () => {
    seedNotes([['a', 'Note A']], () => 'Content of A')

    const { root, refs, Harness } = renderHoverHarness(
      (link) => ({ anchor: link, title: 'Note A', noteId: 'a', missing: false }),
      10000,
    )
    await act(async () => root.render(createElement(Harness)))
    const link = refs.host!.querySelector<HTMLElement>('[data-wikilink]')!
    expect(refs.machine!.card).toBeNull()
    await act(async () => {
      refs.machine!.propose(link, { immediate: true })
    })
    expect(refs.machine!.card).not.toBeNull()
    act(() => root.unmount())
  })
})

describe('hover machine hide races', () => {
  it('keeps the card when the same link is re-proposed while a hide is pending', async () => {
    seedNotes([['a', 'Note A']], () => 'Content of A')

    const { root, refs, Harness } = renderHoverHarness(
      (anchor) => ({ anchor, title: 'Note A', noteId: 'a', missing: false }),
      50,
    )
    await act(async () => root.render(createElement(Harness)))
    const link = refs.host!.querySelector<HTMLElement>('[data-wikilink]')!
    await act(async () => {
      refs.machine!.propose(link, { immediate: true })
    })
    expect(refs.machine!.card).not.toBeNull()
    await act(async () => {
      refs.machine!.armHide()
      refs.machine!.propose(link, { immediate: true })
      await new Promise((resolve) => setTimeout(resolve, 420))
    })
    expect(refs.machine!.card).not.toBeNull()
    act(() => root.unmount())
  })

  it('promotes the card to a pinned window when the pin button is clicked', async () => {
    seedNotes([['a', 'Note A']], () => 'Content of A')

    const anchor = document.createElement('span')
    document.body.appendChild(anchor)
    const state: WikiLinkHoverCardState = { anchor, title: 'Note A', noteId: 'a', missing: false }
    let pinnedCard: WikiLinkHoverCardState | null = null

    const { root } = await mountCard(state, { onPin: (card) => { pinnedCard = card } })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
    })

    const pinButton = findButtonByLabel('preview.pin_card')
    expect(pinButton).not.toBeNull()
    await act(async () => {
      pinButton!.click()
    })
    expect(pinnedCard).toEqual(state)
    act(() => root.unmount())
  })
})

describe('pinned card close and headline highlight', () => {
  it('closes a pinned window via its close button', async () => {
    seedNotes([['a', 'Note A']], () => 'Content of A')

    const anchor = document.createElement('span')
    document.body.appendChild(anchor)
    const state: WikiLinkHoverCardState = { anchor, title: 'Note A', noteId: 'a', missing: false }
    let closed = false

    const { root } = await mountCard(state, {
      pinned: true,
      pinnedInit: { id: 1, noteId: 'a', title: 'Note A', missing: false, x: 40, y: 80, width: 340, height: 0, z: 1 },
      onClose: () => { closed = true },
    })

    const closeButton = findButtonByLabel('common.close')
    await act(async () => {
      closeButton!.click()
    })
    expect(closed).toBe(true)
    act(() => root.unmount())
  })

  it('highlights headline matches inside the rendered card body', async () => {
    const terms = buildHighlightTerms('Welcome to Inkstone')
    expect(terms).toContain('Welcome to Inkstone')
    expect(terms).toContain('Welcome')
    expect(terms).toContain('Inkstone')

    const html = '<div><p>This is a Welcome to Inkstone tour.</p><p>Another Inkstone paragraph</p></div>'
    const highlighted = applyHighlightToHtml(html, terms)
    const marks = [...new DOMParser().parseFromString(highlighted, 'text/html').querySelectorAll('mark')]
    expect(marks.length).toBeGreaterThanOrEqual(2)
    expect(highlighted).toContain('class="card-hl"')
  })

  it('does not highlight inside code blocks', () => {
    const terms = buildHighlightTerms('MyNote')
    const html = '<div><p>MyNote shown here</p><pre><code>const MyNote = 1; MyNote++</code></pre></div>'
    const highlighted = applyHighlightToHtml(html, terms)
    const marks = [...new DOMParser().parseFromString(highlighted, 'text/html').querySelectorAll('mark')]
    expect(marks.length).toBe(1)
    expect(highlighted).toContain('<code>const MyNote = 1; MyNote++</code>')
  })
})

describe('hover target signal', () => {
  it('broadcasts and replays the current hover target', () => {
    const seen: Array<string | null> = []
    const unsubscribe = subscribeLinkHoverTarget((noteId) => seen.push(noteId))
    const release = pushLinkHoverTarget('a')
    const release2 = pushLinkHoverTarget('b')
    expect(seen).toEqual([null, 'a', 'b'])
    release2()
    expect(seen).toEqual([null, 'a', 'b', 'a'])
    release()
    expect(seen).toEqual([null, 'a', 'b', 'a', null])
    unsubscribe()
  })

  it('publishes the hover target to graph subscribers while a hover card is mounted', async () => {
    seedNotes([['a', 'Note A']], () => 'Content of A')
    const anchor = document.createElement('span')
    document.body.appendChild(anchor)
    const state: WikiLinkHoverCardState = { anchor, title: 'Note A', noteId: 'a', missing: false }
    const seen: Array<string | null> = []
    const unsubscribe = subscribeLinkHoverTarget((noteId) => seen.push(noteId))

    const { root } = await mountCard(state)
    expect(seen.at(-1)).toBe('a')
    act(() => root.unmount())
    expect(seen.at(-1)).toBeNull()
    unsubscribe()
  })
})

describe('pinned windows store behavior', () => {
  it('pins, restacks, moves and closes windows through the persisted store', () => {
    usePinnedWindows.setState({ items: [], seq: 1 })
    const anchor = document.createElement('span')
    const card: WikiLinkHoverCardState = { anchor, title: 'Note A', noteId: 'a', missing: false, headline: 'A' }
    const rect = { left: 10, top: 20, width: 300, height: 0, right: 310, bottom: 20 } as DOMRect

    usePinnedWindows.getState().pin(card, rect)
    usePinnedWindows.getState().pin({ ...card, title: 'Note B', noteId: 'b' }, { ...rect, left: 50 } as DOMRect)
    let items = usePinnedWindows.getState().items
    expect(items).toHaveLength(2)
    expect(items[1]!.z).toBeGreaterThan(items[0]!.z)

    usePinnedWindows.getState().bringToFront(items[0]!.id)
    items = usePinnedWindows.getState().items
    expect(items[0]!.z).toBeGreaterThan(items[1]!.z)

    usePinnedWindows.getState().updateGeometry(items[0]!.id, { x: 111, y: 222, width: 400, height: 300 })
    items = usePinnedWindows.getState().items
    expect(items[0]!.x).toBe(111)
    expect(items[0]!.height).toBe(300)

    usePinnedWindows.getState().closeFront()
    items = usePinnedWindows.getState().items
    expect(items).toHaveLength(1)
    expect(items[0]!.title).toBe('Note B')

    usePinnedWindows.getState().closeAll()
    expect(usePinnedWindows.getState().items).toHaveLength(0)
  })

  it('focuses and flashes a pinned window by its note id', () => {
    usePinnedWindows.setState({ items: [], seq: 1, flashId: null })
    const anchor = document.createElement('span')
    const rect = { left: 10, top: 20, width: 300, height: 0, right: 310, bottom: 20 } as DOMRect
    const card: WikiLinkHoverCardState = { anchor, title: 'Note A', noteId: 'a', missing: false }
    usePinnedWindows.getState().pin(card, rect)
    usePinnedWindows.getState().pin({ ...card, title: 'Note B', noteId: 'b' }, { ...rect, left: 50 } as DOMRect)

    expect(usePinnedWindows.getState().focusPinnedByNote('missing')).toBe(false)
    expect(usePinnedWindows.getState().focusPinnedByNote('a')).toBe(true)
    const items = usePinnedWindows.getState().items
    expect(items[0]!.z).toBeGreaterThan(items[1]!.z)
    expect(usePinnedWindows.getState().flashId).toBe(items[0]!.id)
    usePinnedWindows.getState().closeAll()
  })
})

describe('pinned windows persistence', () => {
  it('restores pinned windows from local storage', () => {
    localStorage.setItem('inkstone.pinned-windows', JSON.stringify({
      seq: 7,
      items: [
        { id: 3, noteId: 'a', title: 'Note A', missing: false, x: 10, y: 20, width: 340, height: 200, z: 2 },
        { id: 'bad', noteId: 5, title: 9, missing: 'x', x: 'nope', y: 0, width: 0, height: 0, z: 0 },
        { id: 4, noteId: null, title: 'Missing note', missing: true, x: 5, y: 5, width: 200, height: 100, z: 1 },
      ],
    }))
    const restored = loadPersisted()
    expect(restored.items).toHaveLength(2)
    expect(restored.items[0]).toMatchObject({ id: 3, noteId: 'a', title: 'Note A', z: 2 })
    expect(restored.items[1]).toMatchObject({ id: 4, noteId: null, missing: true })
    expect(restored.seq).toBe(7)
  })
})