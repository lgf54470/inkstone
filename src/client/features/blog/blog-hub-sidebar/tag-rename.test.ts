import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BlogTag } from '@shared/types'
import { buildTagTree } from '../../../lib/tag-tree'

const H = vi.hoisted(() => ({ confirm: vi.fn(async () => true) }))

vi.mock('../../../components/overlay', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../components/overlay')>()
  return { ...actual, confirm: H.confirm }
})

import { finishTagRename } from './use-blog-hub-sidebar'

function tag(id: string, name: string): BlogTag {
  return { id, name, color: null, isPinned: false, createdAt: 0 }
}

function nodeFor(tags: BlogTag[], name: string) {
  const node = buildTagTree(tags.map((entry) => ({
    id: entry.id,
    name: entry.name,
    color: entry.color ?? null,
    count: 0,
    isPinned: Boolean(entry.isPinned),
    createdAt: entry.createdAt ?? 0,
  }))).find((candidate) => candidate.fullPath === name)
  if (!node) throw new Error(`missing node ${name}`)
  return node
}

/**
 * Renaming a blog tag onto a name that already exists moves the memberships in the worker (ADR-0007),
 * so the sidebar asks before it acts and calls the explicit merge endpoint instead of a second rename.
 */
describe('blog tag rename vs merge', () => {
  beforeEach(() => {
    H.confirm.mockReset()
    H.confirm.mockResolvedValue(true)
  })

  it('patches a free name without asking', async () => {
    const tags = [tag('tag-work', 'work'), tag('tag-design', 'design')]
    const patchTag = vi.fn(async () => null)
    const mergeTag = vi.fn(async () => true)

    await finishTagRename(nodeFor(tags, 'work'), 'projects', tags, patchTag, mergeTag, () => {})

    expect(H.confirm).not.toHaveBeenCalled()
    expect(mergeTag).not.toHaveBeenCalled()
    expect(patchTag).toHaveBeenCalledWith('tag-work', { name: 'projects' })
  })

  it('confirms and merges when the target name is taken', async () => {
    const tags = [tag('tag-work', 'work'), tag('tag-design', 'design')]
    const patchTag = vi.fn(async () => null)
    const mergeTag = vi.fn(async () => true)

    await finishTagRename(nodeFor(tags, 'work'), 'design', tags, patchTag, mergeTag, () => {})

    expect(H.confirm).toHaveBeenCalledTimes(1)
    expect(patchTag).not.toHaveBeenCalled()
    expect(mergeTag).toHaveBeenCalledWith('tag-work', 'tag-design')
  })

  it('does nothing when the merge is declined', async () => {
    H.confirm.mockResolvedValue(false)
    const tags = [tag('tag-work', 'work'), tag('tag-design', 'design')]
    const patchTag = vi.fn(async () => null)
    const mergeTag = vi.fn(async () => true)

    await finishTagRename(nodeFor(tags, 'work'), 'design', tags, patchTag, mergeTag, () => {})

    expect(patchTag).not.toHaveBeenCalled()
    expect(mergeTag).not.toHaveBeenCalled()
  })
})
