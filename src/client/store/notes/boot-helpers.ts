/** Extracted helpers for boot()/pull()/applySync(): moved verbatim from boot.ts method bodies, behavior unchanged. */
import type { SyncResponse } from '@shared/types';
import { api, ApiError } from '../../lib/api';
import { localDb } from '../../lib/db';
import { t } from '../../lib/i18n';
import { useSession } from '../session';
import { useUi, type WorkspacePane } from '../ui';
import { revalidateNote } from './adopt';
import { applyPendingFolderMutations } from './folder-ops';
import { latestRequestedNoteIds, notePersistCoalescer, noteState, purgedNoteIds, type NotesState, type SetNotesState } from './model';
import { folderEqual, mergeById, normalizeFolder, reconcileList, reconcileNotes, tagEqual } from './reconcile';
import { discardNoteRuntimeState } from './runtime';
import { commitAllPendingSummaryDerivations, normalizeNoteSummaryTags } from './summary';
import { collectFullSync, consolidateFullSync } from './sync';
import { hasOwnContent } from './util';
import { pickInitialNoteId } from './workspace';

export async function applyCachedShell(
  cached: NonNullable<Awaited<ReturnType<typeof localDb.loadShell>>>,
  set: SetNotesState,
  get: () => NotesState,
): Promise<void> {
  set({
    notes: Object.fromEntries(cached.notes.map((note) => {
      const normalized = normalizeNoteSummaryTags(note);
      return [normalized.id, normalized];
    })),
    folders: cached.folders.map(normalizeFolder),
    tags: cached.tags,
    cursor: cached.cursor,
    hydrated: true,
  });
  const initialId = pickInitialNoteId(get().notes, get().folders);
  if (initialId)
    await get().openNote(initialId);
}

export async function restoreWorkspaceAfterBoot(get: () => NotesState, set: SetNotesState): Promise<void> {
  const state = get();
  const notes = state.notes;
  let workspace = useUi.getState();
  for (const openId of [workspace.workspacePrimaryNoteId, workspace.workspaceSecondaryNoteId]) {
    if (openId && !notes[openId])
      workspace.removeWorkspaceNote(openId);
  }
  workspace = useUi.getState();
  const activePane = workspace.workspaceSecondaryNoteId
    ? workspace.activeWorkspacePane
    : 'primary';
  const activeId = workspace.activeNoteId;
  const latestRequestedNoteId = latestRequestedNoteIds[activePane];
  const targetId = (latestRequestedNoteId && notes[latestRequestedNoteId]
    ? latestRequestedNoteId
    : null) ??
    (activeId && notes[activeId] ? activeId : pickInitialNoteId(notes, state.folders));
  if (targetId) {
    if (activeId !== targetId || !hasOwnContent(state.contents, targetId)) {
      await get().openNote(targetId, { pane: activePane });
    }
    else {
      revalidateNote(targetId, notes[targetId]!.rev, set, get);
    }
  }
  else if (activeId) {
    useUi.getState().setActiveNote(null);
  }
  workspace = useUi.getState();
  if (workspace.workspaceSecondaryNoteId) {
    const backgroundPane: WorkspacePane = workspace.activeWorkspacePane === 'primary'
      ? 'secondary'
      : 'primary';
    const backgroundId = backgroundPane === 'primary'
      ? workspace.workspacePrimaryNoteId
      : workspace.workspaceSecondaryNoteId;
    if (backgroundId && notes[backgroundId] && !hasOwnContent(get().contents, backgroundId)) {
      await get().openNote(backgroundId, { pane: backgroundPane, activate: false });
    }
  }
}

export async function pullWhileFull(payload: SyncResponse | null, get: () => NotesState): Promise<SyncResponse | null> {
  let fullRounds = 0;
  while (payload?.full) {
    if (fullRounds++ >= 2)
      throw new Error(t('notes.data_kept_changing_during_the_full_sync_try_again_later'));
    payload = await pullFullRound(payload, get);
  }
  return payload;
}


async function pullFullRound(payload: SyncResponse, get: () => NotesState): Promise<SyncResponse | null> {
  const snapshot = await collectFullSync(payload);
  let catchup = snapshot.cursor > 0 ? await api.sync(snapshot.cursor) : null;
  const increments: SyncResponse[] = [];
  const catchupCursors = new Set<number>();
  while (catchup && !catchup.full) {
    increments.push(catchup);
    if (!catchup.hasMore)
      break;
    if (catchupCursors.has(catchup.cursor))
      throw new Error(t('notes.sync_pagination_data_is_incomplete'));
    catchupCursors.add(catchup.cursor);
    catchup = await api.sync(catchup.cursor);
  }
  if (catchup?.full)
    return catchup;
  const consolidated = consolidateFullSync(snapshot, increments);
  get().applySync(consolidated);
  return catchup?.hasMore ? await api.sync(consolidated.cursor) : null;
}

export async function pullIncremental(payload: SyncResponse, get: () => NotesState): Promise<void> {
  const incrementalCursors = new Set<number>();
  while (payload.hasMore) {
    if (incrementalCursors.has(payload.cursor))
      throw new Error(t('notes.sync_pagination_data_is_incomplete'));
    incrementalCursors.add(payload.cursor);
    const next = await api.sync(payload.cursor);
    if (next.full) {
      noteState.forcePullQueued = true;
      break;
    }
    payload = next;
    get().applySync(payload);
  }
}

export async function handlePullError(err: unknown, set: SetNotesState): Promise<void> {
  if (err instanceof ApiError && err.isOffline)
    set({ online: false });
  else if (err instanceof ApiError && err.isAuth) {
    // The in-memory persist queue is already drained; a failed disk flush is retried on the next save.
    await notePersistCoalescer.flush().catch(() => {});
    commitAllPendingSummaryDerivations();
    useSession.setState({ status: 'anonymous' });
  }
  else
    throw err;
}

export function advancePurgedNoteIds(
  payload: SyncResponse,
  deletedByPayload: Set<string>,
  incomingIds: Set<string> | null,
): void {
  for (const [id, cursor] of purgedNoteIds) {
    if (cursor !== null && payload.cursor > cursor) {
      purgedNoteIds.delete(id);
    }
    else if (cursor === null &&
      (deletedByPayload.has(id) || (incomingIds && !incomingIds.has(id)))) {
      purgedNoteIds.set(id, payload.cursor);
    }
  }
}

export function reconcileFromPayload(
  state: NotesState,
  payload: SyncResponse,
): Pick<NotesState, 'notes' | 'folders' | 'tags' | 'cursor'> | null {
  const notes = reconcileNotes(state.notes, payload.notes, payload.deletions, payload.full);
  const replaceFacets = payload.full || payload.facetsFull;
  const remoteFolders = replaceFacets
    ? reconcileList(state.folders, payload.folders, folderEqual)
    : mergeById(state.folders, payload.folders, payload.deletions, 'folder', folderEqual);
  const folders = applyPendingFolderMutations(remoteFolders);
  const tags = replaceFacets
    ? reconcileList(state.tags, payload.tags, tagEqual)
    : mergeById(state.tags, payload.tags, payload.deletions, 'tag', tagEqual);
  if (notes === state.notes &&
    folders === state.folders &&
    tags === state.tags &&
    payload.cursor === state.cursor) {
    return null;
  }
  if (folders !== state.folders)
    noteState.folderStateGeneration++;
  if (tags !== state.tags)
    noteState.tagStateGeneration++;
  localDb.scheduleShellSave({
    notes: Object.values(notes),
    folders,
    tags,
    cursor: payload.cursor,
  });
  return { notes, folders, tags, cursor: payload.cursor };
}

/** Local cleanup in applySync: drop runtime state for deleted notes and detach them from the workspace. */
export function discardSyncedAwayNotes(candidates: Iterable<string>, get: () => NotesState): void {
  for (const id of new Set(candidates)) {
    if (get().notes[id])
      continue;
    discardNoteRuntimeState(id);
    useUi.getState().removeWorkspaceNote(id);
    void localDb.dropContent(id);
  }
}

