/**
 * The preview's staging pass and the rule behind its repaint: what a pass hands back, and which of those
 * handbacks are a new document. Markup alone cannot answer the second question any more (P-01) — a
 * fence-body edit leaves the rendered string byte-identical — and the answer is load-bearing in both
 * directions: skip a real change and a board keeps drawing what the note no longer holds, commit a
 * non-change and every mounted block is rebuilt for nothing.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/user-settings'
import { initI18n } from '../../lib/i18n'
import { renderMarkdown } from '../../lib/markdown/renderer'
import { createFenceBodies, fenceBody, takeFenceIndex, type FenceBodies } from '../../lib/markdown/fence-bodies'
import { nextCommittedDocument, prepareStagedHtml } from './preview-stage'

// An embed appends its own bodies to the set the pass was handed. The stub only has to keep that promise —
// the question here is whose set grows, so the real resolver's store lookups stay out of it.
const appended = vi.hoisted((): string[] => [])
vi.mock('../../lib/markdown/embeds', () => ({
  resolveNoteEmbeds: async (_root: HTMLElement, options: { fences: FenceBodies }) => {
    takeFenceIndex(options.fences, 'kanban', '{"title":"Embedded board"}')
    appended.push('resolved')
  },
}))

beforeAll(async () => {
  await initI18n()
})

function board(title: string): FenceBodies {
  const fences = createFenceBodies()
  takeFenceIndex(fences, 'kanban', `{"title":"${title}"}`)
  return fences
}

describe('nextCommittedDocument', () => {
  it('sees no document in a preparation that drew the same thing', () => {
    const previous = { html: '<p>note</p>', fences: board('Roadmap') }
    expect(nextCommittedDocument(previous, { html: '<p>note</p>', fences: board('Roadmap') })).toBeNull()
  })

  it('commits a body-only edit the rendered string never showed', () => {
    const previous = { html: '<div data-kanban-index="0"></div>', fences: board('Roadmap') }
    const next = nextCommittedDocument(previous, { html: previous.html, fences: board('Backlog') })
    expect(next?.fences.kanban).toEqual(['{"title":"Backlog"}'])
  })

  it('keeps the set the mounted blocks already read from when its bodies did not change', () => {
    // A theme flip re-renders and re-numbers into a brand new set with the same contents. The blocks are
    // keyed on that set's identity, so committing the copy would tear down every board for nothing.
    const previous = { html: '<p>old</p>', fences: board('Roadmap') }
    const next = nextCommittedDocument(previous, { html: '<p>new</p>', fences: board('Roadmap') })
    expect(next).toEqual({ html: '<p>new</p>', fences: previous.fences })
    expect(next!.fences).toBe(previous.fences)
  })
})

const BOARD_MARKDOWN = ['# Backlog', '', '```kanban', '{"title":"Release plan"}', '```', ''].join('\n')

/** The pass exactly as the hook drives it: the committed markup rendered into a node nothing else holds. */
async function stage(rendered: ReturnType<typeof renderMarkdown>, isCurrent: () => boolean = () => true) {
  const staging = document.createElement('div')
  staging.innerHTML = rendered.html
  const prepared = await prepareStagedHtml({
    staging,
    rendered,
    debounced: BOARD_MARKDOWN,
    embedContextTitle: 'Backlog',
    preview: DEFAULT_SETTINGS.preview,
    theme: 'light',
    host: null,
    isCurrent,
  })
  return { staging, prepared }
}

describe('prepareStagedHtml', () => {
  it('leaves the body out of the markup and readable from the block that markup draws', async () => {
    const { staging, prepared } = await stage(renderMarkdown(BOARD_MARKDOWN))

    expect(prepared!.html).toContain('data-kanban-index="0"')
    expect(prepared!.html).not.toContain('Release plan')
    // The blocks the hook mounts are elements of this same staging node, so the set has to answer from
    // them — the read a live board makes the moment it opens.
    expect(fenceBody(staging.querySelector<HTMLElement>('[data-kanban]')!, 'kanban', 0)).toContain('Release plan')
  })

  it('draws nothing for a pass the document has already moved past', async () => {
    const { prepared } = await stage(renderMarkdown(BOARD_MARKDOWN), () => false)
    expect(prepared).toBeNull()
  })

  it('numbers an embed\'s bodies onto the pass, not onto the render', async () => {
    const rendered = renderMarkdown(BOARD_MARKDOWN)
    const { prepared } = await stage({ ...rendered, hasEmbeds: true })

    expect(appended).toHaveLength(1)
    expect(prepared!.fences.kanban).toEqual(['{"title":"Release plan"}\n', '{"title":"Embedded board"}'])
    // Every pass over this note starts from the same numbering; a set that grew in place would number
    // the next pass's blocks past the end of anything its markup points at.
    expect(rendered.fences.kanban).toEqual(['{"title":"Release plan"}\n'])
  })
})
