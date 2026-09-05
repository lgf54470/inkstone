import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, GripVertical, Pencil, Plus, X } from 'lucide-react';
import type { DateRangeFilter, RelativeFilter } from '@shared/types';
import { cn } from '../lib/cn';
import { getVisibleViewport } from '../lib/viewport';
import { t, useLocale, type MessageKey } from '../lib/i18n';
import { dateKey, parseDateKey } from '../lib/time';
import { useClickOutside, useEscape } from './overlay';
import { MonthGrid } from './calendar-grids';
import { RANGE_PRESET_MAX, loadRangePresets, saveRangePresets, type RangePresetConfig } from '../features/list';

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

const FIXED_PRESETS: RangePreset[] = ['today', 'this-week', 'this-month'];
const FIXED_PRESET_LABELS: Record<RangePreset, MessageKey> = {
    'today': 'notes.range_preset_today',
    'this-week': 'notes.range_preset_this_week',
    'this-month': 'notes.range_preset_this_month',
};

/** Floating editor for an inclusive date-range filter: pick a start or end endpoint on a mini month calendar, leap to nearby months, apply fixed or rolling quick ranges, or clear the range. */
export function DateRangePopover({ anchor, open, onClose, range, onChange, relative, onApplyRelative }: {
    anchor: React.RefObject<HTMLButtonElement | null>;
    open: boolean;
    onClose: () => void;
    range: DateRangeFilter | null;
    onChange: (range: DateRangeFilter | null) => void;
    relative: RelativeFilter | null;
    onApplyRelative: (value: RelativeFilter) => void;
}) {
    const locale = useLocale();
    const weekStart = locale === 'zh-CN' ? 1 : 0;
    const [editing, setEditing] = useState<'start' | 'end'>('start');
    const [cursor, setCursor] = useState(() => {
        const base = range ? new Date(range.end) : new Date();
        return { year: base.getFullYear(), month: base.getMonth() };
    });
    const [position, setPosition] = useState({ top: 0, left: 0, origin: 'top right' });
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [presets, setPresets] = useState<RangePresetConfig[]>(loadRangePresets);
    const popoverRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const [locateFlash, setLocateFlash] = useState(0);
    const current = range ?? { start: dateKey(new Date()), end: dateKey(new Date()) };

    useEscape(open, onClose);
    useClickOutside(anchor ? [popoverRef, anchor] : [popoverRef], open, onClose);

    useEffect(() => {
        saveRangePresets(presets);
    }, [presets]);

    useEffect(() => {
        if (!open) {
            setIsEditorOpen(false);
            return;
        }
        const margin = 8;
        const width = 248;
        const height = isEditorOpen ? 368 : 328;
        const rect = anchor.current?.getBoundingClientRect();
        if (!rect)
            return;
        let top = rect.bottom + 5;
        let left = rect.right - width;
        const viewport = getVisibleViewport();
        const flipUp = top + height > viewport.bottom - margin;
        if (flipUp)
            top = Math.max(viewport.top + margin, rect.top - height - 5);
        left = Math.min(Math.max(viewport.left + margin, left), viewport.right - width - margin);
        setPosition({ top, left, origin: `${flipUp ? 'bottom' : 'top'} right` });
    }, [open, isEditorOpen, anchor]);

    useEffect(() => {
        if (!open)
            return;
        window.requestAnimationFrame(() => {
            gridRef.current?.querySelector<HTMLButtonElement>('[data-range-day]')?.focus();
        });
    }, [open, editing, cursor]);

    useEffect(() => {
        // Locate feedback mirrors the sidebar-calendar jumpFlash: when the popover opens aimed at the range end month, or the endpoint toggles, the mini grid pulses with the accent ring.
        if (!locateFlash)
            return;
        const el = gridRef.current;
        if (!el || typeof el.animate !== 'function')
            return;
        if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
            return;
        const animation = el.animate([
            { opacity: 0.35, boxShadow: '0 0 0 2px var(--accent)' },
            { opacity: 1, boxShadow: '0 0 0 9px rgba(0, 0, 0, 0)' },
        ], { duration: 700, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' });
        return () => animation.cancel();
    }, [locateFlash]);
    useEffect(() => {
        if (open && range)
            setLocateFlash((n) => n + 1);
    }, [open]);
    useEffect(() => {
        if (open)
            setLocateFlash((n) => n + 1);
    }, [editing]);

    const todayKey = useMemo(() => dateKey(new Date()), []);
    const weekdayLabels = useMemo(() => {
        const formatter = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
        return Array.from({ length: 7 }, (_, index) => formatter.format(new Date(2024, 0, 7 + ((weekStart + index) % 7))));
    }, [locale, weekStart]);
    const monthTitle = useMemo(() => new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' }).format(new Date(cursor.year, cursor.month, 1)), [cursor, locale]);
    const shiftMonth = (delta: number) => {
        const month = cursor.month + delta;
        setCursor({ year: cursor.year + Math.floor(month / 12), month: ((month % 12) + 12) % 12 });
    };
    const monthOf = (key: string) => {
        const date = parseDateKey(key);
        return { year: date.getFullYear(), month: date.getMonth() };
    };
    const applyRange = (next: DateRangeFilter) => {
        onChange(next);
        setCursor(monthOf(next.end));
        setEditing('end');
    };
    const applyPreset = (preset: RangePreset) => applyRange(presetRange(preset, new Date(), weekStart));
    const isActivePreset = (preset: RangePresetConfig) => relative != null && relative.days === preset.days && relative.direction === preset.direction;
    const updatePreset = (id: string, patch: Partial<Pick<RangePresetConfig, 'days' | 'direction'>>) => {
        setPresets((list) => list.map((item) => item.id === id ? { ...item, ...patch } : item));
    };
    const removePreset = (id: string) => setPresets((list) => list.filter((item) => item.id !== id));
    const addPreset = () => {
        setPresets((list) => list.length >= RANGE_PRESET_MAX
            ? list
            : [...list, { id: `p${Date.now().toString(36)}`, days: 7, direction: 'edit' }]);
    };
    const dragPresetIndex = useRef<number | null>(null);
    const handlePresetDragStart = (index: number) => (event: React.DragEvent) => {
        dragPresetIndex.current = index;
        event.dataTransfer.effectAllowed = 'move';
        try {
            event.dataTransfer.setData('text/plain', String(index));
        }
        catch {
        }
    };
    const handlePresetDragOver = (index: number) => (event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        const from = dragPresetIndex.current;
        if (from === null || from === index)
            return;
        setPresets((list) => {
            const next = [...list];
            const [moved] = next.splice(from, 1);
            if (!moved)
                return list;
            next.splice(index, 0, moved);
            return next;
        });
        dragPresetIndex.current = index;
    };
    const handlePresetDragEnd = () => {
        dragPresetIndex.current = null;
    };
    const presetMoveButtons = useRef(new Map<string, { up: HTMLButtonElement | null; down: HTMLButtonElement | null }>());
    const handleMovePreset = (index: number, delta: -1 | 1) => {
        const preset = presets[index];
        if (!preset || index + delta < 0 || index + delta >= presets.length)
            return;
        setPresets((list) => movePresetInList(list, index, delta));
        const role = delta === 1 ? 'up' : 'down';
        window.setTimeout(() => {
            presetMoveButtons.current.get(preset.id)?.[role]?.focus();
        }, 0);
    };

    if (!open)
        return null;
    return createPortal(<div ref={popoverRef} role="dialog" aria-label={t("notes.range_editor_title")} className="anim-pop fixed z-[var(--z-hover-card)] rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-2 shadow-[var(--shadow-pop)]" style={{ top: position.top, left: position.left, width: 248, transformOrigin: position.origin }}>
        <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-0.5">
                <button type="button" aria-label={t("sidebar.calendar_prev_month")} onClick={() => shiftMonth(-1)} className="flex size-6 items-center justify-center rounded-[var(--r-sm)] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]">
                    <ChevronLeft size={12}/>
                </button>
                <button type="button" aria-label={t("sidebar.calendar_next_month")} onClick={() => shiftMonth(1)} className="flex size-6 items-center justify-center rounded-[var(--r-sm)] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]">
                    <ChevronRight size={12}/>
                </button>
            </div>
            <span className="text-[11px] font-medium text-[var(--text-secondary)]">{monthTitle}</span>
            <button type="button" aria-label={t("notes.clear_day_filter")} onClick={() => onChange(null)} className="flex size-6 items-center justify-center rounded-[var(--r-sm)] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--danger)]">
                <X size={12}/>
            </button>
        </div>
        <div role="group" aria-label={t("notes.range_editor_endpoint")} className="mt-1.5 flex items-center gap-0.5 rounded-[var(--r-sm)] bg-[var(--bg-inset)] p-0.5">
            <button type="button" aria-pressed={editing === 'start'} onClick={() => {
                setEditing('start');
                setCursor(monthOf(current.start));
            }} className={cn('h-6 flex-1 rounded-[var(--r-sm)] text-[10.5px] transition-colors', editing === 'start' ? 'bg-[var(--bg-overlay)] font-medium text-[var(--accent)] shadow-sm' : 'text-[var(--text-tertiary)]')}>{t("notes.range_editor_start")}</button>
            <button type="button" aria-pressed={editing === 'end'} onClick={() => {
                setEditing('end');
                setCursor(monthOf(current.end));
            }} className={cn('h-6 flex-1 rounded-[var(--r-sm)] text-[10.5px] transition-colors', editing === 'end' ? 'bg-[var(--bg-overlay)] font-medium text-[var(--accent)] shadow-sm' : 'text-[var(--text-tertiary)]')}>{t("notes.range_editor_end")}</button>
        </div>
        <div role="group" aria-label={t("notes.range_preset_group")} className="mt-1 flex flex-wrap items-center gap-0.5">
            {FIXED_PRESETS.map((preset) => (<button key={preset} type="button" onClick={() => applyPreset(preset)} className="h-5 min-w-0 flex-1 rounded-[var(--r-sm)] bg-[var(--bg-inset)] px-0.5 text-[9px] whitespace-nowrap text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]">
                {t(FIXED_PRESET_LABELS[preset])}
            </button>))}
            {presets.map((preset) => (<button key={preset.id} type="button" aria-pressed={isActivePreset(preset)} onClick={() => onApplyRelative({ days: preset.days, direction: preset.direction })} className={cn('h-5 min-w-0 flex-1 rounded-[var(--r-sm)] bg-[var(--bg-inset)] px-0.5 text-[9px] whitespace-nowrap transition-colors hover:bg-[var(--bg-hover)]', isActivePreset(preset) ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]')}>
                {t("notes.range_preset_custom_value0", { value0: preset.days })}
            </button>))}
            <button type="button" aria-label={t("notes.range_preset_edit")} aria-pressed={isEditorOpen} onClick={() => setIsEditorOpen((open) => !open)} className={cn('flex size-5 shrink-0 items-center justify-center rounded-[var(--r-sm)] transition-colors', isEditorOpen ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-[var(--bg-inset)] text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]')}>
                <Pencil size={9}/>
            </button>
        </div>
        {isEditorOpen ? (<div className="mt-1.5 rounded-[var(--r-sm)] border border-[var(--border-subtle)] bg-[var(--bg-inset)] p-1.5">
            <div className="flex items-center justify-between px-0.5 pb-1">
                <span className="text-[10px] font-medium text-[var(--text-secondary)]">{t("notes.range_preset_editor_title")}</span>
                <button type="button" onClick={() => setIsEditorOpen(false)} className="rounded px-1 py-0.5 text-[9.5px] text-[var(--accent)] transition-colors hover:bg-[var(--bg-hover)]">{t("notes.range_preset_done")}</button>
            </div>
            <div className="space-y-1">
                {presets.map((preset, presetIndex) => (<div key={preset.id} draggable onDragStart={handlePresetDragStart(presetIndex)} onDragOver={handlePresetDragOver(presetIndex)} onDragEnd={handlePresetDragEnd} className="flex cursor-grab items-center gap-1 active:cursor-grabbing">
                    <GripVertical size={10} aria-hidden="true" className="shrink-0 text-[var(--text-quaternary)] opacity-60"/>
                    <div className="flex shrink-0 flex-col">
                        <button type="button" ref={(node) => {
                            const slot = presetMoveButtons.current.get(preset.id) ?? { up: null, down: null };
                            slot.up = node;
                            presetMoveButtons.current.set(preset.id, slot);
                        }} aria-label={t("notes.range_preset_move_up")} disabled={presetIndex === 0} onClick={() => handleMovePreset(presetIndex, -1)} className="flex size-3.5 items-center justify-center rounded-[2px] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] disabled:pointer-events-none disabled:opacity-30">
                            <ChevronUp size={9}/>
                        </button>
                        <button type="button" ref={(node) => {
                            const slot = presetMoveButtons.current.get(preset.id) ?? { up: null, down: null };
                            slot.down = node;
                            presetMoveButtons.current.set(preset.id, slot);
                        }} aria-label={t("notes.range_preset_move_down")} disabled={presetIndex === presets.length - 1} onClick={() => handleMovePreset(presetIndex, 1)} className="flex size-3.5 items-center justify-center rounded-[2px] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] disabled:pointer-events-none disabled:opacity-30">
                            <ChevronDown size={9}/>
                        </button>
                    </div>
                    <span className="w-12 shrink-0 text-[9px] text-[var(--text-quaternary)]">{t("notes.range_preset_custom_value0", { value0: preset.days })}</span>
                    <input type="number" min={1} max={365} draggable={false} value={preset.days} aria-label={t("notes.range_preset_custom_value0", { value0: preset.days })} onChange={(event) => {
                        const parsed = parseInt(event.target.value, 10);
                        if (!Number.isNaN(parsed))
                            updatePreset(preset.id, { days: Math.min(365, Math.max(1, parsed)) });
                    }} className="h-6 w-11 rounded-[var(--r-sm)] bg-[var(--bg-overlay)] px-1 text-center text-[10px] tabular text-[var(--text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"/>
                    <div role="group" aria-label={t("notes.range_preset_direction")} className="flex min-w-0 flex-1 overflow-hidden rounded-[var(--r-sm)] border border-[var(--border-subtle)]">
                        <button type="button" aria-pressed={preset.direction === 'edit'} onClick={() => updatePreset(preset.id, { direction: 'edit' })} className={cn('h-6 min-w-0 flex-1 truncate px-1 text-[8.5px] transition-colors', preset.direction === 'edit' ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]' : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]')}>{t("notes.range_preset_follow_edit")}</button>
                        <button type="button" aria-pressed={preset.direction === 'today'} onClick={() => updatePreset(preset.id, { direction: 'today' })} className={cn('h-6 min-w-0 flex-1 truncate border-l border-[var(--border-subtle)] px-1 text-[8.5px] transition-colors', preset.direction === 'today' ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]' : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]')}>{t("notes.range_preset_anchor_today")}</button>
                    </div>
                    <button type="button" aria-label={t("notes.range_preset_delete")} onClick={() => removePreset(preset.id)} className="flex size-6 shrink-0 items-center justify-center rounded-[var(--r-sm)] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--danger)]">
                        <X size={10}/>
                    </button>
                </div>))}
            </div>
            <div className="mt-1.5 flex items-center gap-1 px-0.5">
                <button type="button" disabled={presets.length >= RANGE_PRESET_MAX} onClick={addPreset} className="flex h-6 min-w-0 flex-1 items-center justify-center gap-1 rounded-[var(--r-sm)] text-[9.5px] font-medium text-[var(--accent)] transition-colors hover:bg-[var(--bg-hover)] disabled:pointer-events-none disabled:opacity-40">
                    <Plus size={10}/>{t("notes.range_preset_add")}
                </button>
            </div>
        </div>) : (<>
            <div ref={gridRef} className="mt-1.5">
                <MonthGrid
                    year={cursor.year}
                    month={cursor.month}
                    weekStart={weekStart}
                    weekdayLabels={weekdayLabels}
                    todayKey={todayKey}
                    ariaLabel={t("notes.range_editor_grid_value0", { value0: monthTitle })}
                    renderCell={(cell) => {
                        const isStart = cell.key === current.start;
                        const isEnd = cell.key === current.end;
                        const inRange = cell.key > current.start && cell.key < current.end;
                        const focusable = editing === 'start' ? isStart : isEnd;
                        return (<button type="button" data-range-day={focusable ? 'true' : undefined} tabIndex={focusable ? 0 : -1} aria-pressed={inRange || isStart || isEnd} aria-label={t("notes.range_editor_day_value0", { value0: cell.key, value1: editing === 'start' ? t("notes.range_editor_start") : t("notes.range_editor_end") })} onClick={() => {
                            const next = editing === 'start' ? { start: cell.key, end: current.end } : { start: current.start, end: cell.key };
                            if (next.start > next.end)
                                applyRange({ start: next.end, end: next.start });
                            else
                                applyRange(next);
                        }} className={cn('relative flex aspect-square items-center justify-center rounded-[4px] text-[10px] leading-none transition-colors focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent)]', !cell.inMonth && 'opacity-0', cell.today && 'ring-1 ring-inset ring-[var(--accent)]', isStart || isEnd ? 'bg-[var(--accent)] font-semibold text-[var(--accent-contrast)]' : inRange ? 'bg-[var(--accent-soft)] text-[var(--text-secondary)]' : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]')}>
                            {cell.day}
                        </button>);
                    }}
                />
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 px-0.5 text-[9.5px] text-[var(--text-quaternary)]">
                <CalendarDays size={10} className="shrink-0"/>
                <span className="truncate">{t("notes.range_editor_hint")}</span>
            </div>
        </>)}
    </div>, document.body);
}