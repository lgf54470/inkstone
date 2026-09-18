/**
 * A board on a surface that cannot run one: an exported document, a shared note, a slide, the
 * editor's live preview. Those channels used to leave the block at "Loading kanban…" with
 * `aria-busy` up forever — the fence had been rendered, but nothing would ever mount it. The
 * contract asserted here is the one every rich block in this repo already keeps: a still
 * rendering when the surface declares one, the source when it declares nothing, and never a
 * promise that is never kept.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { initI18n, t } from '../../i18n'
import { installTestGlobals } from '../../test-render'
import { renderMarkdown } from '../renderer'
import { renderStaticKanbans } from './static'
import { showKanbanSourceAll } from './view'

beforeAll(async () => {
  installTestGlobals()
  await initI18n()
})

afterEach(() => {
  document.body.replaceChildren()
})

function boardBody(data: unknown): string {
  return JSON.stringify(data)
}

function kanbanHost(body: string): HTMLElement {
  const host = document.createElement('div')
  host.className = 'ink-prose'
  host.innerHTML = renderMarkdown(['```kanban', body, '```'].join('\n')).html
  document.body.append(host)
  return host
}

function boardNode(body: string): HTMLElement {
  const host = kanbanHost(body)
  const node = host.querySelector<HTMLElement>('[data-kanban]')
  if (!node) throw new Error('the renderer emitted no kanban block')
  return node
}

const BOARD = {
  title: 'Release plan',
  activeViewId: 'view-board',
  columns: [
    { id: 'title', name: 'Title', type: 'title' },
    {
      id: 'status',
      name: 'Status',
      type: 'select',
      options: [
        { id: 'todo', label: 'To Do', color: 'gray' },
        { id: 'doing', label: 'In Progress', color: 'blue' },
      ],
    },
  ],
  views: [{ id: 'view-board', name: 'Board', type: 'board', groupBy: 'status' }],
  items: [
    { id: 'i1', title: 'Write the changelog', properties: { status: 'todo' } },
    { id: 'i2', title: 'Tag the build', properties: { status: 'doing' } },
    { id: 'i3', title: 'A card with no status', properties: {} },
  ],
}

describe('renderStaticKanbans — the board it draws', () => {
  it('draws every card under its group instead of a placeholder that never resolves', () => {
    const node = boardNode(boardBody(BOARD))
    renderStaticKanbans(node.parentElement!)

    const snapshot = node.querySelector<HTMLElement>('[data-kanban-snapshot]')
    expect(snapshot, 'the block still holds no still rendering of the board').not.toBeNull()
    expect(snapshot?.textContent).toContain('Write the changelog')
    expect(snapshot?.textContent).toContain('Tag the build')
    expect(snapshot?.textContent).toContain('A card with no status')
    expect(snapshot?.textContent).toContain(t('preview.kanban_status_todo'))
    expect(node.querySelector('[data-kanban-placeholder]')?.textContent).not.toContain(t('preview.kanban_loading'))
  })

  it('carries the board title so a page with two boards reads as two boards', () => {
    const node = boardNode(boardBody(BOARD))
    renderStaticKanbans(node.parentElement!)

    expect(node.querySelector('.kanban-snapshot-title')?.textContent).toBe('Release plan')
  })

  it('draws a board held as an outline body through the same channel', () => {
    const node = boardNode('## To Do\n\n- [ ] Ship the snapshot')
    renderStaticKanbans(node.parentElement!)

    expect(node.querySelector('[data-kanban-snapshot]')?.textContent).toContain('Ship the snapshot')
    expect(node.getAttribute('aria-busy')).toBe('false')
  })

  it('says a board is empty rather than leaving an empty box', () => {
    const node = boardNode(boardBody({ ...BOARD, items: [] }))
    renderStaticKanbans(node.parentElement!)

    expect(node.querySelector('.kanban-snapshot-empty')?.textContent).toBe(t('preview.kanban_snapshot_empty'))
    expect(node.getAttribute('aria-busy')).toBe('false')
  })
})

describe('renderStaticKanbans — the block it leaves behind', () => {
  it('marks the block finished and drops the controls a reader cannot press', () => {
    const node = boardNode(boardBody(BOARD))
    renderStaticKanbans(node.parentElement!)

    expect(node.getAttribute('aria-busy')).toBe('false')
    expect(node.classList.contains('loading')).toBe(false)
    expect(node.querySelector('[data-kanban-fullscreen]'), 'a fullscreen button with nothing to fullscreen').toBeNull()
  })

  it('reports a body it cannot read instead of hanging on it', () => {
    const node = boardNode('{ this is not a board }')
    renderStaticKanbans(node.parentElement!)

    expect(node.classList.contains('has-error')).toBe(true)
    expect(node.getAttribute('aria-busy')).toBe('false')
    expect(node.querySelector('.kanban-error-message')?.textContent).toContain(t('preview.kanban_render_failed'))
    expect(node.querySelector('[data-kanban-retry]'), 'a retry button only the live mount can answer').toBeNull()
  })

  it('draws the same board once, however often its markup is enhanced again', () => {
    const host = kanbanHost('## To Do\n\n- [ ] Ship the snapshot')
    const node = host.querySelector<HTMLElement>('[data-kanban]')!

    renderStaticKanbans(host)
    renderStaticKanbans(host)

    expect(host.querySelectorAll('[data-kanban-snapshot]')).toHaveLength(1)
    expect(node.getAttribute('aria-busy')).toBe('false')
  })
})

describe('showKanbanSourceAll', () => {
  it('shows the fence body where a surface knows nothing about boards', () => {
    const body = boardBody({ ...BOARD, items: [{ id: 'i1', title: 'Write the changelog', properties: {} }] })
    const node = boardNode(body)
    showKanbanSourceAll(node.parentElement!)

    expect(node.querySelector('code')?.textContent).toContain('Write the changelog')
    expect(node.classList.contains('kanban-source')).toBe(true)
    expect(node.getAttribute('aria-busy')).toBe('false')
    expect(node.querySelector('[data-kanban-fullscreen]')).toBeNull()
  })
})
