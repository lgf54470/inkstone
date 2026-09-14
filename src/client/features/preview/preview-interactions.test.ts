import { describe, expect, it, vi } from 'vitest'
import type { MouseEvent as ReactMouseEvent, RefObject } from 'react'
import { renderMarkdown } from '../../lib/markdown/renderer'
import { createPreviewClickHandler } from './preview-interactions'

function ref<T>(current: T): RefObject<T> {
  return { current }
}

/**
 * The click handler only reads `event.target` before it decides the mind map
 * branch is its own, so the rest of the surface is stubbed.
 */
function clickOn(target: EventTarget): ReactMouseEvent {
  return { target } as unknown as ReactMouseEvent
}

function mountHandler(openMindmapFullscreen: (node: HTMLElement) => void) {
  const host = document.createElement('div')
  host.className = 'ink-prose'
  host.innerHTML = renderMarkdown('```mindmap\n- Root\n  - Child\n```').html
  // The library builds its toolbar once the block is mounted; the markup above
  // stops at the placeholder, so the canvas is added here with the toolbar the
  // real instance would carry.
  const placeholder = host.querySelector<HTMLElement>('[data-mindmap-placeholder]')!
  const canvas = document.createElement('div')
  canvas.className = 'mindmap-canvas'
  canvas.dataset.mindmapCanvas = '1'
  canvas.innerHTML = '<div class="mind-elixir-toolbar rb"><span id="fullscreen"></span><span id="toCenter"></span></div>'
  placeholder.replaceChildren(canvas)
  document.body.append(host)

  const noop = () => {}
  const handler = createPreviewClickHandler({
    content: '',
    sourceNoteId: 'note-1',
    hostRef: ref<HTMLDivElement | null>(host),
    scrollerRef: ref<HTMLDivElement | null>(null),
    committedSourceRef: ref(''),
    copyResetTimersRef: ref(new Map<HTMLElement, number>()),
    wikiNavigationRef: ref(0),
    wikiScrollCleanupRef: ref<() => void>(noop),
    hideHover: noop,
    startMermaidRender: noop,
    openMindmapFullscreen,
    api: {
      setLightbox: noop,
      setPreviewFile: noop,
      openNote: async () => {},
      createNote: async () => null,
      openView: noop,
      editContent: noop,
      // The toast store returns the id it assigned; the branch under test never posts one.
      toast: () => '',
    },
  })
  return { host, handler, block: host.querySelector<HTMLElement>('[data-mindmap]')!, canvas }
}

describe('preview clicks on a mind map block', () => {
  it('opens the full screen overlay from the library’s own toolbar button', async () => {
    const open = vi.fn()
    const { host, handler, block, canvas } = mountHandler(open)
    try {
      const button = canvas.querySelector<HTMLElement>('#fullscreen')!
      await handler(clickOn(button))
      expect(open).toHaveBeenCalledTimes(1)
      expect(open).toHaveBeenCalledWith(block)
    }
    finally {
      host.remove()
    }
  })

  it('treats a click on the rest of the canvas as the library’s', async () => {
    const open = vi.fn()
    const { host, handler, canvas } = mountHandler(open)
    try {
      await handler(clickOn(canvas))
      expect(open).not.toHaveBeenCalled()
    }
    finally {
      host.remove()
    }
  })
})
