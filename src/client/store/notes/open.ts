import type { NotesState, SetNotesState } from './model'
import type { WorkspacePane } from '../ui'
import type { CachedNoteContent, OutboxItem } from '../../lib/db'
import { ApiError, CLIENT_ID } from '../../lib/api'
import { localDb } from '../../lib/db'
import { adoptNote, revalidateNote, requestNote } from './adopt'
import { replayOutbox } from './outbox'
import { scheduleShellSave } from './shell-save'
import { hasOwnContent, outboxId } from './util'
import { dirty, inheritedOutboxWrites, latestRequestedNoteIds, noteRequestEpochs, openSequences, STALE_NOTE_REQUEST, validatedRevisions } from './model'
import { useUi } from '../ui'
import { t } from '../../lib/i18n'
import { toastError } from './undo'

type OpenNoteOptions = Parameters<NotesState['openNote']>[1]

export const open = (set: SetNotesState, get: () => NotesState): Pick<NotesState, 'peekContent' | 'openNote' | 'replayPending'> => ({
  peekContent: (id) => peekContentImpl(set, get, id),
  openNote: (id, options) => openNoteImpl(set, get, id, options),
  replayPending: () => replayOutbox(get, set),
})

async function peekContentImpl(
  set: SetNotesState,
  get: () => NotesState,
  id: string,
): Promise<string | null> {
  const summary = get().notes[id]
  if (!summary || summary.deletedAt !== null)
    return null
  if (hasOwnContent(get().contents, id))
    return get().contents[id]!
  try {
    const cached = await localDb.getContent(id)
    if (cached && cached.rev === summary.rev && !dirty.has(id)) {
      set((state) => state.contents[id] !== undefined
        ? state
        : { contents: { ...state.contents, [id]: cached.content } })
      return cached.content
    }
  }
  catch {
    // Cache read failed (IndexedDB hiccup); fall through to the server fetch below.
  }
  try {
    const note = await requestNote(id)
    adoptNote(note, set, get)
    return note.content
  }
  catch {
    return null
  }
}

async function openNoteImpl(
  set: SetNotesState,
  get: () => NotesState,
  id: string,
  options?: OpenNoteOptions,
): Promise<void> {
  const uiAtRequest = useUi.getState()
  const targetPane = options?.pane ?? (uiAtRequest.workspaceSecondaryNoteId
    ? uiAtRequest.activeWorkspacePane
    : 'primary')
  const activate = options?.activate !== false
  latestRequestedNoteIds[targetPane] = id
  const requestSequence = ++openSequences[targetPane]
  const requestEpoch = noteRequestEpochs.get(id) ?? 0
  const summary = get().notes[id]
  if (!summary)
    return
  if (hasOwnContent(get().contents, id)) {
    useUi.getState().setWorkspaceNote(targetPane, id, activate)
    revalidateNote(id, summary.rev, set, get)
    return
  }
  const outcome = await openNoteFromCache(set, get, id, targetPane, requestSequence, requestEpoch, activate)
  if (outcome !== 'no-cache')
    return
  try {
    const note = await requestNote(id)
    adoptNote(note, set, get)
    validatedRevisions.set(id, note.rev)
    if (requestSequence === openSequences[targetPane] && get().notes[id]) {
      useUi.getState().setWorkspaceNote(targetPane, id, activate)
    }
  }
  catch (err) {
    handleOpenNoteError(err, id, targetPane, set)
  }
}

function handleOpenNoteError(err: unknown, id: string, targetPane: WorkspacePane, set: SetNotesState): void {
  if (err === STALE_NOTE_REQUEST)
    return
  if (err instanceof ApiError && err.isOffline) {
    useUi.getState().toast({ title: t('notes.this_note_cannot_be_opened_offline'), tone: 'warning' })
    return
  }
  if (err instanceof ApiError && err.status === 404) {
    useUi.getState().toast({ title: t('notes.this_note_no_longer_exists'), tone: 'danger' })
    if (latestRequestedNoteIds[targetPane] === id)
      latestRequestedNoteIds[targetPane] = null
    useUi.getState().removeWorkspaceNote(id)
    set((s) => {
      const notes = { ...s.notes }
      delete notes[id]
      return { notes }
    })
    return
  }
  toastError(err, t('notes.failed_to_open_note'))
}

async function openNoteFromCache(
  set: SetNotesState,
  get: () => NotesState,
  id: string,
  targetPane: WorkspacePane,
  requestSequence: number,
  requestEpoch: number,
  activate: boolean,
): Promise<'handled' | 'stale' | 'no-cache'> {
  const cached = await localDb.getContent(id)
  let currentSummary = get().notes[id]
  if (requestSequence !== openSequences[targetPane] ||
    (noteRequestEpochs.get(id) ?? 0) !== requestEpoch ||
    !currentSummary)
    return 'stale'
  if (!cached)
    return 'no-cache'
  let visibleContent = cached.content
  let visibleTitle: string | undefined
  let hasRestoredPending = false
  let hasForeignPending = false
  if (cached.writeId) {
    const restored = await restorePendingContent(id, cached, targetPane, requestSequence, requestEpoch, set, get)
    if (restored === 'stale')
      return 'stale'
    currentSummary = get().notes[id]
    visibleContent = restored.visibleContent
    visibleTitle = restored.visibleTitle
    hasRestoredPending = restored.hasRestoredPending
    hasForeignPending = restored.hasForeignPending
  }
  set((s) => ({
    notes: visibleTitle !== undefined && s.notes[id]?.title !== visibleTitle
      ? { ...s.notes, [id]: { ...s.notes[id]!, title: visibleTitle } }
      : s.notes,
    contents: { ...s.contents, [id]: visibleContent },
    ...(hasRestoredPending
      ? { saveStatus: s.online ? 'dirty' as const : 'offline' as const }
      : {}),
  }))
  if (visibleTitle !== undefined)
    scheduleShellSave(get)
  useUi.getState().setWorkspaceNote(targetPane, id, activate)
  if (hasRestoredPending) {
    if (hasForeignPending && get().online)
      void replayOutbox(get, set)
    return 'handled'
  }
  if (cached.rev === currentSummary.rev)
    validatedRevisions.set(id, currentSummary.rev)
  else
    revalidateNote(id, currentSummary.rev, set, get)
  return 'handled'
}

async function restorePendingContent(
  id: string,
  cached: CachedNoteContent,
  targetPane: WorkspacePane,
  requestSequence: number,
  requestEpoch: number,
  set: SetNotesState,
  get: () => NotesState,
): Promise<{ visibleContent: string, visibleTitle: string | undefined, hasRestoredPending: boolean, hasForeignPending: boolean } | 'stale'> {
  const outbox = await localDb.getOutbox()
  if (requestSequence !== openSequences[targetPane] ||
    (noteRequestEpochs.get(id) ?? 0) !== requestEpoch ||
    !get().notes[id])
    return 'stale'
  const existing = outbox.find((item) => item.writeId === cached.writeId && item.noteId === id)
  const currentId = outboxId(id)
  const existingContent = existing?.payload.content
  const existingTitle = existing?.payload.title
  const existingRev = existing?.payload.rev
  const validExisting = existing &&
    typeof existingContent === 'string' &&
    Number.isInteger(existingRev) &&
    (existingRev as number) >= 1
  let visibleContent = cached.content
  let visibleTitle: string | undefined
  let hasForeignPending = false
  let hasRestoredPending = false
  if (validExisting) {
    const adopted = adoptExistingPending(id, existing, existingContent as string, existingTitle, existingRev as number, cached)
    visibleContent = adopted.visibleContent
    visibleTitle = adopted.visibleTitle
    hasForeignPending = adopted.hasForeignPending
    hasRestoredPending = true
  }
  else {
    const recovered = await recoverPendingContent(id, cached, cached.writeId as string, existing, outbox, currentId)
    visibleTitle = recovered
    hasRestoredPending = true
  }
  if (hasRestoredPending) {
    const pendingIds = new Set(outbox.map((item) => item.noteId))
    for (const noteId of dirty.keys())
      pendingIds.add(noteId)
    set({ pendingCount: pendingIds.size })
  }
  return { visibleContent, visibleTitle, hasRestoredPending, hasForeignPending }
}

function adoptExistingPending(
  id: string,
  existing: OutboxItem,
  existingContent: string,
  existingTitle: unknown,
  existingRev: number,
  cached: CachedNoteContent,
): { visibleContent: string, visibleTitle: string | undefined, hasForeignPending: boolean } {
  const visibleContent = existingContent
  const visibleTitle = typeof existingTitle === 'string' ? existingTitle : undefined
  if (existing.clientId === CLIENT_ID) {
    inheritedOutboxWrites.delete(id)
    dirty.set(id, {
      ...(typeof existingTitle === 'string' ? { title: existingTitle } : {}),
      content: visibleContent,
      contentDirty: existing.payload.contentDirty !== false,
      rev: existingRev,
      writeId: existing.writeId,
      queueId: existing.id,
      dependsOnWriteId: existing.dependsOnWriteId,
      updatedAt: cached.updatedAt,
      persisted: Promise.resolve(true),
    })
    return { visibleContent, visibleTitle, hasForeignPending: false }
  }
  inheritedOutboxWrites.set(id, existing.writeId)
  return { visibleContent, visibleTitle, hasForeignPending: true }
}

async function recoverPendingContent(
  id: string,
  cached: CachedNoteContent,
  writeId: string,
  existing: OutboxItem | undefined,
  outbox: OutboxItem[],
  currentId: string,
): Promise<string | undefined> {
  inheritedOutboxWrites.delete(id)
  const recoveredTitle = cached.pendingTitle
  const recoveredContentDirty = cached.contentDirty !== false
  const queueId = outbox.some((item) => item.id === currentId)
    ? `patch-recovery:${CLIENT_ID}:${id}:${writeId}`
    : currentId
  const persisted = localDb.enqueueOutbox({
    id: queueId,
    clientId: CLIENT_ID,
    writeId,
    noteId: id,
    payload: {
      content: cached.content,
      contentDirty: recoveredContentDirty,
      rev: cached.rev,
      ...(recoveredTitle !== undefined ? { title: recoveredTitle } : {}),
    },
    attempts: 0,
    createdAt: cached.updatedAt,
  }).then(async () => {
    if (existing)
      // Best-effort journal cleanup; a stale outbox entry heals on the next replay.
      await localDb.completeOutboxItem(existing.id, existing.writeId).catch(() => { })
    return true
  }, () => false)
  dirty.set(id, {
    ...(recoveredTitle !== undefined ? { title: recoveredTitle } : {}),
    content: cached.content,
    contentDirty: recoveredContentDirty,
    rev: cached.rev,
    writeId,
    queueId,
    updatedAt: cached.updatedAt,
    persisted,
  })
  void (async () => {
    const durable = await persisted
    if (!durable) {
      useUi.getState().toast({
        title: t('notes.the_browser_could_not_save_your_offline_changes'),
        description: t('notes.keep_this_page_open_and_reconnect_as_soon_as_possible_closing_it_may_mak'),
        tone: 'danger',
        duration: 12_000,
      })
    }
  })
  return recoveredTitle
}