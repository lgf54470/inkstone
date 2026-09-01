import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIMITS } from '@shared/constants';
import { EN_US_MESSAGES } from '@shared/locales/en-US';
import { useUi } from '../store/ui';
import { clearSelectionToastKey, clearTagSelection, type GraphClearToastKey } from './tag-selection';

type LocaleCoversGraphClearToasts = GraphClearToastKey extends keyof typeof EN_US_MESSAGES ? true : never;
const localeCoversGraphClearToasts: LocaleCoversGraphClearToasts = true;

beforeEach(() => {
    vi.useFakeTimers();
    useUi.setState({ selectedTags: [], toasts: [] });
});

afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
});

describe('clearTagSelection', () => {
    it('clears the multi-tag selection', () => {
        useUi.getState().selectTags(['a', 'b', 'c']);
        clearTagSelection();
        expect(useUi.getState().selectedTags).toEqual([]);
    });

    it('clears even when the selection is at the cap', () => {
        useUi.getState().selectTags(Array.from({ length: LIMITS.tagSelectionMax }, (_, i) => `t${i}`));
        expect(useUi.getState().selectedTags).toHaveLength(LIMITS.tagSelectionMax);
        clearTagSelection();
        expect(useUi.getState().selectedTags).toEqual([]);
    });

    it('pushes a confirmation toast only when notify is requested', () => {
        useUi.getState().selectTags(['a']);
        clearTagSelection();
        expect(useUi.getState().toasts).toHaveLength(0);
        clearTagSelection({ notify: true });
        expect(useUi.getState().toasts).toHaveLength(1);
        expect(useUi.getState().toasts[0].title).toEqual(expect.any(String));
    });

    it('uses a custom toast message when notify is a string', () => {
        useUi.getState().selectTags(['a']);
        clearTagSelection({ notify: 'custom message' });
        expect(useUi.getState().toasts).toHaveLength(1);
        expect(useUi.getState().toasts[0].title).toBe('custom message');
    });
});

describe('clearSelectionToastKey', () => {
    it('returns the default (null) when only the panel closes', () => {
        expect(clearSelectionToastKey(false, true)).toBeNull();
    });

    it('returns the reset key when reset and close are both enabled', () => {
        expect(clearSelectionToastKey(true, true)).toBe('graph.tags_cleared_reset');
    });

    it('mentions the panel staying open when close is disabled', () => {
        expect(clearSelectionToastKey(true, false)).toBe('graph.tags_cleared_reset_panel_stays');
        expect(clearSelectionToastKey(false, false)).toBe('graph.tags_cleared_panel_stays');
    });

    it('references toast keys that exist in the en-US locale', () => {
        expect(localeCoversGraphClearToasts).toBe(true);
        const keys: GraphClearToastKey[] = ['graph.tags_cleared_reset', 'graph.tags_cleared_reset_panel_stays', 'graph.tags_cleared_panel_stays'];
        for (const key of keys)
            expect(key in EN_US_MESSAGES).toBe(true);
    });
});