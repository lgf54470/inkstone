/** Outbox replay machinery: dependency-ordered flush, conflict rebase, and 404 recovery (extracted from outbox.ts). */
import type { Note } from '@shared/types'
import { api, ApiError, CLIENT_ID } from '../../lib/api'
import { localDb, publishBroadcast, type BroadcastPayload, type OutboxItem } from '../../lib/db'
import { errorMessage } from '../../lib/errors'
import { t } from '../../lib/i18n'
import { useUi } from '../ui'
import { adoptNote } from './adopt'
import { advanceDirtyRevision, advanceDependentOutboxWrites, deletionCursorFrom, discardNoteRuntimeState, rebaseQueuedWrite, settleSavedPatch } from './runtime'
import { newRecoveryNoteId, outboxAttemptKey, replayAttemptKey } from './util'
import { scheduleShellSave } from './shell-save'
import { workspacePaneForNote } from './workspace'
import { dirty, pendingNoteCreates, recoveredOutboxWrites, type DirtyNoteWrite, type NotesState, type RecoveryResult, type SetNotesState } from './model'

function dirtyOutboxItem(noteId: string, pending: DirtyNoteWrite): OutboxItem {
  return {
    id: pending.queueId,
    clientId: CLIENT_ID,
    writeId: pending.writeId,
    dependsOnWriteId: pending.dependsOnWriteId,
    noteId,
    payload: {
      content: pending.content,
      contentDirty: pending.contentDirty,
      rev: pending.rev,
      ...(pending.title !== undefined ? { title: pending.title } : {}),
    },
    attempts: 0,
    createdAt: pending.updatedAt,
  }
}

async function loadReplayOutbox(): Promise<OutboxItem[]> {
  for (let round = 0; round < 4; round++) {
    const snapshot = [...dirty.entries()]
    const durable = await Promise.all(snapshot.map(([, pending]) => pending.persisted))
    let hasRetried = false
    snapshot.forEach(([noteId, pending], index) => {
      if (durable[index] || dirty.get(noteId)?.writeId !== pending.writeId)
        return
      const persisted = localDb.enqueueOutbox(dirtyOutboxItem(noteId, pending)).then(() => true, () => false)
      dirty.set(noteId, { ...pending, persisted })
      hasRetried = true
    })
    if (!hasRetried)
      break
  }
  const outbox = await localDb.getOutbox()
  const latestSlots = new Map([...dirty.values()].map((pending) => [pending.queueId, pending.writeId]))
  return sortOutboxForReplay(outbox.filter((item) => {
    const latestWriteId = latestSlots.get(item.id)
    return !latestWriteId || latestWriteId === item.writeId
  }))
}

function sortOutboxForReplay(items: OutboxItem[]): OutboxItem[] {
  const stable = items
    .slice()
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id))
  const byWriteId = new Map(stable.map((item) => [item.writeId, item]))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const result: OutboxItem[] = []
  const visit = (item: OutboxItem): void => {
    if (visited.has(item.writeId))
      return
    if (visiting.has(item.writeId)) {
      return
    }
    visiting.add(item.writeId)
    const dependency = item.dependsOnWriteId ? byWriteId.get(item.dependsOnWriteId) : undefined
    if (dependency)
      visit(dependency)
    visiting.delete(item.writeId)
    if (!visited.has(item.writeId)) {
      visited.add(item.writeId)
      result.push(item)
    }
  }
  for (const item of stable)
    visit(item)
  return result
}

async function completeOutboxQuietly(id: string, writeId: string): Promise<boolean> {
  try {
    await localDb.completeOutboxItem(id, writeId)
    return true
  }
  catch {
    useUi.getState().toast({
      title: t('notes.could_not_update_the_offline_queue_state'),
      description: t('notes.the_server_received_your_content_but_the_browser_could_not_update_its_lo'),
      tone: 'warning',
      duration: 12_000,
    })
    return false
  }
}

function rememberRecoveredOutbox(id: string, writeId: string, result: RecoveryResult): void {
  const key = `${id}\u0000${writeId}`
  recoveredOutboxWrites.set(key, result)
  if (recoveredOutboxWrites.size > 200) {
    const oldest = recoveredOutboxWrites.keys().next().value as string | undefined
    if (oldest)
      recoveredOutboxWrites.delete(oldest)
  }
}

async function settleRecoveredOutbox(id: string, writeId: string, result: RecoveryResult): Promise<boolean> {
  rememberRecoveredOutbox(id, writeId, result)
  const completed = await completeOutboxQuietly(id, writeId)
  if (completed)
    recoveredOutboxWrites.delete(`${id}\u0000${writeId}`)
  return completed
}

async function retryRecoveredOutbox(item: OutboxItem): Promise<boolean> {
  const key = outboxAttemptKey(item)
  const result = recoveredOutboxWrites.get(key)
  if (!result)
    return false
  try {
    await localDb.completeOutboxItem(item.id, item.writeId)
    recoveredOutboxWrites.delete(key)
    publishOutboxResult(item, result)
  }
  catch {
    // Best-effort journal cleanup; the in-memory recovered-write map stays authoritative for this session.
  }
  return true
}

export type OutboxResult = Extract<BroadcastPayload, { type: 'outbox-result' }>

function publishOutboxResult(item: OutboxItem, result: Pick<OutboxResult, 'outcome' | 'recoveryReason' | 'rev' | 'updatedAt' | 'savedTitle' | 'savedNote' | 'copyId'>): void {
  if (!item.clientId || item.clientId === CLIENT_ID)
    return
  publishBroadcast({
    type: 'outbox-result',
    clientId: CLIENT_ID,
    targetClientId: item.clientId,
    noteId: item.noteId,
    writeId: item.writeId,
    ...result,
  })
}

export function showOfflineRecoveryToast(get: () => NotesState, copyId: string, conflict: boolean): void {
  useUi.getState().toast({
    title: conflict
      ? t('notes.offline_changes_conflict_with_the_remote_version')
      : t('notes.the_original_note_has_been_deleted'),
    description: conflict
      ? t('notes.your_offline_changes_were_saved_as_a_copy_the_original_note_keeps_the_re')
      : t('notes.offline_modifications_have_been_restored_as_a_new_note'),
    tone: 'warning',
    duration: 9000,
    action: {
      label: conflict ? t('notes.open_a_copy') : t('common.open'),
      run: () => void get().openNote(copyId),
    },
  })
}

export async function replayOutboxNow(get: () => NotesState, set: SetNotesState): Promise<void> {
  const attempted = new Set<string>()
  let isStoppedOffline = false
  for (let round = 0; round < 20 && !isStoppedOffline; round++) {
    const outbox = await loadReplayOutbox()
    const batch = outbox.filter((item) => !attempted.has(replayAttemptKey(item)))
    if (!batch.length)
      break
    let isRestartRound = false
    for (const item of batch) {
      attempted.add(replayAttemptKey(item))
      const outcome = await replayOutboxItem(item, batch, get, set)
      if (outcome === 'restart') {
        isRestartRound = true
        break
      }
      if (outcome === 'stop') {
        isStoppedOffline = true
        break
      }
    }
    if (isRestartRound)
      continue
  }
  const remaining = await localDb.getOutbox()
  set({ pendingCount: pendingNoteCount(remaining) })
}

export function pendingNoteCount(outbox: OutboxItem[]): number {
  const ids = new Set(outbox.map((item) => item.noteId))
  for (const id of dirty.keys())
    ids.add(id)
  return ids.size
}

type ReplayOutcome = 'ok' | 'restart' | 'stop'

interface ReplayPayload {
  content: string
  contentDirty: boolean
  title?: string
  rev: number
}

async function prepareReplayPayload(item: OutboxItem, get: () => NotesState): Promise<ReplayPayload | null> {
  const pendingCreate = pendingNoteCreates.get(item.noteId)
  if (pendingCreate) {
    try {
      await pendingCreate
    }
    catch {
      return null
    }
  }
  if (await retryRecoveredOutbox(item))
    return null
  const currentLocal = item.clientId === CLIENT_ID ? dirty.get(item.noteId) : undefined
  if (currentLocal?.queueId === item.id && currentLocal.writeId !== item.writeId) {
    await currentLocal.persisted
    return null
  }
  let latestLocal = item.clientId === CLIENT_ID && dirty.get(item.noteId)?.writeId === item.writeId
    ? dirty.get(item.noteId)
    : undefined
  if (latestLocal)
    await latestLocal.persisted
  const durableRev = item.payload.rev
  if (latestLocal && Number.isInteger(durableRev) && (durableRev as number) > latestLocal.rev) {
    advanceDirtyRevision(item.noteId, latestLocal.rev, durableRev as number, get)
    latestLocal = dirty.get(item.noteId)
  }
  const content = latestLocal?.content ?? item.payload.content
  const contentDirty = latestLocal?.contentDirty ?? item.payload.contentDirty !== false
  const queuedTitle = latestLocal?.title ?? item.payload.title
  const title = typeof queuedTitle === 'string' ? queuedTitle : undefined
  const rev = latestLocal?.rev ?? item.payload.rev
  if (typeof content !== 'string' || !Number.isInteger(rev) || (rev as number) < 1) {
    // The mark is best-effort; in-memory attempts stay authoritative for this session.
    await localDb.markOutboxFailure(item.id, item.writeId, 'invalid offline journal payload').catch(() => { })
    return null
  }
  return {
    content,
    contentDirty,
    ...(title !== undefined ? { title } : {}),
    rev: rev as number,
  }
}

async function replayOutboxItem(item: OutboxItem, batch: OutboxItem[], get: () => NotesState, set: SetNotesState): Promise<ReplayOutcome> {
  const payload = await prepareReplayPayload(item, get)
  if (!payload)
    return 'ok'
  try {
    await patchOutboxItem(item, payload, batch, get, set)
    return 'ok'
  }
  catch (err) {
    if (err instanceof ApiError && err.isConflict)
      return handleConflictError(err, item, payload, batch, get, set)
    if (err instanceof ApiError && err.status === 404)
      return handleNotFoundError(err, item, payload, get, set)
    if (err instanceof ApiError && err.isOffline) {
      set({ online: false, saveStatus: 'offline' })
      return 'stop'
    }
    if (err instanceof ApiError && err.isAuth) {
      location.reload()
      return 'stop'
    }
    // The mark is best-effort; in-memory attempts stay authoritative for this session.
    await localDb.markOutboxFailure(
      item.id,
      item.writeId,
      errorMessage(err),
    ).catch(() => {})
    return 'ok'
  }
}

async function patchOutboxItem(item: OutboxItem, payload: ReplayPayload, batch: OutboxItem[], get: () => NotesState, set: SetNotesState): Promise<void> {
  const saved = await api.notes.patch(item.noteId, {
    rev: payload.rev,
    ...(payload.contentDirty ? { content: payload.content } : {}),
    ...(typeof payload.title === 'string' ? { title: payload.title } : {}),
    ...(item.payload.preserveVersion === true ? { preserveVersion: true } : {}),
  })
  if (item.clientId === CLIENT_ID)
    await settleSavedPatch(item.noteId, { content: payload.content, writeId: item.writeId }, saved, set, get)
  else
    adoptNote(saved, set, get)
  if (typeof payload.title === 'string')
    void get().pull({ force: true })
  await advanceDependentOutboxWrites(
    item.noteId,
    item.writeId,
    payload.rev,
    saved.rev,
    get,
    true,
    batch,
  )
  const completed = await completeOutboxQuietly(item.id, item.writeId)
  if (completed) {
    publishOutboxResult(item, {
      outcome: 'saved',
      rev: saved.rev,
      updatedAt: saved.updatedAt,
      savedTitle: saved.title,
      ...(!payload.contentDirty && saved.content !== payload.content ? { savedNote: saved } : {}),
    })
    set({ lastSavedAt: Date.now(), online: true })
  }
}

async function handleConflictError(err: ApiError, item: OutboxItem, payload: ReplayPayload, batch: OutboxItem[], get: () => NotesState, set: SetNotesState): Promise<ReplayOutcome> {
  const localPending = item.clientId === CLIENT_ID ? dirty.get(item.noteId) : undefined
  const localContent = localPending?.content ?? payload.content
  const localContentDirty = localPending?.contentDirty ?? payload.contentDirty
  const localTitle = localPending?.title ?? payload.title
  const server = (err.details as { server?: Note } | undefined)?.server
  const acknowledged = server && (!localContentDirty || server.content === localContent) &&
    (typeof localTitle !== 'string' || server.title === localTitle)
    ? (localPending ?? { content: payload.content, writeId: item.writeId })
    : server && (!payload.contentDirty || server.content === payload.content) &&
      (typeof payload.title !== 'string' || server.title === payload.title)
      ? { content: payload.content, writeId: item.writeId }
      : null
  if (server && acknowledged) {
    if (item.clientId === CLIENT_ID)
      await settleSavedPatch(item.noteId, acknowledged, server, set, get)
    else
      adoptNote(server, set, get)
    await advanceDependentOutboxWrites(
      item.noteId,
      item.writeId,
      payload.rev,
      server.rev,
      get,
      true,
      batch,
    )
    const completed = await completeOutboxQuietly(item.id, acknowledged.writeId)
    if (completed) {
      publishOutboxResult(item, {
        outcome: 'saved',
        rev: server.rev,
        updatedAt: server.updatedAt,
        savedTitle: server.title,
        ...(!localContentDirty && server.content !== localContent ? { savedNote: server } : {}),
      })
      set({ lastSavedAt: Date.now(), online: true })
    }
    return 'ok'
  }
  if (server) {
    const isRestartRound = await rebaseQueuedWrite(item, localPending, server, set, get)
    return isRestartRound ? 'restart' : 'ok'
  }
  // The mark is best-effort; in-memory attempts stay authoritative for this session.
  await localDb.markOutboxFailure(item.id, item.writeId, 'conflict response did not include the server note').catch(() => { })
  return 'ok'
}

async function handleNotFoundError(err: ApiError, item: OutboxItem, payload: ReplayPayload, get: () => NotesState, set: SetNotesState): Promise<ReplayOutcome> {
  const localPending = item.clientId === CLIENT_ID ? dirty.get(item.noteId) : undefined
  const localContent = localPending?.content ?? payload.content
  const localTitle = localPending?.title ?? payload.title ?? get().notes[item.noteId]?.title ?? ''
  const recoveredWriteId = localPending?.writeId ?? item.writeId
  let recoveryId = typeof item.payload.recoveryId === 'string'
    ? item.payload.recoveryId
    : ''
  if (!recoveryId) {
    recoveryId = newRecoveryNoteId()
    try {
      await localDb.setOutboxRecoveryId(item.id, recoveredWriteId, recoveryId)
      item.payload = { ...item.payload, recoveryId }
    }
    catch {
      // The mark is best-effort; in-memory attempts stay authoritative for this session.
      await localDb.markOutboxFailure(item.id, recoveredWriteId, 'could not persist the recovery note id').catch(() => { })
      return 'ok'
    }
  }
  const copyId = await get().createNote({ id: recoveryId, title: localTitle, content: localContent, open: false })
  if (!copyId)
    return 'ok'
  const recoveredLatest = !localPending || dirty.get(item.noteId)?.writeId === localPending.writeId
  if (localPending && recoveredLatest)
    dirty.delete(item.noteId)
  const recoveryResult = { outcome: 'recovered' as const, recoveryReason: 'deleted' as const, copyId }
  const completed = await settleRecoveredOutbox(item.id, recoveredWriteId, recoveryResult)
  if (completed)
    publishOutboxResult(item, recoveryResult)
  if (item.clientId === CLIENT_ID) {
    if (recoveredLatest)
      discardRecoveredNoteLocally(item, err, copyId, get, set)
    showOfflineRecoveryToast(get, copyId, false)
  }
  return 'ok'
}

async function discardRecoveredNoteLocally(item: OutboxItem, err: ApiError, copyId: string, get: () => NotesState, set: SetNotesState): Promise<void> {
  const openPane = workspacePaneForNote(item.noteId)
  const wasActive = useUi.getState().activeNoteId === item.noteId
  const deletionCursor = deletionCursorFrom(err)
  discardNoteRuntimeState(item.noteId, deletionCursor)
  set((state) => {
    const notes = { ...state.notes }
    const contents = { ...state.contents }
    delete notes[item.noteId]
    delete contents[item.noteId]
    return { notes, contents, saveStatus: dirty.size ? 'dirty' : 'synced' }
  })
  scheduleShellSave(get)
  void localDb.dropContent(item.noteId)
  if (openPane)
    useUi.getState().setWorkspaceNote(openPane, copyId, wasActive)
  if (deletionCursor === null)
    // Best-effort follow-up pull; the next event or manual refresh retries.
    void get().pull({ force: true }).catch(() => { })
}