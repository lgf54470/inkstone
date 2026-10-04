import { act, createElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicNote } from '@shared/types'
import { initI18n, t } from '../../../lib/i18n'
import { installTestGlobals, renderElement } from '../../../lib/test-render'
import { SharePage } from './page'

installTestGlobals()

// The `?present=` branch of the shared page (ADR-0006). The viewer itself is `audience-view.test.ts`; what
// lives here is the decision about when a visitor is handed a seat at the show — and when they are not,
// because the note behind it has not been given to them yet.
const load = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))

vi.mock('./use-share-page', () => ({
  useShareLoad: () => load.current,
  useShareRendering: () => ({
    hostRef: { current: null },
    htmlObj: { __html: '<p>prose</p>' },
    onContentClick: vi.fn(),
    onContentKeyDown: vi.fn(),
  }),
}))

// The projector is stood in for by its own marker: this file asserts which host the page chose, not what
// the host draws.
const seen = vi.hoisted(() => ({ source: null as string | null }))

vi.mock('../../presentation', () => ({
  AudienceView: ({ source }: { source: string }) => {
    seen.source = source
    return createElement('div', { 'data-audience-view': true })
  },
}))

const NOTE: PublicNote = {
  title: 'Quarterly Review',
  content: '# One\n\nFirst body.',
  updatedAt: 1,
  createdAt: 1,
  author: { name: 'Speaker', avatarUrl: '' },
  site: { name: 'Inkstone' },
  share: { slug: 'slug-1' },
}

function loaded(overrides: Record<string, unknown> = {}) {
  load.current = {
    note: NOTE, isPasswordRequired: false, password: '', setPassword: vi.fn(),
    error: null, isLoading: false, load: vi.fn(), ...overrides,
  }
}

beforeAll(async () => {
  await initI18n()
})

beforeEach(() => {
  seen.source = null
})

afterEach(() => {
  document.body.innerHTML = ''
})

function mount(props: { slug: string; present?: string | null }) {
  const view = renderElement(createElement(SharePage, props))
  return {
    audience: () => Boolean(view.container.querySelector('[data-audience-view]')),
    prose: () => view.container.textContent ?? '',
    unmount: view.unmount,
  }
}

describe('the shared page with a show written on it', () => {
  it('gives the audience the note the link points at', () => {
    loaded()
    const page = mount({ slug: 'slug-1', present: 'token-1' })
    expect(page.audience()).toBe(true)
    expect(seen.source).toBe(NOTE.content)
    page.unmount()
  })

  it('stays a readable note when no show was asked for', () => {
    loaded()
    const page = mount({ slug: 'slug-1' })
    expect(page.audience()).toBe(false)
    page.unmount()
  })

  it('asks for the passcode before it seats anybody', () => {
    loaded({ note: null, isPasswordRequired: true })
    const page = mount({ slug: 'slug-1', present: 'token-1' })
    expect(page.audience(), 'a token is not a passcode').toBe(false)
    expect(page.prose()).toContain(t('share.this_note_requires_a_password'))
    page.unmount()
  })

  it('holds the three states a visitor can arrive on', () => {
    loaded({ note: null, isLoading: true })
    const loading = mount({ slug: 'slug-1', present: 'token-1' })
    expect(loading.audience()).toBe(false)
    loading.unmount()

    loaded({ note: null, error: t('share.content_unavailable') })
    const failed = mount({ slug: 'slug-1', present: 'token-1' })
    expect(failed.audience()).toBe(false)
    expect(failed.prose()).toContain(t('share.content_unavailable'))
    failed.unmount()
  })
})

// The passcode form is the gate the audience branch depends on, so its submit path is checked once here
// rather than left to the browser gate.
describe('the passcode gate the viewer sits behind', () => {
  it('sends what the viewer typed to the same load the note page uses', () => {
    const next = vi.fn()
    loaded({ note: null, isPasswordRequired: true, password: 'hunter2', load: next })
    const page = mount({ slug: 'slug-1', present: 'token-1' })
    const form = document.querySelector('form')!
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(next).toHaveBeenCalledWith('hunter2')
    page.unmount()
  })
})
