import type { Note, NoteSummary } from '@shared/types';
import { api, ApiError } from '../lib/api';
import { localDb } from '../lib/db';

/**
 * Reusable test harness for the notes store (src/client/store/notes.ts).
 *
 * The store reads `api` and `localDb` through the module singletons at call time, so tests can
 * install in-memory stubs on those objects without vi.mock. Install once per test file in
 * `beforeAll` (or per test in `beforeEach`) and point `notesMockServer` at the notes under test.
 *
 * Usage:
 *   import { installNotesApiStub, installLocalDbStubs, notesMockServer, noteSummary } from './notes-test-utils'
 *   beforeAll(() => { installNotesApiStub(); installLocalDbStubs(); })
 *   beforeEach(() => { notesMockServer.notes = new Map(); notesMockServer.patchCalls = [] })
 */

export interface NotesPatchCall {
    id: string;
    rev: number;
    patch: Record<string, unknown>;
}

/** In-memory stand-in for the account's server-side note storage. */
export interface NotesMockServer {
    notes: Map<string, Note>;
    patchCalls: NotesPatchCall[];
    /** Note ids whose next patch should 409 once (simulating a write from another device), then succeed. */
    conflicts: Set<string>;
}

export const notesMockServer: NotesMockServer = {
    notes: new Map(),
    patchCalls: [],
    conflicts: new Set(),
};

/**
 * Replace `api.notes.patch` with an in-memory implementation that applies the patch body to the
 * matching note in `notesMockServer.notes` and returns the updated full note (rev bumped), mirroring
 * the real endpoint's response shape.
 */
/** Apply the summary-flag subset of a patch body to a note (folder moves plus pin/star/archive). */
function applyPatchToNote(server: Note, body: Record<string, unknown>): Note {
    return {
        ...server,
        ...(body.folderId === null || typeof body.folderId === 'string' ? { folderId: body.folderId } : {}),
        ...(typeof body.isPinned === 'boolean' ? { isPinned: body.isPinned } : {}),
        ...(typeof body.isStarred === 'boolean' ? { isStarred: body.isStarred } : {}),
        ...(typeof body.isArchived === 'boolean' ? { isArchived: body.isArchived } : {}),
        rev: server.rev + 1,
        updatedAt: Date.now(),
    };
}

export function installNotesApiStub(): void {
    api.notes.patch = (async (id: string, body: { rev: number } & Record<string, unknown>): Promise<Note> => {
        const server = notesMockServer.notes.get(id);
        if (!server)
            throw new Error(`Mock server has no note "${id}"`);
        notesMockServer.patchCalls.push({ id, rev: body.rev, patch: { ...body } });
        if (notesMockServer.conflicts.has(id)) {
            notesMockServer.conflicts.delete(id);
            // Another device already advanced the note past the client's revision.
            const theirs: Note = { ...server, rev: server.rev + 1, updatedAt: Date.now() };
            throw new ApiError(409, 'conflict', 'The note changed on another device', { server: theirs });
        }
        const updated = applyPatchToNote(server, body);
        notesMockServer.notes.set(id, updated);
        return updated;
    }) as unknown as typeof api.notes.patch;

    api.notes.remove = (async (id: string): Promise<Note> => {
        const server = notesMockServer.notes.get(id);
        if (!server)
            throw new Error(`Mock server has no note "${id}"`);
        const removed: Note = { ...server, deletedAt: Date.now(), updatedAt: Date.now(), rev: server.rev + 1 };
        notesMockServer.notes.set(id, removed);
        return removed;
    }) as unknown as typeof api.notes.remove;

    api.notes.restore = (async (id: string): Promise<Note> => {
        const server = notesMockServer.notes.get(id);
        if (!server)
            throw new Error(`Mock server has no note "${id}"`);
        const restored: Note = { ...server, deletedAt: null, updatedAt: Date.now(), rev: server.rev + 1 };
        notesMockServer.notes.set(id, restored);
        return restored;
    }) as unknown as typeof api.notes.restore;
}

/**
 * Neutralize the IndexedDB-backed persistence surface the note mutation paths touch
 * (optimistic shell saves and content caching), so store actions run purely against the mock api.
 * Assignments go through a loose cast: the stubs intentionally ignore their real signatures.
 */
export function installLocalDbStubs(): void {
    const loose = localDb as unknown as Record<string, (...args: unknown[]) => unknown>;
    loose.scheduleShellSave = () => undefined;
    loose.setContent = async () => undefined;
    loose.getContent = async () => undefined;
    loose.dropContent = async () => undefined;
    loose.bindUser = async () => undefined;
    loose.loadShell = async () => null;
    loose.getOutbox = async () => [];
    loose.withOutboxReplayLock = async () => true;
}

/** Build a minimal NoteSummary fixture. */
export function noteSummary(id: string, overrides: Partial<NoteSummary> = {}): NoteSummary {
    return {
        id,
        title: `Note ${id}`,
        excerpt: '',
        folderId: null,
        tags: [],
        isPinned: false,
        isStarred: false,
        isArchived: false,
        wordCount: 0,
        charCount: 0,
        rev: 1,
        position: 0,
        createdAt: 1_000,
        updatedAt: 1_000,
        deletedAt: null,
        ...overrides,
    };
}
