import type { Attachment, AttachmentFolder, AttachmentStats, AttachmentTag, AttachmentWithUsage, BackupRun, BackupTarget, BackupTargetInput, BackupTargetPatchInput, TestConnectionResult } from '@shared/types';
import { request, toQuery } from './transport';
export const files = {
  files: {
    list: (
      options?:
        | string
        | {
            cursor?: string
            folderId?: string | null
            type?: string
            extension?: string
            sizeRange?: string
            minBytes?: number
            maxBytes?: number
            tag?: string
            starred?: boolean
            pinned?: boolean
            noteId?: string
            search?: string
            sort?: string
            limit?: number
          },
      signal?: AbortSignal,
    ) => {
      const opts = typeof options === 'string' ? { cursor: options } : options
      return request<{
        files: AttachmentWithUsage[]
        nextCursor?: string | null
        stats: AttachmentStats
      }>(
        `/api/files${toQuery({
          cursor: opts?.cursor,
          folderId: opts?.folderId ?? undefined,
          type: opts?.type,
          extension: opts?.extension,
          sizeRange: opts?.sizeRange,
          minBytes: opts?.minBytes,
          maxBytes: opts?.maxBytes,
          tag: opts?.tag,
          starred: opts?.starred ? '1' : undefined,
          pinned: opts?.pinned ? '1' : undefined,
          noteId: opts?.noteId,
          search: opts?.search,
          sort: opts?.sort,
          limit: opts?.limit,
        })}`,
        { signal },
      )
    },
    upload: (file: File, noteId?: string, folderId?: string | null) => {
      const form = new FormData()
      form.append('file', file)
      if (noteId) form.append('noteId', noteId)
      if (folderId) form.append('folderId', folderId)
      return request<Attachment>('/api/files', { method: 'POST', formData: form })
    },
    patch: (
      id: string,
      body: {
        filename?: string
        folderId?: string | null
        isStarred?: boolean
        isPinned?: boolean
        tags?: string[]
        updateNoteReferences?: boolean
      },
    ) => request<Attachment>(`/api/files/${id}`, { method: 'PATCH', body }),
    batch: (body: {
      action: 'move' | 'star' | 'pin' | 'tag' | 'delete'
      ids: string[]
      folderId?: string | null
      isStarred?: boolean
      isPinned?: boolean
      addTags?: string[]
      removeTags?: string[]
    }) => request<{ ok: true; count: number }>('/api/files/batch', { method: 'POST', body }),
    referencingNotes: (id: string) =>
      request<{ notes: Array<{ id: string; title: string; folderId: string | null }> }>(
        `/api/files/${id}/notes`,
      ),
    remove: (id: string) => request<{ ok: true }>(`/api/files/${id}`, { method: 'DELETE' }),
    prune: () => request<{ removed: number; freedBytes: number }>('/api/files/prune', { method: 'POST' }),
    folders: {
      list: () => request<AttachmentFolder[]>('/api/files/folders'),
      create: (body: {
        id?: string
        name?: string
        parentId?: string | null
        color?: string | null
        icon?: string | null
        position?: number
      }) => request<AttachmentFolder>('/api/files/folders', { method: 'POST', body }),
      patch: (
        id: string,
        body: {
          name?: string
          parentId?: string | null
          color?: string | null
          icon?: string | null
          position?: number
        },
      ) => request<AttachmentFolder>(`/api/files/folders/${id}`, { method: 'PATCH', body }),
      remove: (id: string) => request<{ ok: true }>(`/api/files/folders/${id}`, { method: 'DELETE' }),
    },
    tags: {
      list: () => request<AttachmentTag[]>('/api/files/tags'),
      create: (body: {
        id?: string
        name: string
        color?: string | null
      }) => request<AttachmentTag>('/api/files/tags', { method: 'POST', body }),
      patch: (
        id: string,
        body: {
          name?: string
          color?: string | null
          isPinned?: boolean
        },
      ) => request<AttachmentTag>(`/api/files/tags/${id}`, { method: 'PATCH', body }),
      remove: (id: string) => request<{ ok: true }>(`/api/files/tags/${id}`, { method: 'DELETE' }),
    },
  },
  backup: {
    targets: () => request<{ targets: BackupTarget[] }>('/api/backup/targets'),
    create: (body: BackupTargetInput) => request<BackupTarget>('/api/backup/targets', { method: 'POST', body }),
    patch: (id: string, body: BackupTargetPatchInput) =>
      request<BackupTarget>(`/api/backup/targets/${id}`, { method: 'PATCH', body }),
    remove: (id: string) => request<{ ok: true }>(`/api/backup/targets/${id}`, { method: 'DELETE' }),
    test: (id: string, body: Partial<BackupTargetInput> = {}) =>
      request<TestConnectionResult>(`/api/backup/targets/${id}/test`, { method: 'POST', body }),
    testDraft: (body: BackupTargetInput) =>
      request<TestConnectionResult>('/api/backup/test', { method: 'POST', body }),
    run: (targetIds?: string[]) => request<BackupRun>('/api/backup/run', { method: 'POST', body: { targetIds } }),
    runs: () => request<{ runs: BackupRun[] }>('/api/backup/runs'),
  },
}

