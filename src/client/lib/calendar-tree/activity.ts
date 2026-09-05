import type { NoteSummary } from "@shared/types";
import { dateKey } from "../time";

// The activity-heatmap calendar derives three whole-vault structures from each
// note (per-day updatedAt counts, first-note-per-title lookup, per-day note
// lists), and every typing pause commits a notes-map identity change, so all
// three Object.values scans used to re-run over the full vault per commit.
// Build the projection once and then repair it by diffing note references: a
// commit only replaces the edited note's object, so untouched day buckets and
// the title map keep their identities (memoized consumers skip them), and only
// the edited note's old/new day slices and title slot are recomputed.
export interface ActivityDayNote {
    id: string
    title: string
    updatedAt: number
}

export interface ActivityProjection {
    counts: Map<string, number>
    noteIdByTitle: Map<string, string>
    notesByDay: Map<string, ActivityDayNote[]>
}

export interface ActivityEntry {
    ref: NoteSummary
    key: string
    title: string
}

export interface ActivityProjectionSlot extends ActivityProjection {
    notes: Record<string, NoteSummary>
    byId: Map<string, ActivityEntry>
    titleCounts: Map<string, number>
}

let activityProjectionSlot: ActivityProjectionSlot | null = null

export function buildActivityProjectionFresh(notes: Record<string, NoteSummary>): ActivityProjectionSlot {
    const counts = new Map<string, number>();
    const noteIdByTitle = new Map<string, string>();
    const notesByDay = new Map<string, ActivityDayNote[]>();
    const byId = new Map<string, ActivityEntry>();
    const titleCounts = new Map<string, number>();
    for (const id in notes) {
        const note = notes[id]!;
        if (note.deletedAt !== null)
            continue;
        const key = dateKey(new Date(note.updatedAt));
        counts.set(key, (counts.get(key) ?? 0) + 1);
        byId.set(id, { ref: note, key, title: note.title });
        titleCounts.set(note.title, (titleCounts.get(note.title) ?? 0) + 1);
        if (!noteIdByTitle.has(note.title))
            noteIdByTitle.set(note.title, id);
        const list = notesByDay.get(key);
        const item: ActivityDayNote = { id, title: note.title, updatedAt: note.updatedAt };
        if (list)
            list.push(item);
        else
            notesByDay.set(key, [item]);
    }
    for (const list of notesByDay.values())
        list.sort((a, b) => b.updatedAt - a.updatedAt);
    return { notes, counts, noteIdByTitle, notesByDay, byId, titleCounts };
}

// First-wins over insertion order, matching the naive rebuild: the map holds
// the first alive note per title, so a vacated slot is re-claimed by the first
// alive note in map order that still carries the title.
export function claimNextNoteWithTitle(notes: Record<string, NoteSummary>, title: string): string | null {
    for (const id in notes) {
        const note = notes[id]!;
        if (note.deletedAt === null && note.title === title)
            return id;
    }
    return null;
}

export function dropTitleClaim(titleCounts: Map<string, number>, titles: Map<string, string>, notes: Record<string, NoteSummary>, title: string, id: string): void {
    const rest = (titleCounts.get(title) ?? 0) - 1;
    if (rest > 0) {
        titleCounts.set(title, rest);
        if (titles.get(title) === id) {
            titles.delete(title);
            const nextOwner = claimNextNoteWithTitle(notes, title);
            if (nextOwner)
                titles.set(title, nextOwner);
        }
    } else {
        titleCounts.delete(title);
        if (titles.get(title) === id)
            titles.delete(title);
    }
}

// The naive rebuild only ever records days with at least one note, so the
// incremental must drop a key when its count reaches zero (keeps the map
// bounded and matches the reference shape exactly).
export function decrementCount(counts: Map<string, number>, key: string): void {
    const next = (counts.get(key) ?? 0) - 1;
    if (next > 0)
        counts.set(key, next);
    else
        counts.delete(key);
}

export function removeFromDay(byDay: Map<string, ActivityDayNote[]>, key: string, id: string): void {
    const list = byDay.get(key);
    if (!list)
        return;
    const copy = list.filter((item) => item.id !== id);
    if (copy.length > 0)
        byDay.set(key, copy);
    else
        byDay.delete(key);
}

export function upsertInDay(byDay: Map<string, ActivityDayNote[]>, key: string, item: ActivityDayNote): void {
    const list = byDay.get(key);
    const copy = list ? list.map((entry) => (entry.id === item.id ? item : entry)) : [];
    if (!copy.some((entry) => entry.id === item.id))
        copy.push(item);
    copy.sort((a, b) => b.updatedAt - a.updatedAt);
    byDay.set(key, copy);
}

export function updateActivityProjection(slot: ActivityProjectionSlot, next: Record<string, NoteSummary>): ActivityProjectionSlot {
    const oldCounts = slot.counts;
    const oldTitles = slot.noteIdByTitle;
    const oldByDay = slot.notesByDay;
    const byId = slot.byId;
    const titleCounts = slot.titleCounts;
    let counts = oldCounts;
    let titles = oldTitles;
    let byDay = oldByDay;
    let visited = 0;
    let tombstoned = 0;
    for (const id in next) {
        visited++;
        const note = next[id]!;
        const prev = byId.get(id);
        if (prev && prev.ref === note)
            continue;
        if (note.deletedAt !== null) {
            tombstoned++;
            if (!prev)
                continue;
            byId.delete(id);
            if (counts === oldCounts)
                counts = new Map(oldCounts);
            if (byDay === oldByDay)
                byDay = new Map(oldByDay);
            decrementCount(counts, prev.key);
            removeFromDay(byDay, prev.key, id);
            if (titles === oldTitles)
                titles = new Map(oldTitles);
            dropTitleClaim(titleCounts, titles, next, prev.title, id);
            continue;
        }
        const key = dateKey(new Date(note.updatedAt));
        if (prev && prev.key === key && prev.title === note.title && prev.ref.updatedAt === note.updatedAt) {
            // A commit that touched fields this projection does not read
            // (excerpt, tags, pin, ...): keep every output identity stable.
            // updatedAt feeds both the day key and the day-list sort, so it
            // must match down to the millisecond for the slice to be skipped.
            byId.set(id, { ref: note, key, title: note.title });
            continue;
        }
        if (!prev) {
            if (counts === oldCounts)
                counts = new Map(oldCounts);
            if (byDay === oldByDay)
                byDay = new Map(oldByDay);
            counts.set(key, (counts.get(key) ?? 0) + 1);
            upsertInDay(byDay, key, { id, title: note.title, updatedAt: note.updatedAt });
            if (titles === oldTitles)
                titles = new Map(oldTitles);
            if (titles.get(note.title) === undefined)
                titles.set(note.title, id);
            titleCounts.set(note.title, (titleCounts.get(note.title) ?? 0) + 1);
            byId.set(id, { ref: note, key, title: note.title });
            continue;
        }
        // An alive note whose projection fields actually changed.
        if (prev.key !== key) {
            if (counts === oldCounts)
                counts = new Map(oldCounts);
            decrementCount(counts, prev.key);
            counts.set(key, (counts.get(key) ?? 0) + 1);
            if (byDay === oldByDay)
                byDay = new Map(oldByDay);
            removeFromDay(byDay, prev.key, id);
            upsertInDay(byDay, key, { id, title: note.title, updatedAt: note.updatedAt });
        } else {
            // Same day: per-day count is unchanged; only the day's list needs
            // rebuilding, so the counts map keeps its identity.
            if (byDay === oldByDay)
                byDay = new Map(oldByDay);
            upsertInDay(byDay, key, { id, title: note.title, updatedAt: note.updatedAt });
        }
        if (prev.title !== note.title) {
            if (titles === oldTitles)
                titles = new Map(oldTitles);
            dropTitleClaim(titleCounts, titles, next, prev.title, id);
            if (titles.get(note.title) === undefined)
                titles.set(note.title, id);
            titleCounts.set(note.title, (titleCounts.get(note.title) ?? 0) + 1);
        }
        byId.set(id, { ref: note, key, title: note.title });
    }
    if (visited - tombstoned !== byId.size) {
        // An id vanished from the map without a tombstone: drop its stale
        // contributions (a rare path that costs one extra walk when it fires).
        if (counts === oldCounts)
            counts = new Map(oldCounts);
        if (byDay === oldByDay)
            byDay = new Map(oldByDay);
        if (titles === oldTitles)
            titles = new Map(oldTitles);
        for (const [id, entry] of [...byId]) {
            if (next[id] !== undefined)
                continue;
            byId.delete(id);
            decrementCount(counts, entry.key);
            removeFromDay(byDay, entry.key, id);
            dropTitleClaim(titleCounts, titles, next, entry.title, id);
        }
    }
    return { notes: next, counts, noteIdByTitle: titles, notesByDay: byDay, byId, titleCounts };
}

export function buildActivityProjectionCached(notes: Record<string, NoteSummary>): ActivityProjection {
    const slot = activityProjectionSlot;
    if (slot && slot.notes === notes)
        return slot;
    const next = slot ? updateActivityProjection(slot, notes) : buildActivityProjectionFresh(notes);
    activityProjectionSlot = next;
    return next;
}
