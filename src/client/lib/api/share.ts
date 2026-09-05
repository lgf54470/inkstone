import type { MarkdownBackupManifest } from '@shared/backup-format';
import type { BlogPost, BlogFolder, BlogTag, BlogCategory, BlogComment, BlogCommentStatus, BlogStats, BlogSettings, BlogGlobalAnalytics, CommunityTemplate, CommunityTemplateInput, ImportResult, PublicNote, ShareFolder, ShareGlobalAnalytics, ShareInfo, ShareListResponse, ShareNoteAnalytics, ShareTag, ShareTimelineRange, ShareVisitsResponse } from '@shared/types';
import { request, saveDownload, toQuery } from './transport';
export const share = {
  share: {
    list: (
      params?: {
        folderId?: string | null
        tag?: string | null
        status?: string
        search?: string
        sort?: string
        excludeBots?: boolean
        excludeSelf?: boolean
        excludeOwner?: boolean
      },
      signal?: AbortSignal,
    ) => request<ShareListResponse>(`/api/share${toQuery((params ?? {}) as Record<string, string | number | boolean | undefined>)}`, { signal }),
    globalAnalytics: (
      range?: ShareTimelineRange,
      filters?: { excludeBots?: boolean; excludeSelf?: boolean; excludeOwner?: boolean },
      signal?: AbortSignal,
    ) =>
      request<ShareGlobalAnalytics>(
        `/api/share/analytics/global${toQuery({
          range,
          excludeBots: filters?.excludeBots,
          excludeSelf: filters?.excludeSelf,
          excludeOwner: filters?.excludeOwner,
        })}`,
        { signal },
      ),
    noteAnalytics: (
      noteId: string,
      range?: ShareTimelineRange,
      filters?: { excludeBots?: boolean; excludeSelf?: boolean; excludeOwner?: boolean },
      signal?: AbortSignal,
    ) =>
      request<ShareNoteAnalytics>(
        `/api/share/analytics/note/${noteId}${toQuery({
          range,
          excludeBots: filters?.excludeBots,
          excludeSelf: filters?.excludeSelf,
          excludeOwner: filters?.excludeOwner,
        })}`,
        { signal },
      ),
    checkSlug: (slug: string, currentNoteId?: string) =>
      request<{ available: boolean; reason?: string }>(`/api/share/check-slug${toQuery({ slug, currentNoteId })}`),
    visits: (
      params?: {
        page?: number
        limit?: number
        noteId?: string
        filter?: string
        search?: string
      },
      signal?: AbortSignal,
    ) => request<ShareVisitsResponse>(`/api/share/visits${toQuery(params ?? {})}`, { signal }),
    cleanVisits: (type: 'bots' | 'older_than' | 'all', days?: number) =>
      request<{ ok: true; deleted: number }>(`/api/share/visits${toQuery({ type, days })}`, { method: 'DELETE' }),
    batch: (
      action: 'enable' | 'disable' | 'revoke' | 'expire' | 'move',
      noteIds: string[],
      expiresIn?: number | null,
      folderId?: string | null,
    ) => request<{ ok: true; count: number }>('/api/share/batch', { method: 'POST', body: { action, noteIds, expiresIn, folderId } }),
    batchFolder: (folderId: string, enabled: boolean) =>
      request<{ ok: true; count: number }>('/api/share/batch-folder', { method: 'POST', body: { folderId, enabled } }),
    batchTag: (tag: string, enabled: boolean) =>
      request<{ ok: true; count: number }>('/api/share/batch-tag', { method: 'POST', body: { tag, enabled } }),
    batchToggleGroup: (type: 'folder' | 'tag', target: string, enabled: boolean) =>
      request<{ ok: true }>('/api/share/batch-toggle-group', { method: 'POST', body: { type, target, enabled } }),
    folders: {
      list: () => request<ShareFolder[]>('/api/share/folders'),
      create: (body: { name: string; parentId?: string | null; color?: string | null; icon?: string | null }) =>
        request<ShareFolder>('/api/share/folders', { method: 'POST', body }),
      patch: (id: string, body: { name?: string; parentId?: string | null; color?: string | null; icon?: string | null; position?: number }) =>
        request<ShareFolder>(`/api/share/folders/${id}`, { method: 'PATCH', body }),
      remove: (id: string) => request<{ ok: true }>(`/api/share/folders/${id}`, { method: 'DELETE' }),
    },
    tags: {
      list: () => request<ShareTag[]>('/api/share/tags'),
      create: (body: { name: string; color?: string | null }) =>
        request<ShareTag>('/api/share/tags', { method: 'POST', body }),
      patch: (id: string, body: { name?: string; color?: string | null; isPinned?: boolean }) =>
        request<ShareTag>(`/api/share/tags/${id}`, { method: 'PATCH', body }),
      remove: (id: string) => request<{ ok: true }>(`/api/share/tags/${id}`, { method: 'DELETE' }),
    },
    getNoteShare: (noteId: string, signal?: AbortSignal) =>
      request<{ share: ShareInfo | null; noteTitle: string; isPinned?: boolean; isStarred?: boolean }>(`/api/share/note-share/${noteId}`, { signal }),
    get: (noteId: string, signal?: AbortSignal) =>
      request<{ share: ShareInfo | null }>(`/api/share/${noteId}`, { signal }),
    create: (
      noteId: string,
      body: {
        password?: string | null
        expiresIn?: number | null
        customSlug?: string
        isEnabled?: boolean
        folderId?: string | null
        tags?: string[]
      },
    ) => request<{ share: ShareInfo }>(`/api/share/${noteId}`, { method: 'POST', body }),
    remove: (noteId: string) => request<{ ok: true }>(`/api/share/${noteId}`, { method: 'DELETE' }),
    read: (slug: string, password?: string, signal?: AbortSignal, referrer?: string) =>
      request<PublicNote>(`/api/public/${slug}`, { method: 'POST', body: { password, referrer }, signal }),
  },
  blog: {
    stats: (signal?: AbortSignal) =>
      request<{ stats: BlogStats }>('/api/blog/stats', { signal }),
    analytics: (
      range: ShareTimelineRange = '7d',
      filters?: { excludeBots?: boolean; excludeSelf?: boolean; excludeOwner?: boolean },
      signal?: AbortSignal,
    ) =>
      request<{ analytics: BlogGlobalAnalytics }>(
        `/api/blog/analytics${toQuery({ range, ...filters })}`,
        { signal },
      ),
    settings: {
      get: (signal?: AbortSignal) =>
        request<{ settings: BlogSettings }>('/api/blog/settings', { signal }),
      patch: (body: Partial<BlogSettings>) =>
        request<{ settings: BlogSettings }>('/api/blog/settings', { method: 'PATCH', body }),
    },
    checkSlug: (slug: string, currentPostId?: string) =>
      request<{ available: boolean; reason?: string }>(`/api/blog/check-slug${toQuery({ slug, currentPostId })}`),
    getNotePost: (noteId: string, signal?: AbortSignal) =>
      request<{ post: BlogPost | null }>(`/api/blog/note-post/${noteId}`, { signal }),
    posts: {
      list: (params?: { status?: string; categoryId?: string; folderId?: string; tag?: string; search?: string; sort?: string }, signal?: AbortSignal) =>
        request<{ posts: BlogPost[] }>(`/api/blog/posts${toQuery(params ?? {})}`, { signal }),
      create: (body: {
        noteId: string
        title: string
        slug?: string
        excerpt?: string
        content?: string
        coverUrl?: string
        categoryId?: string | null
        folderId?: string | null
        tags?: string[]
        isPublished?: boolean
        allowComments?: boolean
        isPinned?: boolean
      }) => request<{ ok: true; id: string; slug: string }>('/api/blog/posts', { method: 'POST', body }),
      patch: (id: string, body: Partial<BlogPost>) =>
        request<{ ok: true }>(`/api/blog/posts/${id}`, { method: 'PATCH', body }),
      remove: (id: string) =>
        request<{ ok: true }>(`/api/blog/posts/${id}`, { method: 'DELETE' }),
      sync: (id: string) =>
        request<{ ok: true; syncedAt: number }>(`/api/blog/posts/${id}/sync`, { method: 'POST' }),
      batch: (
        action: 'publish' | 'unpublish' | 'delete' | 'setCategory' | 'setFolder' | 'setPinned',
        postIds: string[],
        options?: { categoryId?: string | null; folderId?: string | null; isPinned?: boolean },
      ) =>
        request<{ ok: true; count: number }>('/api/blog/posts/batch', {
          method: 'POST',
          body: { action, postIds, ...options },
        }),
    },
    folders: {
      list: (signal?: AbortSignal) =>
        request<BlogFolder[]>('/api/blog/folders', { signal }),
      create: (body: { name: string; parentId?: string | null; color?: string | null; icon?: string | null; position?: number }) =>
        request<BlogFolder>('/api/blog/folders', { method: 'POST', body }),
      patch: (id: string, body: { name?: string; parentId?: string | null; color?: string | null; icon?: string | null; position?: number }) =>
        request<BlogFolder>(`/api/blog/folders/${id}`, { method: 'PATCH', body }),
      remove: (id: string) =>
        request<{ ok: true }>(`/api/blog/folders/${id}`, { method: 'DELETE' }),
    },
    tags: {
      list: (signal?: AbortSignal) =>
        request<BlogTag[]>('/api/blog/tags', { signal }),
      create: (body: { name: string; color?: string | null }) =>
        request<BlogTag>('/api/blog/tags', { method: 'POST', body }),
      patch: (id: string, body: { name?: string; color?: string | null; isPinned?: boolean }) =>
        request<BlogTag>(`/api/blog/tags/${id}`, { method: 'PATCH', body }),
      remove: (id: string) =>
        request<{ ok: true }>(`/api/blog/tags/${id}`, { method: 'DELETE' }),
    },
    batchToggleGroup: (type: 'folder' | 'tag', target: string, enabled: boolean) =>
      request<{ ok: true }>('/api/blog/batch-toggle-group', { method: 'POST', body: { type, target, enabled } }),
    cleanVisits: (type: 'bots' | 'older_than' | 'all', days?: number) =>
      request<{ ok: true; deleted: number }>(`/api/blog/visits${toQuery({ type, days })}`, { method: 'DELETE' }),
    categories: {
      list: (signal?: AbortSignal) =>
        request<{ categories: BlogCategory[] }>('/api/blog/categories', { signal }),
      create: (body: { name: string; slug?: string; description?: string; color?: string; icon?: string }) =>
        request<{ category: BlogCategory }>('/api/blog/categories', { method: 'POST', body }),
      patch: (id: string, body: Partial<BlogCategory>) =>
        request<{ ok: true }>(`/api/blog/categories/${id}`, { method: 'PATCH', body }),
      remove: (id: string) =>
        request<{ ok: true }>(`/api/blog/categories/${id}`, { method: 'DELETE' }),
    },
    comments: {
      list: (params?: { status?: string; postId?: string; search?: string }, signal?: AbortSignal) =>
        request<{ comments: BlogComment[] }>(`/api/blog/comments${toQuery(params ?? {})}`, { signal }),
      updateStatus: (id: string, status: BlogCommentStatus) =>
        request<{ ok: true; status: BlogCommentStatus }>(`/api/blog/comments/${id}/status`, { method: 'PATCH', body: { status } }),
      remove: (id: string) =>
        request<{ ok: true }>(`/api/blog/comments/${id}`, { method: 'DELETE' }),
      batch: (action: 'approve' | 'reject' | 'spam' | 'delete', commentIds: string[]) =>
        request<{ ok: true; count: number }>('/api/blog/comments/batch', { method: 'POST', body: { action, commentIds } }),
    },
  },
  communityTemplates: {
    list: () => request<{ templates: CommunityTemplate[] }>('/api/templates/community'),
    publish: (input: CommunityTemplateInput) => request<{ template: CommunityTemplate }>('/api/templates/community', { method: 'POST', body: input }),
    remove: (id: string) => request<{ ok: true }>(`/api/templates/community/${id}`, { method: 'DELETE' }),
  },
  transfer: {
    save: saveDownload,
    import: (
      files: File[],
      conflict: 'skip' | 'newer' | 'duplicate' = 'newer',
      backup?: { manifest: MarkdownBackupManifest; paths: string[] },
    ) => {
      const form = new FormData()
      for (const file of files) form.append('file', file)
      form.append('conflict', conflict)
      if (backup) {
        form.append('backupManifest', JSON.stringify(backup.manifest))
        form.append('backupPaths', JSON.stringify(backup.paths))
      }
      return request<ImportResult>('/api/import', { method: 'POST', formData: form })
    },
  },
}

