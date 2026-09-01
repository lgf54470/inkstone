import { describe, expect, it } from 'vitest';
import { EN_US_MESSAGES } from '@shared/locales/en-US';
import { GRAPH_APPEARANCE_TOGGLES, GRAPH_CLEAR_TOGGLES, GRAPH_SETTINGS_TOGGLES, GRAPH_SHOW_TOGGLES } from './graph-settings';

describe('graph settings manifest', () => {
    it('documents every boolean graph preference with its default', () => {
        expect(GRAPH_SETTINGS_TOGGLES.map((control) => [control.prefKey, control.default])).toEqual([
            ['clearResetsTag', true],
            ['clearClosesPanel', true],
            ['includeOrphans', true],
            ['includeUnresolved', true],
            ['arrows', true],
            ['labels', true],
        ]);
    });

    it('covers exactly the boolean graph preferences without duplicates', () => {
        const keys = GRAPH_SETTINGS_TOGGLES.map((control) => control.prefKey);
        expect(keys).toHaveLength(new Set(keys).size);
        expect(keys.sort()).toEqual(['arrows', 'clearClosesPanel', 'clearResetsTag', 'includeOrphans', 'includeUnresolved', 'labels']);
    });

    it('splits into the three panel groups without overlap', () => {
        const groups = [GRAPH_CLEAR_TOGGLES, GRAPH_SHOW_TOGGLES, GRAPH_APPEARANCE_TOGGLES];
        const keys = groups.flatMap((group) => group.map((control) => control.prefKey));
        expect(keys).toHaveLength(GRAPH_SETTINGS_TOGGLES.length);
        expect(new Set(keys).size).toBe(GRAPH_SETTINGS_TOGGLES.length);
    });

    it('references label and hint keys that exist in the en-US locale', () => {
        for (const control of GRAPH_SETTINGS_TOGGLES) {
            expect(control.labelKey in EN_US_MESSAGES).toBe(true);
            if (control.hintKey)
                expect(control.hintKey in EN_US_MESSAGES).toBe(true);
        }
    });
});