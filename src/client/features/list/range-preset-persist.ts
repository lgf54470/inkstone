import type { RelativeFilter } from '@shared/types';

export const RANGE_PRESET_STORAGE_KEY = 'inkstone.range-presets.v1';
export const RANGE_PRESET_MAX = 3;

export interface RangePresetConfig extends RelativeFilter {
    id: string;
}

const DEFAULTS: RangePresetConfig[] = [
    { id: 'p7', days: 7, direction: 'edit' },
    { id: 'p30', days: 30, direction: 'edit' },
];

function sanitize(value: unknown): RangePresetConfig[] {
    if (!value || typeof value !== 'object' || !Array.isArray(value))
        return DEFAULTS;
    const seen = new Set<string>();
    const out: RangePresetConfig[] = [];
    for (const item of value) {
        if (out.length >= RANGE_PRESET_MAX)
            break;
        if (!item || typeof item !== 'object')
            continue;
        const record = item as { id?: unknown; days?: unknown; direction?: unknown };
        const id = typeof record.id === 'string' ? record.id : '';
        if (!id || seen.has(id))
            continue;
        if (typeof record.days !== 'number' || !Number.isInteger(record.days) || record.days < 1 || record.days > 365)
            continue;
        if (record.direction !== 'edit' && record.direction !== 'today')
            continue;
        seen.add(id);
        out.push({ id: id.slice(0, 64), days: record.days, direction: record.direction });
    }
    return out.length ? out : DEFAULTS;
}

/** Load the user's custom rolling range presets, falling back to the defaults. */
export function loadRangePresets(storage: Pick<Storage, 'getItem'> | null = defaultLocalStorage()): RangePresetConfig[] {
    try {
        const raw = storage?.getItem(RANGE_PRESET_STORAGE_KEY);
        return raw ? sanitize(JSON.parse(raw)) : DEFAULTS;
    }
    catch {
        return DEFAULTS;
    }
}

export function saveRangePresets(presets: RangePresetConfig[], storage: Pick<Storage, 'setItem'> | null = defaultLocalStorage()): void {
    try {
        const payload = sanitize(presets);
        storage?.setItem(RANGE_PRESET_STORAGE_KEY, JSON.stringify(payload));
    }
    catch {
    }
}

function defaultLocalStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
    return typeof localStorage === 'undefined' ? null : localStorage;
}