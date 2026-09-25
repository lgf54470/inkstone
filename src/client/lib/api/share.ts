import type { MarkdownBackupManifest } from '@shared/backup-format'
import { LIMITS } from '@shared/constants'
import type { BlogPost, BlogFolder, BlogTag, BlogCategory, BlogComment, BlogCommentStatus, BlogStats, BlogSettings, BlogGlobalAnalytics, BlogLink, BlogLinkCategory, BlogLinkStatus, BlogLinkStats, CommunityTemplate, CommunityTemplateInput, ImportResult, PublicCollection, PublicNote, ShareCollectionListResponse, ShareFolder, ShareGlobalAnalytics, ShareInfo, ShareListResponse, ShareNoteAnalytics, ShareSessionsResponse, ShareStatsResponse, ShareSummaryResponse, ShareTag, ShareTimelineRange, ShareVisitsResponse } from '@shared/types'
import { request, saveDownload, toQuery } from './transport'
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
    stats: (
      params?: { excludeBots?: boolean; excludeSelf?: boolean; excludeOwner?: boolean },
      signal?: AbortSignal,
    ) => request<ShareStatsResponse>(`/api/share/stats${toQuery((params ?? {}) as Record<string, string | number | boolean | undefined>)}`, { signal }),
    summary: (signal?: AbortSignal) => request<ShareSummaryResponse>('/api/share/summary', { signal }),
    /**
     * The visitor session view (ADR-0003): the same window and traffic filters the dashboard
     * resolves, folded into sittings by the worker. Read-only, and derived on every request.
     */
    sessions: (
      params: {
        range?: ShareTimelineRange
        filters?: { excludeBots?: boolean; excludeSelf?: boolean; excludeOwner?: boolean }
        limit?: number
        cursor?: string
        signal?: AbortSignal
      } = {},
    ) =>
      request<ShareSessionsResponse>(
        `/api/share/sessions${toQuery({
          range: params.range,
          excludeBots: params.filters?.excludeBots,
          excludeSelf: params.filters?.excludeSelf,
          excludeOwner: params.filters?.excludeOwner,
          limit: params.limit,
          cursor: params.cursor,
        })}`,
        { signal: params.signal },
      ),
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
        range?: string
        channel?: string
      },
      signal?: AbortSignal,
    ) => request<ShareVisitsResponse>(`/api/share/visits${toQuery(params ?? {})}`, { signal }),
    cleanVisits: (type: 'bots' | 'older_than' | 'all', days?: number, password?: string) =>
      request<{ ok: true; deleted: number }>(`/api/share/visits${toQuery({ type, days })}`, {
        method: 'DELETE',
        ...(password === undefined ? {} : { body: { password } }),
      }),
    cleanVisitsForNote: (noteId: string, password: string) =>
      request<{ ok: true; deleted: number }>(`/api/share/visits${toQuery({ type: 'all', noteId })}`, {
        method: 'DELETE',
        body: { password },
      }),
    batch: (
      action: 'enable' | 'disable' | 'revoke' | 'expire' | 'move',
      noteIds: string[],
      expiresIn?: number | null,
      folderId?: string | null,
    ) => request<{ ok: true; count: number }>('/api/share/batch', { method: 'POST', body: { action, noteIds, expiresIn, folderId } }),
    extend: (noteIds: string[], days: number) =>
      request<{ ok: true; count: number; permanent: number }>('/api/share/batch', {
        method: 'POST',
        body: { action: 'extend', noteIds, extendDays: days },
      }),
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
    collections: {
      list: (signal?: AbortSignal) =>
        request<ShareCollectionListResponse>('/api/share/collections', { signal }),
      publish: (body: { targetType: 'folder' | 'tag'; targetValue: string; password?: string; expiresAt?: number | null }) =>
        request<{ id: string; slug: string }>('/api/share/collections', { method: 'POST', body }),
      patch: (id: string, body: { isEnabled?: boolean; password?: string | null; expiresAt?: number | null }) =>
        request<{ ok: true }>(`/api/share/collections/${id}`, { method: 'PATCH', body }),
      revoke: (id: string) => request<{ ok: true }>(`/api/share/collections/${id}`, { method: 'DELETE' }),
    },
    readCollection: (params: { slug: string; password?: string; cursor?: string; signal?: AbortSignal }) =>
      request<PublicCollection>(
        `/api/public/collection/${params.slug}${toQuery({ cursor: params.cursor })}`,
        { method: 'POST', body: { password: params.password }, signal: params.signal },
      ),
    read: (params: {
      slug: string
      password?: string
      /** `document.referrer`, when the visitor's browser sent one. */
      referrer?: string
      /** The `?ref=` marker from the visitor's own URL, forwarded so the worker can record it. */
      ref?: string
      signal?: AbortSignal
    }) =>
      request<PublicNote>(`/api/public/${params.slug}`, {
        method: 'POST',
        body: {
          password: params.password,
          // A long document.referrer must not turn into a 400 for a legitimate viewer; the server caps at the same length.
          referrer: params.referrer?.slice(0, LIMITS.shareReferrerMaxLength),
          ref: params.ref,
        },
        signal: params.signal,
      }),
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
    cleanVisits: (type: 'bots' | 'older_than' | 'all', days?: number, password?: string) =>
      request<{ ok: true; deleted: number }>(`/api/blog/visits${toQuery({ type, days })}`, {
        method: 'DELETE',
        ...(password === undefined ? {} : { body: { password } }),
      }),
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
    links: {
      list: (params?: { status?: string; categoryId?: string; search?: string }, signal?: AbortSignal) =>
        request<{ links: BlogLink[]; categories: BlogLinkCategory[]; counts: BlogLinkStats }>(
          `/api/blog/links${toQuery(params ?? {})}`,
          { signal },
        ),
      create: (body: Partial<BlogLink>) =>
        request<{ ok: true; link: BlogLink }>('/api/blog/links', { method: 'POST', body }),
      patch: (id: string, body: Partial<BlogLink>) =>
        request<{ ok: true; link: BlogLink }>(`/api/blog/links/${id}`, { method: 'PATCH', body }),
      remove: (id: string) =>
        request<{ ok: true }>(`/api/blog/links/${id}`, { method: 'DELETE' }),
      updateStatus: (id: string, status: BlogLinkStatus) =>
        request<{ ok: true; status: BlogLinkStatus }>(`/api/blog/links/${id}/status`, { method: 'PATCH', body: { status } }),
      togglePin: (id: string, isPinned: boolean) =>
        request<{ ok: true; isPinned: boolean }>(`/api/blog/links/${id}/pin`, { method: 'PATCH', body: { isPinned } }),
      toggleFavorite: (id: string, isFavorite: boolean) =>
        request<{ ok: true; isFavorite: boolean }>(`/api/blog/links/${id}/favorite`, { method: 'PATCH', body: { isFavorite } }),
      reorder: (orders: Array<{ id: string; sortOrder?: number; pinnedOrder?: number }>) =>
        request<{ ok: true; count: number }>('/api/blog/links/reorder', { method: 'POST', body: { orders } }),
      check: (urls: string[]) =>
        request<{
          results: Array<{
            url: string
            status: number | null
            ok: boolean
            level: 'ok' | 'warning' | 'broken' | 'skipped'
            durationMs: number
            error?: string
            finalUrl?: string
          }>
        }>('/api/blog/links/check', { method: 'POST', body: { urls } }),
      batch: (
        action: 'approve' | 'reject' | 'delete' | 'setCategory' | 'pin' | 'unpin' | 'favorite' | 'unfavorite',
        linkIds: string[],
        categoryId?: string | null,
      ) =>
        request<{ ok: true; count: number }>('/api/blog/links/batch', { method: 'POST', body: { action, linkIds, categoryId } }),
      import: (payload: { categories: Array<{ id?: string; name: string; icon?: string | null; parentId?: string | null; sortOrder?: number }>; links: Array<Partial<BlogLink>> }) =>
        request<{ ok: true; importedCategories: number; importedLinks: number }>('/api/blog/links/import', { method: 'POST', body: payload }),
    },
    linkCategories: {
      create: (body: { name: string; icon?: string | null; parentId?: string | null; sortOrder?: number }) =>
        request<{ ok: true; category: BlogLinkCategory }>('/api/blog/links/categories', { method: 'POST', body }),
      patch: (id: string, body: { name?: string; icon?: string | null; parentId?: string | null; sortOrder?: number }) =>
        request<{ ok: true; category: BlogLinkCategory }>(`/api/blog/links/categories/${id}`, { method: 'PATCH', body }),
      remove: (id: string) =>
        request<{ ok: true }>(`/api/blog/links/categories/${id}`, { method: 'DELETE' }),
    },
  },
  communityTemplates: {
    list: (before?: string) => request<{ templates: CommunityTemplate[]; hasMore: boolean; nextCursor: string | null }>(`/api/templates/community${before ? `?before=${encodeURIComponent(before)}` : ''}`),
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

