/**
 * A pinned card paints mind maps into markup it received as a string, so the set that markup was
 * rendered from has to be put on the card element before anything draws out of a block (P-01). The
 * drawer is replaced by a recorder here: the question this surface asks is not what a map looks like,
 * it is whether the fence body is readable from the element the block was mounted into.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { WikiLinkHoverCard } from './wiki-link-hover-card'
import { fenceBody } from '../../lib/markdown/fence-bodies'
import { useNotes } from '../../store/notes'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

/** What each block on the card could read out of the document when the card asked to draw it. */
const readAtDrawTime: string[] = []
let drawn: () => void = () => {}
const drew = new Promise<void>((resolve) => {
  drawn = resolve
})

vi.mock('../../lib/markdown/mindmap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/markdown/mindmap')>()
  return {
    ...actual,
    renderStaticMindmaps: async (root: HTMLElement) => {
      for (const node of root.querySelectorAll<HTMLElement>('[data-mindmap]')) {
        readAtDrawTime.push(fenceBody(node, 'mindmap', Number(node.dataset.mindmapIndex)))
      }
      drawn()
    },
  }
})

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

describe('pinned card mind maps', () => {
  it('hands the drawer a block whose fence body is still readable', async () => {
    useNotes.setState({
      notes: { a: summary('a', 'Note A') },
      contents: {},
      peekContent: async () => ['# Title', '', '```mindmap', '# Roadmap', '## Now', '```', ''].join('\n'),
    })
    const anchor = document.createElement('span')
    document.body.appendChild(anchor)
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(WikiLinkHoverCard, {
        card: { anchor, title: 'Note A', noteId: 'a', missing: false },
        path: ['a'],
        depth: 1,
        dark: false,
        pinned: true,
        pinnedInit: { id: 1, noteId: 'a', title: 'Note A', missing: false, x: 40, y: 80, width: 340, height: 0, z: 1 },
        onClose: () => {},
        onEnter: () => {},
        onLeave: () => {},
        onPin: () => {},
      }))
    })
    // A card that never reaches the drawer is this test failing, not this test passing quietly.
    await act(async () => {
      await Promise.race([drew, new Promise((resolve) => setTimeout(resolve, 3000))])
    })

    expect(readAtDrawTime).toEqual(['# Roadmap\n## Now\n'])
    act(() => root.unmount())
  })
})
