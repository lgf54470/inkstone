import { useEffect, useMemo, useState } from 'react';
import type { DateRangeFilter, RelativeFilter } from '@shared/types';
import { dateKey, daysBetweenKeys, rollingWindowKey } from '../../lib/time';
import { useNotes } from '../../store/notes';
import { useUi } from '../../store/ui';

/** Latest non-deleted note's edit date key (null when there are no notes). */
export function computeLatestEditKey(notes: Readonly<Record<string, { updatedAt: number; deletedAt: number | null }>>): string | null {
    let latest = 0;
    for (const note of Object.values(notes)) {
        if (note.deletedAt !== null)
            continue;
        if (note.updatedAt > latest)
            latest = note.updatedAt;
    }
    return latest === 0 ? null : dateKey(new Date(latest));
}

/** Newest edit key with whole days it sits outside the selected window (null when it is inside or the inputs are empty). */
export function latestEditOutsideWindow(selectedRange: DateRangeFilter | null | undefined, latestEditKey: string | null | undefined): { key: string; days: number; ahead: boolean } | null {
    if (!selectedRange || !latestEditKey)
        return null;
    if (latestEditKey >= selectedRange.start && latestEditKey <= selectedRange.end)
        return null;
    const ahead = latestEditKey > selectedRange.end;
    const edge = ahead ? selectedRange.end : selectedRange.start;
    return { key: latestEditKey, days: Math.abs(daysBetweenKeys(latestEditKey, edge)), ahead };
}

/** Window covering both the current range and the whole gap up to the newest edit (null when the edit is inside or inputs are empty). */
export function gapPeekRange(window: DateRangeFilter | null, latestEditKey: string | null): DateRangeFilter | null {
    if (!window || !latestEditKey)
        return null;
    if (latestEditKey >= window.start && latestEditKey <= window.end)
        return null;
    return {
        start: latestEditKey < window.start ? latestEditKey : window.start,
        end: latestEditKey > window.end ? latestEditKey : window.end,
    };
}

/** Day key the rolling window anchors on: the newest edit for the follow-edit direction, otherwise the later of the calendar today and the newest edit (the "now" moment — the window end advances with the save stream instead of staying pinned to the natural day). */
export function relativeAnchorKey(relative: RelativeFilter | null, latestEditKey: string | null, todayKey: string): string | null {
    if (!relative)
        return null;
    if (relative.direction === 'edit')
        return latestEditKey ?? todayKey;
    return latestEditKey != null && latestEditKey > todayKey ? latestEditKey : todayKey;
}

/** Subscribes to note saves: any edit mutates the notes store, so `latestEditKey` recomputes the moment a note is written and the window re-materializes with zero latency. A single midnight-aligned tick covers only the today-anchored direction. */
function useTodayKey(): string {
    const [todayKey, setTodayKey] = useState(() => dateKey(new Date()));
    useEffect(() => {
        const timer = window.setInterval(() => {
            const key = dateKey(new Date());
            setTodayKey((previous) => (previous === key ? previous : key));
        }, 60_000);
        return () => window.clearInterval(timer);
    }, []);
    return todayKey;
}

/** Keeps the rolling date filter materialized: the window recomputes whenever a note save (or the day rollover) changes its anchor. Mount once, anywhere in the tree. */
export function useRollingDateFilter(): void {
    const relative = useUi((s) => s.relativeFilter);
    const notes = useNotes((s) => s.notes);
    const latestEditKey = useMemo(() => computeLatestEditKey(notes), [notes]);
    const todayKey = useTodayKey();
    useEffect(() => {
        const anchor = relativeAnchorKey(relative, latestEditKey, todayKey);
        if (anchor === null)
            return;
        const next = rollingWindowKey(relative!.days, anchor);
        const current = useUi.getState().dateFilter;
        if (!current || current.start !== next.start || current.end !== next.end)
            useUi.getState().setDateFilter(next);
    }, [relative, latestEditKey, todayKey]);
}