import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import type { DateRangeFilter } from '@shared/types';
import { dateKey, rollingWindowKey } from '../../lib/time';
import { useNotes } from '../../store/notes';
import { useUi } from '../../store/ui';
import { gapPeekRange, latestEditOutsideWindow, memoLatestEditKey, relativeAnchorKey } from './use-rolling-filter';

export interface GapInfo {
    days: number;
    ahead: boolean;
}

interface GapIndicatorState {
    /** Newest non-deleted note's edit day key (null when there are no notes). */
    latestEditKey: string | null;
    /** Newest edit's distance/direction outside the observed window (null when inside or inputs are empty). */
    gap: GapInfo | null;
    /** The gap value rendered while a peek hides the live one. */
    lastGap: GapInfo | null;
    /** Expanded range while a peek is active; doubles as the observed window during the peek. */
    peekRange: DateRangeFilter | null;
    /** The window to restore after a peek when no rolling filter is active. */
    prevWindow: DateRangeFilter | null;
    setGap: (latestEditKey: string | null, window: DateRangeFilter | null) => void;
    /** Temporarily expand the window to cover the whole gap; returns the expanded range or null. */
    engagePeek: () => DateRangeFilter | null;
    /** Restore the window after a peek. */
    releasePeek: () => void;
}

/** Single source of truth for the "newest edit outside the window" indicator shared by the filter chip, the calendar banner, and the dashed calendar day. */
export const useGapIndicatorStore = create<GapIndicatorState>()((set, get) => ({
    latestEditKey: null,
    gap: null,
    lastGap: null,
    peekRange: null,
    prevWindow: null,
    setGap: (latestEditKey, window) => {
        const outside = latestEditOutsideWindow(get().peekRange ?? window, latestEditKey);
        const gap = outside ? { days: outside.days, ahead: outside.ahead } : null;
        set((state) => ({
            latestEditKey,
            gap,
            lastGap: gap ?? state.lastGap,
        }));
    },
    engagePeek: () => {
        const { latestEditKey, peekRange } = get();
        if (peekRange)
            return peekRange;
        const window = useUi.getState().dateFilter;
        const next = gapPeekRange(window, latestEditKey);
        if (!next)
            return null;
        set({ peekRange: next, prevWindow: window });
        useUi.getState().setDateFilter(next);
        return next;
    },
    releasePeek: () => {
        const { peekRange, latestEditKey, prevWindow } = get();
        if (!peekRange)
            return;
        set({ peekRange: null });
        const relative = useUi.getState().relativeFilter;
        if (relative) {
            const anchor = relativeAnchorKey(relative, latestEditKey, dateKey(new Date()));
            if (anchor)
                useUi.getState().setDateFilter(rollingWindowKey(relative.days, anchor));
        }
        else if (prevWindow) {
            useUi.getState().setDateFilter(prevWindow);
        }
        get().setGap(latestEditKey, useUi.getState().dateFilter);
    },
}));

/** Recomputes the shared gap whenever the notes or the date filter change. Mount once, anywhere in the tree. */
export function useGapIndicator(): void {
    const notes = useNotes((s) => s.notes);
    const dateFilter = useUi((s) => s.dateFilter);
    const latestEditKey = useMemo(() => memoLatestEditKey(notes), [notes]);
    useEffect(() => {
        useGapIndicatorStore.getState().setGap(latestEditKey, dateFilter);
    }, [latestEditKey, dateFilter]);
}