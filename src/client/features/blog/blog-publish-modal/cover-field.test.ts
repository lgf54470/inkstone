import { act, createElement, useState } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BlogMediaItem } from '@shared/types'
import { initI18n, t } from '../../../lib/i18n'
import { installTestGlobals, renderElement, type RenderedElement } from '../../../lib/test-render'
import { useUi } from '../../../store/ui'
import { CoverField } from './cover-field'

/**
 * FEA-07: the cover picker. The library has to draw the account's own pictures, hand the picked
 * public address back to the field, upload through the same route every attachment uses, and say
 * what happened when a load fails or a deletion is refused — a failure must never read as an empty
 * library.
 */

const deferred = vi.hoisted(() => ({
  list: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  confirm: vi.fn(async () => true),
}))

vi.mock('../../../lib/api', () => ({
  api: {
    blog: {
      media: { list: deferred.list, upload: deferred.upload, remove: deferred.remove },
    },
  },
}))

// `confirm` is the only overlay export this test replaces; `Modal` stays real so the dialog the
// picker actually draws is the one under test.
vi.mock('../../../components/overlay', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../components/overlay')>()
  return { ...actual, confirm: deferred.confirm }
})

function mediaItem(overrides: Partial<BlogMediaItem> = {}): BlogMediaItem {
  return {
    id: 'media-1',
    filename: 'cover.png',
    mime: 'image/png',
    size: 2048,
    width: 1,
    height: 1,
    createdAt: 1_700_000_000_000,
    previewUrl: '/api/files/media-1?preview=1',
    publicUrl: '/api/blog/public/media/media-1',
    ...overrides,
  }
}

let rendered: RenderedElement | null = null

beforeAll(async () => {
  installTestGlobals()
  await initI18n()
})

beforeEach(() => {
  useUi.setState({ toasts: [] })
  deferred.list.mockReset()
  deferred.list.mockResolvedValue({ media: [mediaItem()] })
  deferred.upload.mockReset()
  deferred.remove.mockReset()
  deferred.remove.mockResolvedValue({ ok: true })
  deferred.confirm.mockClear()
  deferred.confirm.mockResolvedValue(true)
})

afterEach(() => {
  rendered?.unmount()
  rendered = null
})

/** The field is controlled by its parent, so the harness is where the picked address lands. */
function Harness() {
  const [coverUrl, setCoverUrl] = useState('')
  return createElement(CoverField, {
    coverUrl,
    onCoverUrlChange: setCoverUrl,
    firstImageInContent: null,
  })
}

function mount(): void {
  rendered = renderElement(createElement(Harness))
}

function buttonByText(name: string): HTMLButtonElement {
  const button = [...document.body.querySelectorAll('button')].find((el) => el.textContent?.trim() === name)
  if (!button) throw new Error(`no button labelled "${name}"`)
  return button
}

async function openLibrary(): Promise<void> {
  await act(async () => {
    buttonByText(t('blog.media_library')).click()
    await Promise.resolve()
  })
}

function coverInput(): HTMLInputElement {
  const input = document.body.querySelector<HTMLInputElement>('input[type="text"], input:not([type])')
  if (!input) throw new Error('no cover address input')
  return input
}

function toastTitles(): string[] {
  return useUi.getState().toasts.map((toast) => toast.title)
}

describe('blog cover picker library', () => {
  it('lists the library and hands the picked public address back to the field', async () => {
    mount()
    await openLibrary()

    expect(deferred.list).toHaveBeenCalled()
    expect(document.body.textContent).toContain('cover.png')

    await act(async () => {
      ;[...document.body.querySelectorAll('button')]
        .find((button) => button.textContent?.includes('cover.png'))!
        .click()
      await Promise.resolve()
    })

    expect(coverInput().value).toBe('/api/blog/public/media/media-1')
    // Picking closes the library; the field is the only thing left of it.
    expect(document.body.textContent).not.toContain(t('blog.media_choose_hint'))
  })

  it('draws a failed load as a failure with a retry, never as an empty library', async () => {
    deferred.list.mockRejectedValueOnce(new Error('offline'))
    mount()
    await openLibrary()

    expect(document.body.textContent).toContain(t('blog.load_failed'))
    expect(document.body.textContent).not.toContain(t('blog.media_empty'))

    deferred.list.mockResolvedValue({ media: [mediaItem()] })
    await act(async () => {
      buttonByText(t('common.retry')).click()
      await Promise.resolve()
    })

    expect(document.body.textContent).toContain('cover.png')
    expect(document.body.textContent).not.toContain(t('blog.load_failed'))
  })
})

describe('blog cover picker upload', () => {
  it('uploads a picture into the library and shows it without a reload', async () => {
    deferred.list.mockResolvedValue({ media: [] })
    deferred.upload.mockResolvedValue(mediaItem({ id: 'media-2', filename: 'new-cover.png' }))
    mount()
    await openLibrary()
    expect(document.body.textContent).toContain(t('blog.media_empty'))

    const input = document.body.querySelector<HTMLInputElement>('input[type="file"]')
    expect(input, 'the library has no upload control').not.toBeNull()
    const file = new File(['png'], 'new-cover.png', { type: 'image/png' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })

    await act(async () => {
      input!.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })

    expect(deferred.upload).toHaveBeenCalledTimes(1)
    expect(deferred.upload.mock.calls[0][0]).toBe(file)
    expect(document.body.textContent).toContain('new-cover.png')
    expect(toastTitles()).toContain(t('blog.media_uploaded'))
  })
})

describe('blog cover picker deletion', () => {
  it('asks before deleting and reports the deletion', async () => {
    mount()
    await openLibrary()

    const remove = document.body.querySelector<HTMLButtonElement>(
      `button[aria-label="${t('blog.media_delete')}: cover.png"]`,
    )
    expect(remove, 'the library has no delete control').not.toBeNull()

    await act(async () => {
      remove!.click()
      await Promise.resolve()
    })

    expect(deferred.confirm).toHaveBeenCalled()
    expect(deferred.remove).toHaveBeenCalledWith('media-1')
    expect(document.body.textContent).not.toContain('cover.png')
    expect(toastTitles()).toContain(t('blog.media_deleted'))
  })

  it('deletes nothing when the confirmation is declined', async () => {
    deferred.confirm.mockResolvedValueOnce(false)
    mount()
    await openLibrary()

    const remove = document.body.querySelector<HTMLButtonElement>(
      `button[aria-label="${t('blog.media_delete')}: cover.png"]`,
    )!
    await act(async () => {
      remove.click()
      await Promise.resolve()
    })

    expect(deferred.remove).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('cover.png')
  })
})
