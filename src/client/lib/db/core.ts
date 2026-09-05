import { clear as clearStore, del, getMany, set, setMany, update } from 'idb-keyval';
import type { Folder, NoteSummary, SessionInfo, Tag } from '@shared/types';
import { delMany, store, KEY, supportsUserNamespaces } from './keys';
import type { ShellData, ShellBaseline, TemplateLibraryData, OutboxItem, CachedNoteContent } from './types';
import { normalizeOutbox, safeGet, safeSet, userScopedKey, migrateLegacyData, mergedNoteIds, withShellIndexLock } from './store-io';
import { summariesEqual, foldersEqual, tagsEqual, isRecord, isPublicUser, isSiteInfo, isFiniteNumber, isNoteSummary, isFolder, isTag, isNoteTemplateCategory, isNoteTemplate } from './validators';
export 
let shouldForceUserNamespaces = false
export 
// The shell cache is two-level: one `note-summary:<id>` key per note plus a
// lightweight `noteIndex` id list. A typing-derived summary commit therefore
// only upserts the one changed note instead of re-serializing the whole vault;
// boot still reads every summary in a single getMany over the index. The shell
// is a read cache for the next boot, not a source of truth: the coalescing
// window collapses bursts into one flush (a lost tail at most delays the
// cached shell by one window on abrupt close), and the flush tail chain keeps
// each diff-based write from racing the previous one.
const SHELL_SAVE_COALESCE_MS = 800
export 
const SHELL_SET_CHUNK = 400
export 
let shellSaveTimer = 0
export 
let pendingShell: ShellData | null = null
export 
let pendingShellUserId: string | null = null
export 
let activeUserId: string | null = null
export 
let shellBaseline: ShellBaseline | null = null
export 
let shellFlushTail: Promise<void> = Promise.resolve()
export 
let shellEpoch = 0
export function resetShellIdentity(): void {
  shellBaseline = null
  shellEpoch++
}
export async function bindLocalUser(userId: string): Promise<void> {
  if (activeUserId === userId) {
    if (shouldForceUserNamespaces && !supportsUserNamespaces) {
      await clearLocalData()
      shouldForceUserNamespaces = false
    }
    await set(KEY.userId, userId, store)
    return
  }
  if (!supportsUserNamespaces) {
    const storedUserId = await safeGet<string>(KEY.userId)
    if (storedUserId !== userId) {
      try {
        await clearLocalData()
        shouldForceUserNamespaces = false
      } catch (error) {
        activeUserId = userId
        resetShellIdentity()
        shouldForceUserNamespaces = true
        throw error
      }
    }
    activeUserId = userId
    resetShellIdentity()
    await set(KEY.userId, userId, store)
    return
  }
  activeUserId = userId
  resetShellIdentity()
  const legacyUserId = await safeGet<string>(KEY.userId)
  if (legacyUserId === userId) await migrateLegacyData(userId)
  await set(KEY.userId, userId, store)
}


export const localDb = {
  async loadSession(): Promise<SessionInfo | null> {
    const value = await safeGet<unknown>(KEY.session)
    if (!isRecord(value) || !isPublicUser(value.user) || !isSiteInfo(value.site)) return null
    if (value.settings !== null && !isRecord(value.settings)) return null
    if (await safeGet<string>(KEY.userId) !== value.user.id) return null
    try {
      await bindLocalUser(value.user.id)
    } catch {
      return null
    }
    return value as unknown as SessionInfo
  },

  async saveSession(info: SessionInfo): Promise<void> {
    if (!info.user) return
    try {
      await bindLocalUser(info.user.id)
      await set(KEY.session, info, store)
    } catch {
    }
  },

  clearSession: () => del(KEY.session, store).catch(() => {}),

  async loadShell(): Promise<{
    notes: NoteSummary[]
    folders: Folder[]
    tags: Tag[]
    cursor: number
  } | null> {
    const userId = activeUserId
    if (!userId) return null
    const shellKeys = [
      userScopedKey(KEY.noteIndex, userId),
      userScopedKey(KEY.folders, userId),
      userScopedKey(KEY.tags, userId),
      userScopedKey(KEY.cursor, userId),
      userScopedKey(KEY.notes, userId),
    ]
    try {
      const values = await getMany(shellKeys, store)
      const index = values[0]
      const folders = values[1]
      const tags = values[2]
      const cursor = values[3]
      const legacyNotes = values[4]
      let notes: NoteSummary[] | null = null
      if (Array.isArray(index) && index.every((id) => typeof id === 'string')) {
        const ids = index as string[]
        const summaries = await getMany(ids.map((id) => userScopedKey(KEY.summary(id), userId)), store)
        if (summaries.every(isNoteSummary)) notes = summaries as NoteSummary[]
      }
      else if (Array.isArray(legacyNotes) && legacyNotes.every(isNoteSummary)) {
        notes = legacyNotes as NoteSummary[]
        const writes: [string, unknown][] = notes.map((note) => [userScopedKey(KEY.summary(note.id), userId), note])
        writes.push([userScopedKey(KEY.noteIndex, userId), notes.map((note) => note.id)])
        for (let start = 0; start < writes.length; start += SHELL_SET_CHUNK)
          await setMany(writes.slice(start, start + SHELL_SET_CHUNK), store)
        await del(userScopedKey(KEY.notes, userId), store)
      }
      if (!notes ||
        !Array.isArray(folders) || !folders.every(isFolder) ||
        !Array.isArray(tags) || !tags.every(isTag) ||
        typeof cursor !== 'number' || !Number.isSafeInteger(cursor) || cursor < 0
      ) {
        return null
      }
      shellBaseline = {
        userId,
        notes: new Map(notes.map((note) => [note.id, note])),
        folders: folders as Folder[],
        tags: tags as Tag[],
        cursor,
      }
      return {
        notes,
        folders: folders as Folder[],
        tags: tags as Tag[],
        cursor,
      }
    } catch {
      return null
    }
  },

  async saveShell(data: ShellData, userId = activeUserId) {
    const epoch = shellEpoch
    const run = async () => {
      try {
        if (epoch !== shellEpoch) return
        const baseline = userId !== null && shellBaseline?.userId === userId ? shellBaseline : null
        const targetNotes = new Map(data.notes.map((note) => [note.id, note] as const))
        const writes: [string, unknown][] = []
        let indexChanged = baseline === null
        if (baseline) {
          for (const note of data.notes) {
            const previous = baseline.notes.get(note.id)
            if (previous === undefined || !summariesEqual(previous, note)) {
              writes.push([userScopedKey(KEY.summary(note.id), userId), note])
              if (previous === undefined) indexChanged = true
            }
          }
          const removedIds: string[] = []
          for (const id of baseline.notes.keys()) {
            if (!targetNotes.has(id)) removedIds.push(id)
          }
          if (removedIds.length) {
            indexChanged = true
            const removedKeys = removedIds.map((id) => userScopedKey(KEY.summary(id), userId))
            if (delMany) await delMany(removedKeys, store)
            else for (const key of removedKeys) await del(key, store)
          }
          if (indexChanged) {
            const indexKey = userScopedKey(KEY.noteIndex, userId)
            const written = await withShellIndexLock(userId, async () => {
              const merged = await mergedNoteIds(userId, [...targetNotes.keys()], new Set(removedIds))
              await set(indexKey, merged, store)
              return true
            })
            if (written !== true) writes.push([indexKey, [...targetNotes.keys()]])
          }
        }
        else {
          for (const note of data.notes)
            writes.push([userScopedKey(KEY.summary(note.id), userId), note])
          writes.push([userScopedKey(KEY.noteIndex, userId), data.notes.map((note) => note.id)])
        }
        if (!baseline || !foldersEqual(baseline.folders, data.folders))
          writes.push([userScopedKey(KEY.folders, userId), data.folders])
        if (!baseline || !tagsEqual(baseline.tags, data.tags))
          writes.push([userScopedKey(KEY.tags, userId), data.tags])
        if (!baseline || baseline.cursor !== data.cursor)
          writes.push([userScopedKey(KEY.cursor, userId), data.cursor])
        if (writes.length) {
          for (let start = 0; start < writes.length; start += SHELL_SET_CHUNK)
            await setMany(writes.slice(start, start + SHELL_SET_CHUNK), store)
        }
        if (epoch === shellEpoch) {
          shellBaseline = {
            userId: userId ?? '',
            notes: targetNotes,
            folders: data.folders,
            tags: data.tags,
            cursor: data.cursor,
          }
        }
      } catch {
      }
    }
    const queued = shellFlushTail.then(run, run)
    shellFlushTail = queued.catch(() => {})
    await queued
  },

  scheduleShellSave(data: ShellData) {
    pendingShell = data
    pendingShellUserId = activeUserId
    window.clearTimeout(shellSaveTimer)
    shellSaveTimer = window.setTimeout(() => {
      const snapshot = pendingShell
      const userId = pendingShellUserId
      pendingShell = null
      pendingShellUserId = null
      if (snapshot) void localDb.saveShell(snapshot, userId)
    }, SHELL_SAVE_COALESCE_MS)
  },

  async getContent(id: string): Promise<CachedNoteContent | undefined> {
    const value = await safeGet<unknown>(userScopedKey(KEY.content(id)))
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const cached = value as Partial<CachedNoteContent>
    if (
      typeof cached.content !== 'string' ||
      !Number.isSafeInteger(cached.rev) ||
      cached.rev! < 1 ||
      typeof cached.updatedAt !== 'number' ||
      !Number.isFinite(cached.updatedAt) ||
      (cached.writeId !== undefined && typeof cached.writeId !== 'string') ||
      (cached.pendingTitle !== undefined && typeof cached.pendingTitle !== 'string') ||
      (cached.contentDirty !== undefined && typeof cached.contentDirty !== 'boolean')
    ) {
      return undefined
    }
    return cached as CachedNoteContent
  },
  setContent: (id: string, value: CachedNoteContent) =>
    safeSet(userScopedKey(KEY.content(id)), value),
  dropContent: (id: string) => del(userScopedKey(KEY.content(id)), store).catch(() => {}),

  async loadTemplateLibrary(): Promise<TemplateLibraryData | null> {
    const value = await safeGet<unknown>(userScopedKey(KEY.templateLibrary))
    if (!isRecord(value)) return null
    const categories = Array.isArray(value.categories)
      ? value.categories.filter(isNoteTemplateCategory)
      : []
    const templates = Array.isArray(value.templates)
      ? value.templates.filter(isNoteTemplate).map((template) => ({ ...template, tags: template.tags ?? [] }))
      : []
    const seedVersion = isFiniteNumber(value.seedVersion) ? value.seedVersion : 0
    return { categories, templates, seedVersion }
  },

  saveTemplateLibrary: (data: TemplateLibraryData) =>
    safeSet(userScopedKey(KEY.templateLibrary), data),

  getOutbox: async (): Promise<OutboxItem[]> => normalizeOutbox(await safeGet<unknown>(userScopedKey(KEY.outbox))),

  enqueueOutbox(item: OutboxItem): Promise<void> {
    return update<OutboxItem[]>(
      userScopedKey(KEY.outbox),
      (current) => {
        const items = normalizeOutbox(current)
        const previous = items.find((entry) => entry.id === item.id)
        return [
          ...items.filter((entry) => entry.id !== item.id),
          { ...item, createdAt: previous?.createdAt ?? item.createdAt },
        ]
      },
      store,
    )
  },

  completeOutboxItem(id: string, writeId: string): Promise<void> {
    return update<OutboxItem[]>(
      userScopedKey(KEY.outbox),
      (current) => normalizeOutbox(current)
        .filter((item) => item.id !== id || item.writeId !== writeId),
      store,
    )
  },

  updateOutboxRevision(
    id: string,
    writeId: string,
    rev: number,
    preserveVersion = false,
  ): Promise<void> {
    return update<OutboxItem[]>(
      userScopedKey(KEY.outbox),
      (current) => normalizeOutbox(current)
        .map((item) => item.id === id && item.writeId === writeId
          ? {
              ...item,
              dependsOnWriteId: undefined,
              payload: {
                ...item.payload,
                rev,
                ...(preserveVersion ? { preserveVersion: true } : {}),
              },
            }
          : item),
      store,
    )
  },

  setOutboxRecoveryId(id: string, writeId: string, recoveryId: string): Promise<void> {
    return update<OutboxItem[]>(
      userScopedKey(KEY.outbox),
      (current) => normalizeOutbox(current)
        .map((item) => item.id === id && item.writeId === writeId
          ? { ...item, payload: { ...item.payload, recoveryId } }
          : item),
      store,
    )
  },

  advanceOutboxDependents(
    noteId: string,
    sourceWriteId: string,
    expectedRev: number,
    nextRev: number,
  ): Promise<void> {
    return update<OutboxItem[]>(
      userScopedKey(KEY.outbox),
      (current) => normalizeOutbox(current)
        .map((item) => item.noteId === noteId &&
            item.dependsOnWriteId === sourceWriteId &&
            item.payload.rev === expectedRev
          ? { ...item, dependsOnWriteId: undefined, payload: { ...item.payload, rev: nextRev } }
          : item),
      store,
    )
  },

  markOutboxFailure(id: string, writeId: string, message: string): Promise<void> {
    return update<OutboxItem[]>(
      userScopedKey(KEY.outbox),
      (current) => normalizeOutbox(current)
        .map((item) => item.id === id && item.writeId === writeId
          ? { ...item, attempts: item.attempts + 1, lastError: message }
          : item),
      store,
    )
  },

  async withOutboxReplayLock(owner: string, task: () => Promise<void>): Promise<boolean> {
    const lockName = activeUserId ? `inkstone-outbox-replay:${activeUserId}` : 'inkstone-outbox-replay'
    if (typeof navigator !== 'undefined' && navigator.locks?.request) {
      let isAcquired = false
      await navigator.locks.request(
        lockName,
        async () => {
          isAcquired = true
          await task()
        },
      )
      return isAcquired
    }

    const leaseMs = 90_000
    let isAcquired = false
    const deadline = Date.now() + 30_000
    while (!isAcquired && Date.now() < deadline) {
      const now = Date.now()
      await update<{ owner: string; expiresAt: number } | null>(
        userScopedKey(KEY.outboxReplayLease),
        (current) => {
          if (!current || current.expiresAt <= now) {
            isAcquired = true
            return { owner, expiresAt: now + leaseMs }
          }
          return current
        },
        store,
      )
      if (!isAcquired) {
        await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 50))
      }
    }
    if (!isAcquired) return false

    const heartbeat = globalThis.setInterval(() => {
      void update<{ owner: string; expiresAt: number } | null>(
        userScopedKey(KEY.outboxReplayLease),
        (current) => current?.owner === owner
          ? { owner, expiresAt: Date.now() + leaseMs }
          : current ?? null,
        store,
      ).catch(() => {})
    }, 20_000)
    try {
      await task()
      return true
    } finally {
      globalThis.clearInterval(heartbeat)
      await update<{ owner: string; expiresAt: number } | null>(
        userScopedKey(KEY.outboxReplayLease),
        (current) => current?.owner === owner ? null : current ?? null,
        store,
      ).catch(() => {})
    }
  },

  async bindUser(userId: string): Promise<void> {
    await bindLocalUser(userId)
  },

  async clear(): Promise<void> {
    try {
      await clearLocalData()
    } catch {
      await Promise.allSettled([
        del(KEY.session, store),
        del(KEY.userId, store),
      ])
    }
    activeUserId = null
    shouldForceUserNamespaces = false
  },
}
export async function clearLocalData(): Promise<void> {
  window.clearTimeout(shellSaveTimer)
  shellSaveTimer = 0
  pendingShell = null
  pendingShellUserId = null
  shellBaseline = null
  shellEpoch++
  shellFlushTail = Promise.resolve()
  await clearStore(store)
}
