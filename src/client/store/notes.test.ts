import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Folder, NoteSummary } from '@shared/types';
import { useNotes } from './notes';
import { useUi } from './ui';
import {
    installLocalDbStubs,
    installNotesApiStub,
    notesMockServer,
    noteSummary,
} from './notes-test-utils';

/**
 * Integration tests for the store-level undo contract behind the light note mutations
 * (move to folder, batch pin, star). Each action must optimistically apply, persist through
 * the (mocked) api, and post exactly one undo toast whose action reverts every affected note.
 */

const FOLDER_A: Folder = {
    id: 'folder-a',
    parentId: null,
    name: 'Folder A',
    icon: null,
    color: null,
    position: 0,
    createdAt: 1,
    updatedAt: 1,
};

beforeEach(() => {
    vi.useFakeTimers();
    installNotesApiStub();
    installLocalDbStubs();
    notesMockServer.notes = new Map();
    notesMockServer.patchCalls = [];
    notesMockServer.conflicts = new Set();
    useUi.setState({ toasts: [] });
});

afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
});

function seed(...notes: NoteSummary[]) {
    notesMockServer.notes = new Map(notes.map((note) => [note.id, { ...note, content: `# ${note.title}` }]));
    useNotes.setState({
        notes: Object.fromEntries(notes.map((note) => [note.id, note])),
        contents: {},
        folders: [FOLDER_A],
        tags: [],
        cursor: 1,
        hydrated: true,
        loading: false,
        online: true,
        saveStatus: 'idle',
        pendingCount: 0,
        lastSavedAt: 0,
    });
}

function undoToast() {
    return useUi.getState().toasts.find((toast) => toast.kind === 'undo');
}

function lastToast() {
    return useUi.getState().toasts.at(-1);
}

/** Run a fire-and-forget undo closure and flush the queued patch writes. */
async function runUndo(): Promise<void> {
    const toast = undoToast();
    expect(toast?.action).toBeTruthy();
    toast!.action!.run();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
}

describe('moveNotes undo contract', () => {
    it('moves a single note, offers one undo, and restores the previous folder on undo with a confirm toast', async () => {
        const note = noteSummary('a', { folderId: null });
        seed(note);

        await useNotes.getState().moveNotes(['a'], FOLDER_A.id);

        expect(useNotes.getState().notes.a.folderId).toBe(FOLDER_A.id);
        expect(notesMockServer.notes.get('a')?.folderId).toBe(FOLDER_A.id);
        expect(notesMockServer.patchCalls).toHaveLength(1);
        expect(notesMockServer.patchCalls[0]!.patch.folderId).toBe(FOLDER_A.id);
        expect(useUi.getState().toasts).toHaveLength(1);
        expect(undoToast()).toBeTruthy();

        await runUndo();

        expect(useNotes.getState().notes.a.folderId).toBeNull();
        expect(notesMockServer.notes.get('a')?.folderId).toBeNull();
        // A single-note revert confirms with a plain success toast.
        expect(lastToast()?.tone).toBe('success');
        expect(lastToast()?.kind).toBeUndefined();
    });

    it('moves a batch with one shared undo that reverts the whole batch silently', async () => {
        const first = noteSummary('a', { folderId: null });
        const second = noteSummary('b', { folderId: null });
        seed(first, second);

        await useNotes.getState().moveNotes(['a', 'b'], FOLDER_A.id);

        expect(useNotes.getState().notes.a.folderId).toBe(FOLDER_A.id);
        expect(useNotes.getState().notes.b.folderId).toBe(FOLDER_A.id);
        expect(useUi.getState().toasts).toHaveLength(1);

        await runUndo();

        expect(useNotes.getState().notes.a.folderId).toBeNull();
        expect(useNotes.getState().notes.b.folderId).toBeNull();
        expect(notesMockServer.notes.get('a')?.folderId).toBeNull();
        expect(notesMockServer.notes.get('b')?.folderId).toBeNull();
        // Batch reverts stay silent: no extra toast was posted.
        expect(useUi.getState().toasts).toHaveLength(1);
    });

    it('restores mixed previous folders per note after a batch undo', async () => {
        const fromFolderA = noteSummary('a', { folderId: FOLDER_A.id });
        const unfiled = noteSummary('b', { folderId: null });
        seed(fromFolderA, unfiled);

        await useNotes.getState().moveNotes(['a', 'b'], null);

        expect(useNotes.getState().notes.a.folderId).toBeNull();
        expect(useNotes.getState().notes.b.folderId).toBeNull();

        await runUndo();

        expect(useNotes.getState().notes.a.folderId).toBe(FOLDER_A.id);
        expect(useNotes.getState().notes.b.folderId).toBeNull();
    });

    it('is a no-op when the note already sits in the target folder', async () => {
        const note = noteSummary('a', { folderId: FOLDER_A.id });
        seed(note);

        await useNotes.getState().moveNotes(['a'], FOLDER_A.id);

        expect(notesMockServer.patchCalls).toHaveLength(0);
        expect(useUi.getState().toasts).toHaveLength(0);
        expect(useNotes.getState().notes.a.folderId).toBe(FOLDER_A.id);
    });
});

describe('setPinnedMany undo contract', () => {
    it('unpins a batch with one undo toast that restores every pin', async () => {
        const first = noteSummary('a', { isPinned: true });
        const second = noteSummary('b', { isPinned: true });
        seed(first, second);

        await useNotes.getState().setPinnedMany(['a', 'b'], false);

        expect(useNotes.getState().notes.a.isPinned).toBe(false);
        expect(useNotes.getState().notes.b.isPinned).toBe(false);
        expect(notesMockServer.notes.get('a')?.isPinned).toBe(false);
        expect(useUi.getState().toasts).toHaveLength(1);

        await runUndo();

        expect(useNotes.getState().notes.a.isPinned).toBe(true);
        expect(useNotes.getState().notes.b.isPinned).toBe(true);
        expect(notesMockServer.notes.get('a')?.isPinned).toBe(true);
        expect(useUi.getState().toasts).toHaveLength(1);
    });

    it('skips notes whose pin state already matches', async () => {
        const pinned = noteSummary('a', { isPinned: true });
        const unpinned = noteSummary('b', { isPinned: false });
        seed(pinned, unpinned);

        await useNotes.getState().setPinnedMany(['a', 'b'], true);

        // Only `b` changed; the api saw exactly one patch call.
        expect(notesMockServer.patchCalls).toHaveLength(1);
        expect(notesMockServer.patchCalls[0]!.id).toBe('b');
        expect(useUi.getState().toasts).toHaveLength(1);

        await runUndo();

        expect(useNotes.getState().notes.b.isPinned).toBe(false);
        expect(useNotes.getState().notes.a.isPinned).toBe(true);
    });
});

describe('setStarred undo contract', () => {
    it('stars a single note, then undo restores it and confirms', async () => {
        const note = noteSummary('a', { isStarred: false });
        seed(note);

        await useNotes.getState().setStarred('a', true);

        expect(useNotes.getState().notes.a.isStarred).toBe(true);
        expect(useUi.getState().toasts).toHaveLength(1);

        await runUndo();

        expect(useNotes.getState().notes.a.isStarred).toBe(false);
        expect(notesMockServer.notes.get('a')?.isStarred).toBe(false);
        expect(lastToast()?.tone).toBe('success');
    });

    it('posts no toast for an explicit silent (notify none) star', async () => {
        const note = noteSummary('a', { isStarred: false });
        seed(note);

        await useNotes.getState().setStarred('a', true, { notify: 'none' });

        expect(useNotes.getState().notes.a.isStarred).toBe(true);
        expect(useUi.getState().toasts).toHaveLength(0);
    });
});

describe('setArchived undo contract', () => {
    it('archives a single note with an undo that restores it and confirms', async () => {
        const note = noteSummary('a', { isArchived: false });
        seed(note);

        await useNotes.getState().setArchived('a', true);

        expect(useNotes.getState().notes.a.isArchived).toBe(true);
        expect(notesMockServer.notes.get('a')?.isArchived).toBe(true);
        expect(useUi.getState().toasts).toHaveLength(1);

        await runUndo();

        expect(useNotes.getState().notes.a.isArchived).toBe(false);
        expect(notesMockServer.notes.get('a')?.isArchived).toBe(false);
        expect(lastToast()?.tone).toBe('success');
    });

    it('archives a batch with one shared undo that restores every note silently', async () => {
        const first = noteSummary('a', { isArchived: false });
        const second = noteSummary('b', { isArchived: false });
        seed(first, second);

        await useNotes.getState().setArchivedMany(['a', 'b'], true);

        expect(useNotes.getState().notes.a.isArchived).toBe(true);
        expect(useNotes.getState().notes.b.isArchived).toBe(true);
        expect(useUi.getState().toasts).toHaveLength(1);

        await runUndo();

        expect(useNotes.getState().notes.a.isArchived).toBe(false);
        expect(useNotes.getState().notes.b.isArchived).toBe(false);
        expect(useUi.getState().toasts).toHaveLength(1);
    });

    it('supports a silent confirm variant (notify confirm) with no undo toast', async () => {
        const note = noteSummary('a', { isArchived: false });
        seed(note);

        await useNotes.getState().setArchived('a', true, { notify: 'confirm' });

        expect(useNotes.getState().notes.a.isArchived).toBe(true);
        expect(useUi.getState().toasts).toHaveLength(1);
        expect(undoToast()).toBeUndefined();
        expect(lastToast()?.tone).toBe('success');
    });
});

describe('trash and restore', () => {
    it('moves a note to the trash with a longer undo window and restores it on undo', async () => {
        const note = noteSummary('a', { deletedAt: null });
        seed(note);

        await useNotes.getState().deleteNote('a');

        expect(useNotes.getState().notes.a.deletedAt).not.toBeNull();
        expect(notesMockServer.notes.get('a')?.deletedAt).not.toBeNull();
        const trashToast = undoToast();
        expect(trashToast).toBeTruthy();
        // Destructive actions get a longer undo window than the default light-operation window.
        expect(trashToast?.duration).toBe(8000);

        await runUndo();

        expect(useNotes.getState().notes.a.deletedAt).toBeNull();
        expect(notesMockServer.notes.get('a')?.deletedAt).toBeNull();
    });

    it('restores from the trash with a success toast', async () => {
        const note = noteSummary('a', { deletedAt: null });
        seed(note);
        await useNotes.getState().deleteNote('a');
        useUi.setState({ toasts: [] });

        await useNotes.getState().restoreNote('a');

        expect(useNotes.getState().notes.a.deletedAt).toBeNull();
        expect(useUi.getState().toasts).toHaveLength(1);
        expect(lastToast()?.tone).toBe('success');
    });
});

describe('light-op undo window', () => {
    it('keeps the default 3800ms window for reversible operations', async () => {
        const note = noteSummary('a', { folderId: null });
        seed(note);

        await useNotes.getState().moveNotes(['a'], FOLDER_A.id);

        expect(undoToast()?.duration).toBe(3800);
    });
});

describe('conflict recovery', () => {
    it('adopts the newer server revision and retries the patch', async () => {
        const note = noteSummary('a', { folderId: null });
        seed(note);
        notesMockServer.conflicts.add('a');

        await useNotes.getState().moveNotes(['a'], FOLDER_A.id);

        // Attempt 1 conflicted (rev 1); attempt 2 retried with the adopted revision (rev 2).
        expect(notesMockServer.patchCalls.map((call) => call.rev)).toEqual([1, 2]);
        expect(notesMockServer.conflicts.size).toBe(0);
        expect(useNotes.getState().notes.a.folderId).toBe(FOLDER_A.id);
        expect(useNotes.getState().notes.a.rev).toBe(2);
        expect(notesMockServer.notes.get('a')?.folderId).toBe(FOLDER_A.id);
        expect(undoToast()).toBeTruthy();
    });
});
