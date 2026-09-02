import type { Note, NoteSummary } from '@shared/types';
import { api } from '../lib/api';
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
}

export const notesMockServer: NotesMockServer = {
    notes: new Map(),
    patchCalls: [],
};

/**
 * Replace `api.notes.patch` with an in-memory implementation that applies the patch body to the
 * matching note in `notesMockServer.notes` and returns the updated full note (rev bumped), mirroring
 * the real endpoint's response shape.
 */
export function installNotesApiStub(): void {
    const stub = async (id: string, body: { rev: number } & Record<string, unknown>): Promise<Note> => {
        const server = notesMockServer.notes.get(id);
        if (!server)
            throw new Error(`Mock server has no note "${id}"`);
        notesMockServer.patchCalls.push({ id, rev: body.rev, patch: { ...body } });
        const updated: Note = {
            ...server,
            ...(body.folderId === null || typeof body.folderId === 'string' ? { folderId: body.folderId } : {}),
            ...(typeof body.isPinned === 'boolean' ? { isPinned: body.isPinned } : {}),
            ...(typeof body.isStarred === 'boolean' ? { isStarred: body.isStarred } : {}),
            ...(typeof body.isArchived === 'boolean' ? { isArchived: body.isArchived } : {}),
            rev: server.rev + 1,
            updatedAt: Date.now(),
        };
        notesMockServer.notes.set(id, updated);
        return updated;
    };
    api.notes.patch = stub as unknown as typeof api.notes.patch;
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
