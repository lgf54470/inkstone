import type { DateRangeFilter } from '@shared/types';
import type { MessageKey } from '../lib/i18n';
import { dateKey } from '../lib/time';

export type RangePreset = 'today' | 'this-week' | 'this-month';

/** Compute the day keys for a fixed quick preset range anchored at `today`. */
export function presetRange(preset: RangePreset, today: Date, weekStart: 0 | 1): DateRangeFilter {
  const key = (date: Date) => dateKey(date);
  switch (preset) {
    case 'today':
      return { start: key(today), end: key(today) };
    case 'this-week': {
      const start = new Date(today);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - ((start.getDay() - weekStart + 7) % 7));
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return { start: key(start), end: key(end) };
    }
    case 'this-month':
      return {
        start: key(new Date(today.getFullYear(), today.getMonth(), 1)),
        end: key(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
      };
  }
}

/** Move a preset within its list by one position (no-op at the edges). */
export function movePresetInList<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length)
    return [...list];
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export const FIXED_PRESETS: RangePreset[] = ['today', 'this-week', 'this-month'];
export const FIXED_PRESET_LABELS: Record<RangePreset, MessageKey> = {
  'today': 'notes.range_preset_today',
  'this-week': 'notes.range_preset_this_week',
  'this-month': 'notes.range_preset_this_month',
};