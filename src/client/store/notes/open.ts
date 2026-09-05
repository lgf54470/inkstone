import type { NotesState, SetNotesState } from './model';
import { ApiError, CLIENT_ID } from '../../lib/api';
import { localDb } from '../../lib/db';
import { adoptNote, revalidateNote, requestNote } from './adopt';
import { replayOutbox } from './outbox';
import { scheduleShellSave } from './shell-save';
import { hasOwnContent, outboxId } from './util';
import { dirty, inheritedOutboxWrites, latestRequestedNoteIds, noteRequestEpochs, openSequences, STALE_NOTE_REQUEST, validatedRevisions } from './model';
import { useUi } from '../ui';
import { t } from '../../lib/i18n';
import { toastError } from './undo';

export const open = (set: SetNotesState, get: () => NotesState): Pick<NotesState, 'peekContent' | 'openNote' | 'replayPending'> => ({

    async peekContent(id) {
        const summary = get().notes[id];
        if (!summary || summary.deletedAt !== null)
            return null;
        if (hasOwnContent(get().contents, id))
            return get().contents[id]!;
        try {
            const cached = await localDb.getContent(id);
            if (cached && cached.rev === summary.rev && !dirty.has(id)) {
                set((state) => state.contents[id] !== undefined
                    ? state
                    : { contents: { ...state.contents, [id]: cached.content } });
                return cached.content;
            }
        }
        catch {
            // Cache read failed (IndexedDB hiccup); fall through to the server fetch below.
        }
        try {
            const note = await requestNote(id);
            adoptNote(note, set, get);
            return note.content;
        }
        catch {
            return null;
        }
    },

    async openNote(id, options) {
        const uiAtRequest = useUi.getState();
        const targetPane = options?.pane ?? (uiAtRequest.workspaceSecondaryNoteId
            ? uiAtRequest.activeWorkspacePane
            : 'primary');
        const activate = options?.activate !== false;
        latestRequestedNoteIds[targetPane] = id;
        const requestSequence = ++openSequences[targetPane];
        const requestEpoch = noteRequestEpochs.get(id) ?? 0;
        const state = get();
        const summary = state.notes[id];
        if (!summary)
            return;
        if (hasOwnContent(state.contents, id)) {
            useUi.getState().setWorkspaceNote(targetPane, id, activate);
            revalidateNote(id, summary.rev, set, get);
            return;
        }
        const cached = await localDb.getContent(id);
        let currentSummary = get().notes[id];
        if (requestSequence !== openSequences[targetPane] ||
            (noteRequestEpochs.get(id) ?? 0) !== requestEpoch ||
            !currentSummary)
            return;
        if (cached) {
            let hasRestoredPending = false;
            let hasForeignPending = false;
            let visibleContent = cached.content;
            let visibleTitle: string | undefined;
            if (cached.writeId) {
                const outbox = await localDb.getOutbox();
                currentSummary = get().notes[id];
                if (requestSequence !== openSequences[targetPane] ||
                    (noteRequestEpochs.get(id) ?? 0) !== requestEpoch ||
                    !currentSummary)
                    return;
                const existing = outbox.find((item) => item.writeId === cached.writeId && item.noteId === id);
                const currentId = outboxId(id);
                const existingContent = existing?.payload.content;
                const existingTitle = existing?.payload.title;
                const existingRev = existing?.payload.rev;
                const validExisting = existing &&
                    typeof existingContent === 'string' &&
                    Number.isInteger(existingRev) &&
                    (existingRev as number) >= 1;
                if (validExisting) {


                    visibleContent = existingContent as string;
                    visibleTitle = typeof existingTitle === 'string' ? existingTitle : undefined;
                    if (existing.clientId === CLIENT_ID) {
                        inheritedOutboxWrites.delete(id);
                        dirty.set(id, {
                            ...(typeof existingTitle === 'string' ? { title: existingTitle } : {}),
                            content: visibleContent,
                            contentDirty: existing.payload.contentDirty !== false,
                            rev: existingRev as number,
                            writeId: existing.writeId,
                            queueId: existing.id,
                            dependsOnWriteId: existing.dependsOnWriteId,
                            updatedAt: cached.updatedAt,
                            persisted: Promise.resolve(true),
                        });
                    }
                    else {
                        inheritedOutboxWrites.set(id, existing.writeId);
                        hasForeignPending = true;
                    }
                    hasRestoredPending = true;
                }
                else {
                    inheritedOutboxWrites.delete(id);
                    const recoveredTitle = cached.pendingTitle;
                    const recoveredContentDirty = cached.contentDirty !== false;
                    visibleTitle = recoveredTitle;
                    const queueId = outbox.some((item) => item.id === currentId)
                        ? `patch-recovery:${CLIENT_ID}:${id}:${cached.writeId}`
                        : currentId;
                    const persisted = localDb.enqueueOutbox({
                        id: queueId,
                        clientId: CLIENT_ID,
                        writeId: cached.writeId,
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
                            await localDb.completeOutboxItem(existing.id, existing.writeId).catch(() => { });
                        return true;
                    }, () => false);
                    dirty.set(id, {
                        ...(recoveredTitle !== undefined ? { title: recoveredTitle } : {}),
                        content: cached.content,
                        contentDirty: recoveredContentDirty,
                        rev: cached.rev,
                        writeId: cached.writeId,
                        queueId,
                        updatedAt: cached.updatedAt,
                        persisted,
                    });
                    hasRestoredPending = true;
                    void (async () => {
                        const durable = await persisted;
                        if (!durable) {
                            useUi.getState().toast({
                                title: t("notes.the_browser_could_not_save_your_offline_changes"),
                                description: t("notes.keep_this_page_open_and_reconnect_as_soon_as_possible_closing_it_may_mak"),
                                tone: 'danger',
                                duration: 12_000,
                            });
                        }
                    });
                }
                if (hasRestoredPending) {
                    const pendingIds = new Set(outbox.map((item) => item.noteId));
                    for (const noteId of dirty.keys())
                        pendingIds.add(noteId);
                    set({ pendingCount: pendingIds.size });
                }
            }
            set((s) => ({
                notes: visibleTitle !== undefined && s.notes[id]?.title !== visibleTitle
                    ? { ...s.notes, [id]: { ...s.notes[id]!, title: visibleTitle } }
                    : s.notes,
                contents: { ...s.contents, [id]: visibleContent },
                ...(hasRestoredPending
                    ? { saveStatus: s.online ? 'dirty' as const : 'offline' as const }
                    : {}),
            }));
            if (visibleTitle !== undefined)
                scheduleShellSave(get);
            useUi.getState().setWorkspaceNote(targetPane, id, activate);
            if (hasRestoredPending) {
                if (hasForeignPending && get().online)
                    void replayOutbox(get, set);
                return;
            }
            if (cached.rev === currentSummary.rev)
                validatedRevisions.set(id, currentSummary.rev);
            else
                revalidateNote(id, currentSummary.rev, set, get);
            return;
        }
        try {
            const note = await requestNote(id);
            adoptNote(note, set, get);
            validatedRevisions.set(id, note.rev);
            if (requestSequence === openSequences[targetPane] && get().notes[id]) {
                useUi.getState().setWorkspaceNote(targetPane, id, activate);
            }
        }
        catch (err) {
            if (err === STALE_NOTE_REQUEST)
                return;
            if (err instanceof ApiError && err.isOffline) {
                useUi.getState().toast({ title: t("notes.this_note_cannot_be_opened_offline"), tone: 'warning' });
                return;
            }
            if (err instanceof ApiError && err.status === 404) {
                useUi.getState().toast({ title: t("notes.this_note_no_longer_exists"), tone: 'danger' });
                if (latestRequestedNoteIds[targetPane] === id)
                    latestRequestedNoteIds[targetPane] = null;
                useUi.getState().removeWorkspaceNote(id);
                set((s) => {
                    const notes = { ...s.notes };
                    delete notes[id];
                    return { notes };
                });
                return;
            }
            toastError(err, t("notes.failed_to_open_note"));
        }
    },

    replayPending() {
        return replayOutbox(get, set);
    }
});
