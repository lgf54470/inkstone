import type { NotesState, SetNotesState, PendingNoteMutation } from './model';
import { countText, deriveExcerpt, extractTags } from '@shared/markdown-utils';
import { LIMITS } from '@shared/constants';
import type { Note } from '@shared/types';
import { api, ApiError } from '../../lib/api';
import { localDb } from '../../lib/db';
import { adoptNote } from './adopt';
import { beginNoteMutation, compactOptimisticPatch, finishNoteMutation, recoverNoteMutation } from './note-mutations';
import { buildNewNoteContent, currentFolderId, pendingEditorCursors } from './new-note';
import { enqueueNoteWrite } from './persist';
import { advanceDirtyRevision } from './runtime';
import { scheduleShellSave } from './shell-save';
import { commitPendingSummaryDerivation } from './summary';
import { isVirtualFolderId } from '../../lib/calendar-tree';
import { newLocalEntityId } from './util';
import { captureWorkspaceState, restoreWorkspaceState, workspaceContainsNote } from './workspace';
import { dirty, pendingNoteCreates } from './model';
import { useUi } from '../ui';
import { t, type MessageKey } from '../../lib/i18n';
import { toastError, patchWithUndo, batchPatchTitle, type NotePatch } from './undo';

type NoteActionsKey = 'createNote' | 'patchNote' | 'setArchived' | 'setArchivedMany' | 'setStarred' | 'setStarredMany' | 'setPinned' | 'setPinnedMany' | 'moveNotes';

export const noteActions = (set: SetNotesState, get: () => NotesState): Pick<NotesState, NoteActionsKey> => ({
  createNote: (input) => createNoteImpl(set, get, input),
  patchNote: (id, patch) => patchNoteImpl(set, get, id, patch),
  setArchived: (id, archived, options) => setArchivedImpl(get, id, archived, options),
  setArchivedMany: (ids, archived) => setArchivedManyImpl(get, ids, archived),
  setStarred: (id, starred, options) => setStarredImpl(get, id, starred, options),
  setStarredMany: (ids, starred) => setStarredManyImpl(get, ids, starred),
  setPinned: (id, pinned, options) => setPinnedImpl(get, id, pinned, options),
  setPinnedMany: (ids, pinned) => setPinnedManyImpl(get, ids, pinned),
  moveNotes: (ids, folderId) => moveNotesImpl(get, ids, folderId),
});

type CreateNoteInput = Parameters<NotesState['createNote']>[0];

async function createNoteImpl(
  set: SetNotesState,
  get: () => NotesState,
  input?: CreateNoteInput,
): Promise<string | null> {
  const id = input?.id ?? newLocalEntityId();
  const existing = get().notes[id];
  const title = (input?.title ?? '').trim().slice(0, LIMITS.titleMaxLength);
  const folderId = input?.folderId && !isVirtualFolderId(input.folderId) ? input.folderId : currentFolderId();
  let content: string;
  let cursor: number | null = null;
  if (input?.content !== undefined) {
    content = input.content;
  }
  else {
    const built = buildNewNoteContent(title, input?.tags, folderId, get().folders);
    content = built.content;
    cursor = built.cursor;
    if (cursor !== null)
      pendingEditorCursors.set(id, cursor);
  }
  const isStarred = input?.isStarred ?? false;
  if (existing)
    return createServerNote(id, title, content, folderId, isStarred, set, get);
  return createOptimisticNote(id, title, content, folderId, isStarred, input?.open !== false, set, get);
}

async function createServerNote(
  id: string,
  title: string,
  content: string,
  folderId: string | null,
  isStarred: boolean,
  set: SetNotesState,
  get: () => NotesState,
): Promise<string | null> {
  const request = api.notes.create({ id, title, content, folderId, ...(isStarred ? { isStarred: true } : {}) });
  pendingNoteCreates.set(id, request);
  try {
    const note = await request;
    adoptNote(note, set, get);
    if (isStarred && !note.isStarred)
      await get().patchNote(note.id, { isStarred: true });
    return note.id;
  }
  catch (err) {
    toastError(err, t('notes.could_not_create_note'));
    return null;
  }
  finally {
    if (pendingNoteCreates.get(id) === request)
      pendingNoteCreates.delete(id);
  }
}

async function createOptimisticNote(
  id: string,
  title: string,
  content: string,
  folderId: string | null,
  isStarred: boolean,
  open: boolean,
  set: SetNotesState,
  get: () => NotesState,
): Promise<string | null> {
  const now = Date.now();
  const { words, chars } = countText(content);
  const optimistic: Note = {
    id,
    title,
    excerpt: deriveExcerpt(content),
    content,
    folderId,
    tags: extractTags(content),
    isPinned: false,
    isStarred,
    isArchived: false,
    wordCount: words,
    charCount: chars,
    rev: 1,
    position: now,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  const previousWorkspace = captureWorkspaceState();
  adoptNote(optimistic, set, get);
  if (open)
    useUi.getState().setActiveNote(id);
  return createPendingNote(id, title, content, folderId, isStarred, previousWorkspace, set, get);
}

async function createPendingNote(
  id: string,
  title: string,
  content: string,
  folderId: string | null,
  isStarred: boolean,
  previousWorkspace: ReturnType<typeof captureWorkspaceState>,
  set: SetNotesState,
  get: () => NotesState,
): Promise<string | null> {
  const request = api.notes.create({ id, title, content, folderId, ...(isStarred ? { isStarred: true } : {}) });
  pendingNoteCreates.set(id, request);
  try {
    const note = await request;
    adoptNote(note, set, get);
    if (isStarred && !note.isStarred)
      await get().patchNote(note.id, { isStarred: true });
    return note.id;
  }
  catch (err) {
    if (!dirty.has(id))
      rollbackOptimisticCreate(id, previousWorkspace, set, get);
    toastError(err, t('notes.could_not_create_note'));
    return null;
  }
  finally {
    if (pendingNoteCreates.get(id) === request)
      pendingNoteCreates.delete(id);
  }
}

async function patchNoteImpl(
  set: SetNotesState,
  get: () => NotesState,
  id: string,
  patch: Parameters<NotesState['patchNote']>[1],
): Promise<void> {
  commitPendingSummaryDerivation(id);
  const mutation = beginNoteMutation(id, compactOptimisticPatch(patch), set, get);
  if (!mutation)
    return;
  await enqueueNoteWrite(id, () => patchNoteWriter(id, mutation, patch, set, get));
}

async function patchNoteWriter(
  id: string,
  mutation: PendingNoteMutation,
  patch: Parameters<NotesState['patchNote']>[1],
  set: SetNotesState,
  get: () => NotesState,
): Promise<void> {
  const summary = get().notes[id];
  if (!summary) {
    finishNoteMutation(id, mutation);
    return;
  }
  await patchNoteWithRetry(id, mutation, patch, dirty.get(id)?.rev ?? summary.rev, 0, set, get);
}

async function patchNoteWithRetry(
  id: string,
  mutation: PendingNoteMutation,
  patch: Parameters<NotesState['patchNote']>[1],
  rev: number,
  attempt: number,
  set: SetNotesState,
  get: () => NotesState,
): Promise<void> {
  try {
    const saved = await api.notes.patch(id, { rev, ...patch });
    finishNoteMutation(id, mutation);
    advanceDirtyRevision(id, rev, saved.rev, get);
    adoptNote(saved, set, get);
  }
  catch (err) {
    const server = err instanceof ApiError && err.isConflict
      ? (err.details as { server?: Note } | undefined)?.server
      : undefined;
    if (server?.id === id && server.rev > rev && attempt < 3) {
      adoptNote(server, set, get);
      await patchNoteWithRetry(id, mutation, patch, server.rev, attempt + 1, set, get);
      return;
    }
    await recoverNoteMutation(id, mutation, err, set, get);
    toastError(err, t('common.action_failed'));
  }
}

function rollbackOptimisticCreate(
  id: string,
  previousWorkspace: ReturnType<typeof captureWorkspaceState>,
  set: SetNotesState,
  get: () => NotesState,
): void {
  set((state) => {
    const notes = { ...state.notes };
    const contents = { ...state.contents };
    delete notes[id];
    delete contents[id];
    return { notes, contents };
  });
  void localDb.dropContent(id);
  if (workspaceContainsNote(id))
    restoreWorkspaceState(previousWorkspace);
  scheduleShellSave(get);
}

async function setArchivedImpl(
  get: () => NotesState,
  id: string,
  archived: boolean,
  options?: { notify?: 'undo' | 'confirm' | 'none' },
): Promise<void> {
  const before = get().notes[id];
  if (!before || before.isArchived === archived)
    return;
  await patchWithUndo(
    get,
    new Map([[id, { isArchived: before.isArchived }]]),
    { isArchived: archived },
    t(archived ? 'notes.archived' : 'common.unarchive'),
    t(archived ? 'notes.unarchived' : 'notes.archived'),
    options?.notify,
  );
}

async function setArchivedManyImpl(
  get: () => NotesState,
  ids: string[],
  archived: boolean,
): Promise<void> {
  const undoPatches = new Map<string, NotePatch>();
  for (const id of ids) {
    const note = get().notes[id];
    if (note && note.isArchived !== archived)
      undoPatches.set(id, { isArchived: note.isArchived });
  }
  await patchWithUndo(
    get,
    undoPatches,
    { isArchived: archived },
    batchPatchTitle(archived ? 'notes.archived' : 'common.unarchive', undoPatches.size),
    batchPatchTitle(archived ? 'notes.unarchived' : 'notes.archived', undoPatches.size),
  );
}

async function setStarredImpl(
  get: () => NotesState,
  id: string,
  starred: boolean,
  options?: { notify?: 'undo' | 'confirm' | 'none' },
): Promise<void> {
  const before = get().notes[id];
  if (!before || before.isStarred === starred)
    return;
  await patchWithUndo(
    get,
    new Map([[id, { isStarred: before.isStarred }]]),
    { isStarred: starred },
    t(starred ? 'notes.added_to_favorites' : 'notes.removed_from_favorites'),
    t(starred ? 'notes.removed_from_favorites' : 'notes.added_to_favorites'),
    options?.notify,
  );
}

async function setStarredManyImpl(
  get: () => NotesState,
  ids: string[],
  starred: boolean,
): Promise<void> {
  const undoPatches = new Map<string, NotePatch>();
  for (const id of ids) {
    const note = get().notes[id];
    if (note && note.isStarred !== starred)
      undoPatches.set(id, { isStarred: note.isStarred });
  }
  const titleKey: MessageKey = starred ? 'notes.added_to_favorites' : 'notes.removed_from_favorites';
  const revertKey: MessageKey = starred ? 'notes.removed_from_favorites' : 'notes.added_to_favorites';
  await patchWithUndo(get, undoPatches, { isStarred: starred }, batchPatchTitle(titleKey, undoPatches.size), batchPatchTitle(revertKey, undoPatches.size));
}

async function setPinnedImpl(
  get: () => NotesState,
  id: string,
  pinned: boolean,
  options?: { notify?: 'undo' | 'confirm' | 'none' },
): Promise<void> {
  const before = get().notes[id];
  if (!before || before.isPinned === pinned)
    return;
  await patchWithUndo(
    get,
    new Map([[id, { isPinned: before.isPinned }]]),
    { isPinned: pinned },
    t(pinned ? 'notes.pinned' : 'notes.unpinned'),
    t(pinned ? 'notes.unpinned' : 'notes.pinned'),
    options?.notify,
  );
}

async function setPinnedManyImpl(
  get: () => NotesState,
  ids: string[],
  pinned: boolean,
): Promise<void> {
  const undoPatches = new Map<string, NotePatch>();
  for (const id of ids) {
    const note = get().notes[id];
    if (note && note.isPinned !== pinned)
      undoPatches.set(id, { isPinned: note.isPinned });
  }
  const titleKey: MessageKey = pinned ? 'notes.pinned' : 'notes.unpinned';
  const revertKey: MessageKey = pinned ? 'notes.unpinned' : 'notes.pinned';
  await patchWithUndo(get, undoPatches, { isPinned: pinned }, batchPatchTitle(titleKey, undoPatches.size), batchPatchTitle(revertKey, undoPatches.size));
}

async function moveNotesImpl(
  get: () => NotesState,
  ids: string[],
  folderId: string | null,
): Promise<void> {
  const undoPatches = new Map<string, NotePatch>();
  for (const id of ids) {
    const note = get().notes[id];
    if (note && note.folderId !== folderId)
      undoPatches.set(id, { folderId: note.folderId });
  }
  const titleKey: MessageKey = folderId ? 'notes.moved' : 'notes.moved_out';
  const revertKey: MessageKey = folderId ? 'notes.moved_out' : 'notes.moved';
  await patchWithUndo(get, undoPatches, { folderId }, batchPatchTitle(titleKey, undoPatches.size), batchPatchTitle(revertKey, undoPatches.size));
}