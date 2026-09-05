import { beforeAll, describe, expect, it } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
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

describe('wiki link hover machine', () => {
  it('opens a card from a mousemove inside the host', async () => {
    useNotes.setState({
      notes: { a: summary('a', 'Note A'), b: summary('b', 'Note B') },
      contents: {},
      peekContent: async (id: string) => (id === 'a' ? 'Content of A with [[Note B]] inside.' : 'Content of B'),
    })

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    let host: HTMLDivElement | null = null
    let machineRef: ReturnType<typeof useLinkHover> | null = null

    const Harness = () => {
      const machine = useLinkHover({
        resolve: (link) => {
          const target = (link.textContent ?? '').replace(/\[\[|\]\]/g, '')
          return { anchor: link, title: target, noteId: 'b', missing: false }
        },
        delay: 50,
        enabled: true,
      })
      host = document.createElement('div')
      machineRef = machine
      return createElement(
        'div',
        null,
        createElement('div', {
          ref: (node: HTMLDivElement | null) => { host = node },
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

    await act(async () => root.render(createElement(Harness)))
    const link = host!.querySelector<HTMLElement>('[data-wikilink]')!
    await act(async () => {
      link.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 120))
    })
    expect(machineRef!.card).not.toBeNull()
    expect(document.querySelectorAll('[role="tooltip"]').length).toBeGreaterThan(0)
    act(() => root.unmount())
  })

  it('opens a nested card when hovering a wiki link inside the card body', async () => {
    useNotes.setState({
      notes: { a: summary('a', 'Note A'), b: summary('b', 'Note B') },
      contents: {},
      peekContent: async (id: string) => (id === 'a' ? 'Content of A with [[Note B]] inside.' : 'Content of B'),
    })

    const anchor = document.createElement('span')
    document.body.appendChild(anchor)
    const state: WikiLinkHoverCardState = { anchor, title: 'Note A', noteId: 'a', missing: false }

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(WikiLinkHoverCard, {
        card: state,
        path: ['a'],
        depth: 1,
        dark: false,
        onClose: () => {},
        onEnter: () => {},
        onLeave: () => {},
        onPin: () => {},
      }))
    })
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

  it('keeps the card when the same link is re-proposed while a hide is pending', async () => {
    useNotes.setState({
      notes: { a: summary('a', 'Note A') },
      contents: {},
      peekContent: async () => 'Content of A',
    })

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const link = document.createElement('a')
    container.appendChild(link)
    let machineRef: ReturnType<typeof useLinkHover> | null = null

    const Harness = () => {
      const machine = useLinkHover({
        resolve: (anchor) => ({ anchor, title: 'Note A', noteId: 'a', missing: false }),
        delay: 50,
        enabled: true,
      })
      machineRef = machine
      return null
    }

    await act(async () => root.render(createElement(Harness)))
    await act(async () => {
      machineRef!.propose(link, { immediate: true })
    })
    expect(machineRef!.card).not.toBeNull()
    await act(async () => {
      machineRef!.armHide()
      machineRef!.propose(link, { immediate: true })
      await new Promise((resolve) => setTimeout(resolve, 420))
    })
    expect(machineRef!.card).not.toBeNull()
    act(() => root.unmount())
  })

  it('opens the card immediately when proposing with the immediate option', async () => {
    useNotes.setState({
      notes: { a: summary('a', 'Note A') },
      contents: {},
      peekContent: async () => 'Content of A',
    })

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    let machineRef: ReturnType<typeof useLinkHover> | null = null

    const Harness = () => {
      const machine = useLinkHover({
        resolve: (link) => ({ anchor: link, title: 'Note A', noteId: 'a', missing: false }),
        delay: 10000,
        enabled: true,
      })
      machineRef = machine
      return createElement('div', {
        onMouseMove: machine.handleMouseMove,
        dangerouslySetInnerHTML: wikilinkHtmlObject,
      })
    }

    await act(async () => root.render(createElement(Harness)))
    const link = container.querySelector<HTMLElement>('[data-wikilink]')!
    expect(machineRef!.card).toBeNull()
    await act(async () => {
      machineRef!.propose(link, { immediate: true })
    })
    expect(machineRef!.card).not.toBeNull()
    act(() => root.unmount())
  })

  it('promotes the card to a pinned window when the pin button is clicked', async () => {
    useNotes.setState({
      notes: { a: summary('a', 'Note A') },
      contents: {},
      peekContent: async () => 'Content of A',
    })

    const anchor = document.createElement('span')
    document.body.appendChild(anchor)
    const state: WikiLinkHoverCardState = { anchor, title: 'Note A', noteId: 'a', missing: false }
    let pinnedCard: WikiLinkHoverCardState | null = null

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(createElement(WikiLinkHoverCard, {
        card: state,
        path: ['a'],
        depth: 1,
        dark: false,
        onClose: () => {},
        onEnter: () => {},
        onLeave: () => {},
        onPin: (card) => { pinnedCard = card },
      }))
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
    })

    const pinButton = [...document.querySelectorAll('button')].find(
      (button) => button.getAttribute('aria-label') === 'preview.pin_card',
    )
    expect(pinButton).not.toBeNull()
    await act(async () => {
      pinButton!.click()
    })
    expect(pinnedCard).toEqual(state)
    act(() => root.unmount())
  })

  it('closes a pinned window via its close button', async () => {
    useNotes.setState({
      notes: { a: summary('a', 'Note A') },
      contents: {},
      peekContent: async () => 'Content of A',
    })

    const anchor = document.createElement('span')
    document.body.appendChild(anchor)
    const state: WikiLinkHoverCardState = { anchor, title: 'Note A', noteId: 'a', missing: false }
    let closed = false

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(createElement(WikiLinkHoverCard, {
        card: state,
        path: ['a'],
        depth: 1,
        dark: false,
        pinned: true,
        pinnedInit: { id: 1, noteId: 'a', title: 'Note A', missing: false, x: 40, y: 80, width: 340, height: 0, z: 1 },
        onClose: () => { closed = true },
        onEnter: () => {},
        onLeave: () => {},
        onPin: () => {},
      }))
    })

    const closeButton = [...document.querySelectorAll('button')].find(
      (button) => button.getAttribute('aria-label') === 'common.close',
    )
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
    useNotes.setState({
      notes: { a: summary('a', 'Note A') },
      contents: {},
      peekContent: async () => 'Content of A',
    })
    const anchor = document.createElement('span')
    document.body.appendChild(anchor)
    const state: WikiLinkHoverCardState = { anchor, title: 'Note A', noteId: 'a', missing: false }
    const seen: Array<string | null> = []
    const unsubscribe = subscribeLinkHoverTarget((noteId) => seen.push(noteId))

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(WikiLinkHoverCard, {
        card: state,
        path: ['a'],
        depth: 1,
        dark: false,
        onClose: () => {},
        onEnter: () => {},
        onLeave: () => {},
        onPin: () => {},
      }))
    })
    expect(seen.at(-1)).toBe('a')
    act(() => root.unmount())
    expect(seen.at(-1)).toBeNull()
    unsubscribe()
  })

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