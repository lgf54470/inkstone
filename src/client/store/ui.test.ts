import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIMITS } from '@shared/constants';
import { toastWithUndo, useUi } from './ui';

beforeEach(() => {
    vi.useFakeTimers();
    useUi.setState({ selectedTags: [] });
});

afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
});

describe('tag selection cap', () => {
    it('allows up to the cap and refuses additional toggles', () => {
        const { toggleTagSelection } = useUi.getState();
        for (let i = 0; i < LIMITS.tagSelectionMax; i++)
            toggleTagSelection(`tag-${i}`);
        expect(useUi.getState().selectedTags).toHaveLength(LIMITS.tagSelectionMax);
        toggleTagSelection('overflow');
        expect(useUi.getState().selectedTags).toHaveLength(LIMITS.tagSelectionMax);
        expect(useUi.getState().selectedTags).not.toContain('overflow');
    });

    it('still allows toggling a selected tag off while at the cap', () => {
        const { toggleTagSelection } = useUi.getState();
        for (let i = 0; i < LIMITS.tagSelectionMax; i++)
            toggleTagSelection(`tag-${i}`);
        toggleTagSelection('tag-0');
        toggleTagSelection('new-tag');
        expect(useUi.getState().selectedTags).toHaveLength(LIMITS.tagSelectionMax);
        expect(useUi.getState().selectedTags).not.toContain('tag-0');
        expect(useUi.getState().selectedTags).toContain('new-tag');
    });

    it('truncates bulk selectTags at the cap', () => {
        const { selectTags } = useUi.getState();
        selectTags(Array.from({ length: LIMITS.tagSelectionMax + 10 }, (_, i) => `t${i}`));
        expect(useUi.getState().selectedTags).toHaveLength(LIMITS.tagSelectionMax);
    });

    it('selectTags deduplicates against the current selection', () => {
        const { selectTags } = useUi.getState();
        selectTags(['a', 'b']);
        selectTags(['b', 'c']);
        expect(useUi.getState().selectedTags).toEqual(['a', 'b', 'c']);
    });
});

describe('calendarJump', () => {
    it('records the requested month with an incrementing nonce so repeats still fire', () => {
        const { requestCalendarJump } = useUi.getState();
        expect(useUi.getState().calendarJump).toBeNull();
        requestCalendarJump(2026, 8);
        requestCalendarJump(2026, 8);
        expect(useUi.getState().calendarJump).toMatchObject({ year: 2026, month: 8 });
        expect(useUi.getState().calendarJump?.nonce).toBe(2);
    });
});

describe('list filter combo', () => {
    it('clearAllFilters wipes the whole combo and its undo restores the exact previous state', () => {
        const { setListQuery, setDateFilter, setRelativeFilter, selectTags, setSelectedTagsMatch, clearAllFilters } = useUi.getState();
        setListQuery('hello');
        setDateFilter({ start: '2026-01-01', end: '2026-01-31' });
        setRelativeFilter({ days: 7, direction: 'edit' });
        selectTags(['a', 'b']);
        setSelectedTagsMatch('all');
        clearAllFilters();
        const cleared = useUi.getState();
        expect(cleared.listQuery).toBe('');
        expect(cleared.dateFilter).toBeNull();
        expect(cleared.relativeFilter).toBeNull();
        expect(cleared.selectedTags).toEqual([]);
        expect(cleared.selectedTagsMatch).toBe('any');
        const toast = useUi.getState().toasts.at(-1);
        expect(toast?.kind).toBe('undo');
        toast?.action?.run();
        const restored = useUi.getState();
        expect(restored.listQuery).toBe('hello');
        expect(restored.dateFilter).toEqual({ start: '2026-01-01', end: '2026-01-31' });
        expect(restored.relativeFilter).toEqual({ days: 7, direction: 'edit' });
        expect(restored.selectedTags).toEqual(['a', 'b']);
        expect(restored.selectedTagsMatch).toBe('all');
    });

    it('toastWithUndo marks undo toasts and vibrates when the platform supports it', () => {
        const vibrate = vi.fn();
        Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
        try {
            const done = vi.fn();
            toastWithUndo('notes.moved_to_trash', done);
            const toast = useUi.getState().toasts.at(-1);
            expect(toast?.kind).toBe('undo');
            expect(toast?.action?.label).toBe('common.undo');
            expect(vibrate).toHaveBeenCalledWith(10);
            toast?.action?.run();
            expect(done).toHaveBeenCalled();
        }
        finally {
            delete (navigator as { vibrate?: unknown }).vibrate;
        }
    });
});