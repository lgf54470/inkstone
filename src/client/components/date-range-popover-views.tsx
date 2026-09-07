import type { JSX } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, GripVertical, Pencil, Plus, X } from 'lucide-react';
import type { DateRangeFilter, RelativeFilter } from '@shared/types';
import { cn } from '../lib/cn';
import { t } from '../lib/i18n';
import { MonthGrid } from './calendar-grids';
import { FIXED_PRESET_LABELS, FIXED_PRESETS } from './date-range-popover-core';
import { RANGE_PRESET_MAX, type RangePresetConfig } from '../features/list';
import type { PresetDrag } from './use-date-range-popover';

export function RangePopoverHeader({ monthTitle, onPrevMonth, onNextMonth, onClear }: {
    monthTitle: string;
    onPrevMonth: () => void;
    onNextMonth: () => void;
    onClear: () => void;
}): JSX.Element {
    return (<div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-0.5">
            <button type="button" aria-label={t("sidebar.calendar_prev_month")} onClick={onPrevMonth} className="flex size-6 items-center justify-center rounded-[var(--r-sm)] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]">
                <ChevronLeft size={12}/>
            </button>
            <button type="button" aria-label={t("sidebar.calendar_next_month")} onClick={onNextMonth} className="flex size-6 items-center justify-center rounded-[var(--r-sm)] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]">
                <ChevronRight size={12}/>
            </button>
        </div>
        <span className="text-[length:var(--text-11)] font-medium text-[var(--text-secondary)]">{monthTitle}</span>
        <button type="button" aria-label={t("notes.clear_day_filter")} onClick={onClear} className="flex size-6 items-center justify-center rounded-[var(--r-sm)] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--danger)]">
            <X size={12}/>
        </button>
    </div>);
}

export function EndpointToggle({ editing, onSelect }: {
    editing: 'start' | 'end';
    onSelect: (endpoint: 'start' | 'end') => void;
}): JSX.Element {
    return (<div role="group" aria-label={t("notes.range_editor_endpoint")} className="mt-1.5 flex items-center gap-0.5 rounded-[var(--r-sm)] bg-[var(--bg-inset)] p-0.5">
        <button type="button" aria-pressed={editing === 'start'} onClick={() => onSelect('start')} className={cn('h-6 flex-1 rounded-[var(--r-sm)] text-[length:var(--text-10\\.5)] transition-colors', editing === 'start' ? 'bg-[var(--bg-overlay)] font-medium text-[var(--accent)] shadow-[var(--shadow-sm)]' : 'text-[var(--text-tertiary)]')}>{t("notes.range_editor_start")}</button>
        <button type="button" aria-pressed={editing === 'end'} onClick={() => onSelect('end')} className={cn('h-6 flex-1 rounded-[var(--r-sm)] text-[length:var(--text-10\\.5)] transition-colors', editing === 'end' ? 'bg-[var(--bg-overlay)] font-medium text-[var(--accent)] shadow-[var(--shadow-sm)]' : 'text-[var(--text-tertiary)]')}>{t("notes.range_editor_end")}</button>
    </div>);
}

export function PresetBar({ presets, isActivePreset, onApplyPreset, onApplyRelative, isEditorOpen, onToggleEditor }: {
    presets: RangePresetConfig[];
    isActivePreset: (preset: RangePresetConfig) => boolean;
    onApplyPreset: (preset: 'today' | 'this-week' | 'this-month') => void;
    onApplyRelative: (value: RelativeFilter) => void;
    isEditorOpen: boolean;
    onToggleEditor: () => void;
}): JSX.Element {
    return (<div role="group" aria-label={t("notes.range_preset_group")} className="mt-1 flex flex-wrap items-center gap-0.5">
        {FIXED_PRESETS.map((preset) => (<button key={preset} type="button" onClick={() => onApplyPreset(preset)} className="h-5 min-w-0 flex-1 rounded-[var(--r-sm)] bg-[var(--bg-inset)] px-0.5 text-[length:var(--text-9)] whitespace-nowrap text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]">
            {t(FIXED_PRESET_LABELS[preset])}
        </button>))}
        {presets.map((preset) => (<button key={preset.id} type="button" aria-pressed={isActivePreset(preset)} onClick={() => onApplyRelative({ days: preset.days, direction: preset.direction })} className={cn('h-5 min-w-0 flex-1 rounded-[var(--r-sm)] bg-[var(--bg-inset)] px-0.5 text-[length:var(--text-9)] whitespace-nowrap transition-colors hover:bg-[var(--bg-hover)]', isActivePreset(preset) ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]')}>
            {t("notes.range_preset_custom_value0", { value0: preset.days })}
        </button>))}
        <button type="button" aria-label={t("notes.range_preset_edit")} aria-pressed={isEditorOpen} onClick={onToggleEditor} className={cn('flex size-5 shrink-0 items-center justify-center rounded-[var(--r-sm)] transition-colors', isEditorOpen ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-[var(--bg-inset)] text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]')}>
            <Pencil size={9}/>
        </button>
    </div>);
}

export function PresetEditor({ presets, drag, onUpdate, onRemove, onAdd, onClose }: {
    presets: RangePresetConfig[];
    drag: PresetDrag;
    onUpdate: (id: string, patch: Partial<Pick<RangePresetConfig, 'days' | 'direction'>>) => void;
    onRemove: (id: string) => void;
    onAdd: () => void;
    onClose: () => void;
}): JSX.Element {
    return (<div className="mt-1.5 rounded-[var(--r-sm)] border border-[var(--border-subtle)] bg-[var(--bg-inset)] p-1.5">
        <div className="flex items-center justify-between px-0.5 pb-1">
            <span className="text-[length:var(--text-10)] font-medium text-[var(--text-secondary)]">{t("notes.range_preset_editor_title")}</span>
            <button type="button" onClick={onClose} className="rounded px-1 py-0.5 text-[length:var(--text-9\\.5)] text-[var(--accent)] transition-colors hover:bg-[var(--bg-hover)]">{t("notes.range_preset_done")}</button>
        </div>
        <div className="space-y-1">
            {presets.map((preset, presetIndex) => (<PresetRow key={preset.id} preset={preset} presetIndex={presetIndex} total={presets.length} drag={drag} onUpdate={onUpdate} onRemove={onRemove} onMove={drag.movePreset}/>))}
        </div>
        <div className="mt-1.5 flex items-center gap-1 px-0.5">
            <button type="button" disabled={presets.length >= RANGE_PRESET_MAX} onClick={onAdd} className="flex h-6 min-w-0 flex-1 items-center justify-center gap-1 rounded-[var(--r-sm)] text-[length:var(--text-9\\.5)] font-medium text-[var(--accent)] transition-colors hover:bg-[var(--bg-hover)] disabled:pointer-events-none disabled:opacity-40">
                <Plus size={10}/>{t("notes.range_preset_add")}
            </button>
        </div>
    </div>);
}

function PresetRow({ preset, presetIndex, total, drag, onUpdate, onRemove, onMove }: {
    preset: RangePresetConfig;
    presetIndex: number;
    total: number;
    drag: PresetDrag;
    onUpdate: (id: string, patch: Partial<Pick<RangePresetConfig, 'days' | 'direction'>>) => void;
    onRemove: (id: string) => void;
    onMove: (index: number, delta: -1 | 1) => void;
}): JSX.Element {
    const register = (slot: 'up' | 'down') => (node: HTMLButtonElement | null) => {
        const entry = drag.moveButtonsRef.current.get(preset.id) ?? { up: null, down: null };
        entry[slot] = node;
        drag.moveButtonsRef.current.set(preset.id, entry);
    };
    return (<div key={preset.id} draggable onDragStart={drag.dragStart(presetIndex)} onDragOver={drag.dragOver(presetIndex)} onDragEnd={drag.dragEnd} className="flex cursor-grab items-center gap-1 active:cursor-grabbing">
        <GripVertical size={10} aria-hidden="true" className="shrink-0 text-[var(--text-quaternary)] opacity-60"/>
        <div className="flex shrink-0 flex-col">
            <button type="button" ref={register('up')} aria-label={t("notes.range_preset_move_up")} disabled={presetIndex === 0} onClick={() => onMove(presetIndex, -1)} className="flex size-3.5 items-center justify-center rounded-[var(--r-2)] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] disabled:pointer-events-none disabled:opacity-30">
                <ChevronUp size={9}/>
            </button>
            <button type="button" ref={register('down')} aria-label={t("notes.range_preset_move_down")} disabled={presetIndex === total - 1} onClick={() => onMove(presetIndex, 1)} className="flex size-3.5 items-center justify-center rounded-[var(--r-2)] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] disabled:pointer-events-none disabled:opacity-30">
                <ChevronDown size={9}/>
            </button>
        </div>
        <span className="w-12 shrink-0 text-[length:var(--text-9)] text-[var(--text-quaternary)]">{t("notes.range_preset_custom_value0", { value0: preset.days })}</span>
        <input type="number" min={1} max={365} draggable={false} value={preset.days} aria-label={t("notes.range_preset_custom_value0", { value0: preset.days })} onChange={(event) => {
            const parsed = parseInt(event.target.value, 10);
            if (!Number.isNaN(parsed))
                onUpdate(preset.id, { days: Math.min(365, Math.max(1, parsed)) });
        }} className="h-6 w-11 rounded-[var(--r-sm)] bg-[var(--bg-overlay)] px-1 text-center text-[length:var(--text-10)] tabular text-[var(--text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"/>
        <div role="group" aria-label={t("notes.range_preset_direction")} className="flex min-w-0 flex-1 overflow-hidden rounded-[var(--r-sm)] border border-[var(--border-subtle)]">
            <button type="button" aria-pressed={preset.direction === 'edit'} onClick={() => onUpdate(preset.id, { direction: 'edit' })} className={cn('h-6 min-w-0 flex-1 truncate px-1 text-[length:var(--text-8\\.5)] transition-colors', preset.direction === 'edit' ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]' : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]')}>{t("notes.range_preset_follow_edit")}</button>
            <button type="button" aria-pressed={preset.direction === 'today'} onClick={() => onUpdate(preset.id, { direction: 'today' })} className={cn('h-6 min-w-0 flex-1 truncate border-l border-[var(--border-subtle)] px-1 text-[length:var(--text-8\\.5)] transition-colors', preset.direction === 'today' ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]' : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]')}>{t("notes.range_preset_anchor_today")}</button>
        </div>
        <button type="button" aria-label={t("notes.range_preset_delete")} onClick={() => onRemove(preset.id)} className="flex size-6 shrink-0 items-center justify-center rounded-[var(--r-sm)] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--danger)]">
            <X size={10}/>
        </button>
    </div>);
}

export function RangeMonthGrid({ gridRef, cursor, weekStart, weekdayLabels, todayKey, monthTitle, current, editing, onPick }: {
    gridRef: React.RefObject<HTMLDivElement | null>;
    cursor: { year: number; month: number };
    weekStart: 0 | 1;
    weekdayLabels: string[];
    todayKey: string;
    monthTitle: string;
    current: DateRangeFilter;
    editing: 'start' | 'end';
    onPick: (key: string) => void;
}): JSX.Element {
    return (<div ref={gridRef} className="mt-1.5">
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
                return (<button type="button" data-range-day={focusable ? 'true' : undefined} tabIndex={focusable ? 0 : -1} aria-pressed={inRange || isStart || isEnd} aria-label={t("notes.range_editor_day_value0", { value0: cell.key, value1: editing === 'start' ? t("notes.range_editor_start") : t("notes.range_editor_end") })} onClick={() => onPick(cell.key)} className={cn('relative flex aspect-square items-center justify-center rounded-[var(--r-xs)] text-[length:var(--text-10)] leading-none transition-colors focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent)]', !cell.inMonth && 'opacity-0', cell.today && 'ring-1 ring-inset ring-[var(--accent)]', isStart || isEnd ? 'bg-[var(--accent)] font-semibold text-[var(--accent-contrast)]' : inRange ? 'bg-[var(--accent-soft)] text-[var(--text-secondary)]' : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]')}>
                    {cell.day}
                </button>);
            }}
        />
    </div>);
}

export function RangeHint(): JSX.Element {
    return (<div className="mt-1.5 flex items-center gap-1.5 px-0.5 text-[length:var(--text-9\\.5)] text-[var(--text-quaternary)]">
        <CalendarDays size={10} className="shrink-0"/>
        <span className="truncate">{t("notes.range_editor_hint")}</span>
    </div>);
}