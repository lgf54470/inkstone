import { beforeEach, describe, expect, it } from 'vitest';
import { RANGE_PRESET_MAX, RANGE_PRESET_STORAGE_KEY, loadRangePresets, saveRangePresets } from './range-preset-persist';

describe('range preset persistence', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('falls back to the two default rolling presets when nothing is stored', () => {
        expect(loadRangePresets(localStorage)).toEqual([
            { id: 'p7', days: 7, direction: 'edit' },
            { id: 'p30', days: 30, direction: 'edit' },
        ]);
    });

    it('round-trips custom presets', () => {
        const presets = [
            { id: 'a', days: 14, direction: 'today' as const },
            { id: 'b', days: 90, direction: 'edit' as const },
        ];
        saveRangePresets(presets, localStorage);
        expect(loadRangePresets(localStorage)).toEqual(presets);
    });

    it('sanitizes malformed entries and caps the list', () => {
        localStorage.setItem(RANGE_PRESET_STORAGE_KEY, JSON.stringify([
            { id: 'a', days: 14, direction: 'today' },
            { id: 'b', days: 0, direction: 'edit' },
            { id: 'c', days: '30', direction: 'edit' },
            { id: 'd', days: 400, direction: 'edit' },
            { id: 'e', days: 2, direction: 'weird' },
            { id: 'f', days: 2, direction: 'edit' },
            { id: 'g', days: 2, direction: 'edit' },
            { id: 'h', days: 2, direction: 'edit' },
        ]));
        const loaded = loadRangePresets(localStorage);
        expect(loaded.map((item) => item.id)).toEqual(['a', 'f', 'g']);
        expect(loaded.length).toBeLessThanOrEqual(RANGE_PRESET_MAX);
    });

    it('falls back safely on corrupt JSON and tolerates missing storage', () => {
        localStorage.setItem(RANGE_PRESET_STORAGE_KEY, '{broken');
        expect(loadRangePresets(localStorage)).toHaveLength(2);
        expect(loadRangePresets(null)).toHaveLength(2);
        expect(() => saveRangePresets([], null)).not.toThrow();
    });
});