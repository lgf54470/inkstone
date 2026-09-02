/** Full-sync paging and consolidation for the note store pull path. */
import { api } from '../../lib/api';
import { t } from '../../lib/i18n';
import type { SyncResponse } from '@shared/types';

export async function collectFullSync(first: SyncResponse): Promise<SyncResponse> {
    const notes = new Map(first.notes.map((note) => [note.id, note]));
    let page = first;
    const requestedKeys = new Set<string>();
    while (page.hasMore) {
        if (page.nextKey === null)
            throw new Error(t("notes.full_sync_pagination_data_is_incomplete"));
        if (requestedKeys.has(page.nextKey))
            throw new Error(t("notes.full_sync_pagination_data_is_incomplete"));
        requestedKeys.add(page.nextKey);
        page = await api.sync(0, {
            after: page.nextKey,
            snapshot: first.cursor,
        });
        if (!page.full || page.cursor !== first.cursor) {
            throw new Error(t("notes.the_full_sync_snapshot_expired_try_again"));
        }
        for (const note of page.notes)
            notes.set(note.id, note);
    }
    return {
        ...first,
        notes: [...notes.values()],
        hasMore: false,
        nextKey: null,
        serverTime: page.serverTime,
    };
}
export function consolidateFullSync(snapshot: SyncResponse, increments: SyncResponse[]): SyncResponse {
    const notes = new Map(snapshot.notes.map((note) => [note.id, note]));
    let folders = new Map(snapshot.folders.map((folder) => [folder.id, folder]));
    let tags = new Map(snapshot.tags.map((tag) => [tag.id, tag]));
    let cursor = snapshot.cursor;
    let serverTime = snapshot.serverTime;
    let settingsChanged = snapshot.settingsChanged;
    let profileChanged = snapshot.profileChanged;
    let siteChanged = snapshot.siteChanged;
    for (const update of increments) {
        settingsChanged ||= update.settingsChanged;
        profileChanged ||= update.profileChanged;
        siteChanged ||= update.siteChanged;
        for (const note of update.notes)
            notes.set(note.id, note);
        if (update.facetsFull) {
            folders = new Map(update.folders.map((folder) => [folder.id, folder]));
            tags = new Map(update.tags.map((tag) => [tag.id, tag]));
        }
        else {
            for (const folder of update.folders)
                folders.set(folder.id, folder);
            for (const tag of update.tags)
                tags.set(tag.id, tag);
        }
        for (const deletion of update.deletions) {
            if (deletion.entity === 'note')
                notes.delete(deletion.id);
            else if (deletion.entity === 'folder')
                folders.delete(deletion.id);
            else if (deletion.entity === 'tag')
                tags.delete(deletion.id);
        }
        cursor = update.cursor;
        serverTime = update.serverTime;
    }
    return {
        ...snapshot,
        cursor,
        hasMore: false,
        nextKey: null,
        facetsFull: true,
        settingsChanged,
        profileChanged,
        siteChanged,
        notes: [...notes.values()],
        folders: [...folders.values()],
        tags: [...tags.values()],
        deletions: [],
        serverTime,
    };
}
