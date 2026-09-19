import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../lib/test-render'
import { useShareStore } from './share-store'
import { ShareHubModal } from './share-hub-modal'
import { ShareBatchBar } from './share-batch-bar'

vi.mock('../../lib/api', () => ({
  api: {
    share: {
      list: vi.fn(async () => ({ shares: [], globalStats: null })),
      folders: { list: vi.fn(async () => []) },
      tags: { list: vi.fn(async () => []) },
    },
  },
}))

function stubMatchMedia(wide: boolean, medium: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('1180') ? wide : medium,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return [...document.body.querySelectorAll('button')]
    .find((b) => b.textContent?.includes(text)) as HTMLButtonElement | undefined
}

function buttonByLabel(label: string): HTMLButtonElement | undefined {
  return [...document.body.querySelectorAll('button')]
    .find((b) => b.getAttribute('aria-label') === label) as HTMLButtonElement | undefined
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function mainDialogPanel(): HTMLElement {
  return document.body.querySelector('[role="dialog"][aria-modal="true"]') as HTMLElement
}

async function mountHub(): Promise<void> {
  mountRef.current = renderElement(createElement(ShareHubModal, { open: true, onClose: () => {} }))
  await flush()
}

const mountRef: { current: { unmount: () => void } | null } = { current: null }

beforeEach(() => {
  vi.clearAllMocks()
  useShareStore.setState({
    category: 'all',
    viewMode: 'table',
    shares: [],
    loading: false,
    error: false,
    truncated: false,
    selectedNoteIds: new Set<string>(),
    folders: [],
    tags: [],
  })
})

afterEach(() => {
  // A failed assertion must not leave a mounted portal behind: later tests query document.body.
  mountRef.current?.unmount()
  mountRef.current = null
})

describe('share hub narrow-screen sidebar', () => {
  it('hides the inline sidebar and offers a drawer trigger on mobile', async () => {
    stubMatchMedia(false, false)
    await mountHub()
    expect(buttonByText('share.category_all')).toBeUndefined()
    expect(buttonByLabel('share.open_sidebar')).toBeDefined()
  })

  it('opens the sidebar drawer and closes it once a category is picked', async () => {
    stubMatchMedia(false, false)
    await mountHub()
    const trigger = buttonByLabel('share.open_sidebar')!
    await act(async () => { trigger.click() })
    const starred = buttonByText('share.category_starred')
    expect(starred).toBeDefined()
    await act(async () => { starred!.click() })
    await flush()
    expect(useShareStore.getState().category).toBe('starred')
    expect(buttonByText('share.category_starred')).toBeUndefined()
  })

  it('renders the sidebar inline with no drawer trigger on desktop', async () => {
    stubMatchMedia(true, true)
    await mountHub()
    expect(buttonByText('share.category_all')).toBeDefined()
    expect(buttonByLabel('share.open_sidebar')).toBeUndefined()
  })
})

describe('share hub modal narrow-screen sizing', () => {
  it('drops the fixed height and max width when the hub opens on mobile', async () => {
    stubMatchMedia(false, false)
    await mountHub()
    const panel = mainDialogPanel()
    expect(panel.className).not.toContain('h-[84vh]')
    expect(panel.style.maxWidth).toBe('')
  })

  it('keeps the wide dialog sizing on desktop', async () => {
    stubMatchMedia(true, true)
    await mountHub()
    const panel = mainDialogPanel()
    expect(panel.className).toContain('h-[84vh]')
    expect(panel.style.maxWidth).toBe('1300px')
  })
})

describe('share batch bar wraps on narrow screens', () => {
  it('wraps its actions instead of forcing one nowrap line', () => {
    useShareStore.setState({ selectedNoteIds: new Set(['a', 'b', 'c']) })
    mountRef.current = renderElement(createElement(ShareBatchBar, {
      selectedCount: 3,
      onClearSelection: () => {},
    }))
    const enable = buttonByText('share.batch_enable')!
    const bar = enable.closest('.absolute') as HTMLElement
    expect(bar.className).toContain('flex-wrap')
    expect(bar.className).not.toContain('whitespace-nowrap')
  })
})
