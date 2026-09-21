import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShareCollection } from '@shared/types'
import { renderElement } from '../../lib/test-render'
import { api } from '../../lib/api'
import { initI18n, t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { ShareCollectionsPanel } from './share-collections-panel'
import { ShareCollectionPublishDialog } from './share-collection-publish-dialog'

const confirmMock = vi.hoisted(() => vi.fn(async (_options: { title: string; description: string }) => true))

vi.mock('../../lib/api', () => ({
  api: {
    share: {
      collections: {
        list: vi.fn(),
        publish: vi.fn(),
        patch: vi.fn(),
        revoke: vi.fn(),
      },
    },
  },
}))

vi.mock('../../components/overlay', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../components/overlay')>()
  return { ...actual, confirm: confirmMock }
})

vi.mock('./share-store', () => ({
  useShareStore: (selector: (state: { folders: unknown[]; tags: unknown[] }) => unknown) =>
    selector({
      folders: [{ id: 'f1', name: 'Field notes' }],
      tags: [{ id: 't1', name: 'Research' }],
    }),
}))

function collection(overrides: Partial<ShareCollection> = {}): ShareCollection {
  return {
    id: 'c1',
    slug: 'demo-collection',
    title: 'Field notes',
    targetType: 'folder',
    targetValue: 'f1',
    count: 3,
    hasPassword: false,
    expiresAt: null,
    isEnabled: true,
    createdAt: 1_700_000_000_000,
    ...overrides,
  }
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function buttonByText(label: string): HTMLButtonElement | undefined {
  return [...document.body.querySelectorAll('button')].find((button) => button.textContent?.includes(label))
}

/**
 * Row actions are icon buttons: their visible content is a glyph, so the name a person hears is the
 * one to look them up by — the same name, which is also what makes the lookup a check on it.
 */
function buttonByLabel(label: string): HTMLButtonElement | undefined {
  return [...document.body.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === label)
}

beforeEach(async () => {
  // A Modal renders into a portal on document.body; without clearing it, a later test's lookup can
  // find the previous test's dialog and click the wrong button.
  document.body.replaceChildren()
  vi.clearAllMocks()
  await initI18n()
  useUi.setState({ toasts: [] })
  confirmMock.mockResolvedValue(true)
  vi.mocked(api.share.collections.list).mockResolvedValue({ collections: [collection()] } as never)
  vi.mocked(api.share.collections.patch).mockResolvedValue({ ok: true } as never)
  vi.mocked(api.share.collections.revoke).mockResolvedValue({ ok: true } as never)
  vi.mocked(api.share.collections.publish).mockResolvedValue({ id: 'c1', slug: 'demo-collection' } as never)
})

describe('collections panel (ADR-0005)', () => {
  it('lists each collection as a table row with its live count and access', async () => {
    const rendered = renderElement(createElement(ShareCollectionsPanel))
    await settle()

    const heads = [...rendered.container.querySelectorAll('th')].map((th) => th.getAttribute('scope'))
    expect(heads).toEqual(['col', 'col', 'col', 'col', 'col', 'col'])
    const row = rendered.container.querySelector('tbody tr')
    expect(row?.textContent).toContain('Field notes')
    expect(row?.textContent).toContain(t('share.collection_members', { count: 3 }))
    expect(row?.textContent).toContain(t('share.collection_public'))
    expect(row?.textContent).toContain(t('share.collection_never_expires'))
    rendered.unmount()
  })

  it('names the target kind, so a folder and a tag are not read as the same thing', async () => {
    vi.mocked(api.share.collections.list).mockResolvedValue({
      collections: [collection(), collection({ id: 'c2', title: 'Research', targetType: 'tag', hasPassword: true })],
    } as never)
    const rendered = renderElement(createElement(ShareCollectionsPanel))
    await settle()

    const rows = [...rendered.container.querySelectorAll('tbody tr')].map((row) => row.textContent ?? '')
    expect(rows[0]).toContain(t('share.collection_target_folder'))
    expect(rows[1]).toContain(t('share.collection_target_tag'))
    expect(rows[1]).toContain(t('share.collection_protected'))
    rendered.unmount()
  })

  it('pauses and republishes through the one toggle, reloading the live counts', async () => {
    const rendered = renderElement(createElement(ShareCollectionsPanel))
    await settle()

    await act(async () => {
      buttonByLabel(t('share.collection_pause'))!.click()
    })
    await settle()
    expect(api.share.collections.patch).toHaveBeenCalledWith('c1', { isEnabled: false })
    expect(api.share.collections.list).toHaveBeenCalledTimes(2)
    rendered.unmount()
  })

})

describe('revoking a collection (ADR-0005)', () => {
  it('says what revoking does to the shares before it revokes anything', async () => {
    const rendered = renderElement(createElement(ShareCollectionsPanel))
    await settle()

    await act(async () => {
      buttonByLabel(t('share.collection_revoke'))!.click()
    })
    await settle()

    expect(confirmMock).toHaveBeenCalledTimes(1)
    const options = confirmMock.mock.calls[0]![0]
    expect(options.description).toBe(t('share.collection_revoke_confirm_desc'))
    expect(options.description).toContain('not revoking the shares')
    expect(api.share.collections.revoke).toHaveBeenCalledWith('c1')
    rendered.unmount()
  })

  it('keeps the collection when the confirmation is refused', async () => {
    confirmMock.mockResolvedValue(false)
    const rendered = renderElement(createElement(ShareCollectionsPanel))
    await settle()

    await act(async () => {
      buttonByLabel(t('share.collection_revoke'))!.click()
    })
    await settle()
    expect(api.share.collections.revoke).not.toHaveBeenCalled()
    rendered.unmount()
  })

})

describe('collections panel states (ADR-0005)', () => {
  it('tells an empty account what a collection would be, and a failed load that it failed', async () => {
    vi.mocked(api.share.collections.list).mockResolvedValue({ collections: [] } as never)
    const empty = renderElement(createElement(ShareCollectionsPanel))
    await settle()
    expect(empty.container.textContent).toContain(t('share.collection_empty'))
    expect(empty.container.textContent).toContain(t('share.collection_empty_hint'))
    empty.unmount()

    vi.mocked(api.share.collections.list).mockRejectedValue(new Error('offline'))
    const failed = renderElement(createElement(ShareCollectionsPanel))
    await settle()
    expect(failed.container.textContent).toContain(t('share.collection_load_failed'))
    failed.unmount()
  })
})

describe('collection publish dialog (ADR-0005)', () => {
  it('publishes the target it opened for, with the password it was given', async () => {
    const onPublish = vi.fn(async () => true)
    const rendered = renderElement(createElement(ShareCollectionPublishDialog, {
      open: true,
      onClose: () => {},
      onPublish,
      initialTarget: { type: 'folder', value: 'f1' },
    }))
    await settle()

    const password = document.body.querySelector<HTMLInputElement>('input[type="password"]')!
    // A controlled input ignores a plain `value` assignment (React's tracker sees no change), so the
    // value goes in through the prototype setter and then announces itself the way typing does.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      setter.call(password, 'correct-horse')
      password.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      buttonByText(t('share.collection_publish_action'))!.click()
    })
    await settle()

    expect(onPublish).toHaveBeenCalledWith({
      targetType: 'folder',
      targetValue: 'f1',
      password: 'correct-horse',
      expiresAt: null,
    })
    rendered.unmount()
  })

})

describe('collection publish dialog without a password (ADR-0005)', () => {
  it('clears the password when the field is left empty, which is how a page becomes public again', async () => {
    const onPublish = vi.fn(async () => true)
    const rendered = renderElement(createElement(ShareCollectionPublishDialog, {
      open: true,
      onClose: () => {},
      onPublish,
      initialTarget: { type: 'folder', value: 'f1' },
    }))
    await settle()

    await act(async () => {
      buttonByText(t('share.collection_publish_action'))!.click()
    })
    await settle()

    // `undefined` rather than an empty string: the worker reads the field's absence as "no password",
    // and a hashed empty string would be a password nobody can type.
    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({ password: undefined, expiresAt: null }))
    rendered.unmount()
  })

})

describe('collection publish dialog refusals (ADR-0005)', () => {
  it('will not publish before a target is picked', async () => {
    const onPublish = vi.fn(async () => true)
    const rendered = renderElement(createElement(ShareCollectionPublishDialog, { open: true, onClose: () => {}, onPublish }))
    await settle()

    const publish = buttonByText(t('share.collection_publish_action')) as HTMLButtonElement
    expect(publish.disabled).toBe(true)
    await act(async () => {
      publish.click()
    })
    expect(onPublish).not.toHaveBeenCalled()
    rendered.unmount()
  })

})

describe('collection publish dialog copy (ADR-0005)', () => {
  it('carries the view-not-snapshot warning, because a collection moves with its folder', async () => {
    const rendered = renderElement(createElement(ShareCollectionPublishDialog, { open: true, onClose: () => {}, onPublish: async () => true }))
    await settle()
    expect(document.body.textContent).toContain(t('share.collection_view_not_snapshot'))
    expect(document.body.textContent).toContain(t('share.collection_publish_hint'))
    rendered.unmount()
  })
})
