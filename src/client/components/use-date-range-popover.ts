import { useEffect, useMemo, useRef, useState } from 'react';
import type { DateRangeFilter, RelativeFilter } from '@shared/types';
import { getVisibleViewport } from '../lib/viewport';
import { useLocale } from '../lib/i18n';
import { dateKey, parseDateKey } from '../lib/time';
import { useClickOutside, useEscape } from './overlay';
import { RANGE_PRESET_MAX, loadRangePresets, saveRangePresets, type RangePresetConfig } from '../features/list';
import { movePresetInList, presetRange, type RangePreset } from './date-range-popover-core';

export interface DateRangePopoverProps {
    anchor: React.RefObject<HTMLButtonElement | null>;
    open: boolean;
    onClose: () => void;
    range: DateRangeFilter | null;
    onChange: (range: DateRangeFilter | null) => void;
    relative: RelativeFilter | null;
    onApplyRelative: (value: RelativeFilter) => void;
}

export function usePopoverPosition(open: boolean, isEditorOpen: boolean, anchor: React.RefObject<HTMLButtonElement | null>, setPosition: React.Dispatch<React.SetStateAction<{ top: number; left: number; origin: string }>>): void {
    useEffect(() => {
        if (!open) {
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
    }, [open, isEditorOpen, anchor, setPosition]);
}


function useGridFocus(open: boolean, editing: 'start' | 'end', cursor: { year: number; month: number }, gridRef: React.RefObject<HTMLDivElement | null>): void {
    useEffect(() => {
        if (!open)
            return;
        window.requestAnimationFrame(() => {
            gridRef.current?.querySelector<HTMLButtonElement>('[data-range-day]')?.focus();
        });
    }, [open, editing, cursor, gridRef]);
}


function useRangeGridFlash(open: boolean, editing: 'start' | 'end', range: DateRangeFilter | null, gridRef: React.RefObject<HTMLDivElement | null>): number {
    const [locateFlash, setLocateFlash] = useState(0);
    useEffect(() => {
        if (open && range)
            setLocateFlash((n) => n + 1);
    }, [open]);
    useEffect(() => {
        if (open)
            setLocateFlash((n) => n + 1);
    }, [editing]);
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
    }, [locateFlash, gridRef]);
    return locateFlash;
}


interface DateRangeCore {
    weekStart: 0 | 1;
    editing: 'start' | 'end';
    setEditing: React.Dispatch<React.SetStateAction<'start' | 'end'>>;
    isEditorOpen: boolean;
    setIsEditorOpen: React.Dispatch<React.SetStateAction<boolean>>;
    position: { top: number; left: number; origin: string };
    popoverRef: React.RefObject<HTMLDivElement | null>;
    gridRef: React.RefObject<HTMLDivElement | null>;
    todayKey: string;
    weekdayLabels: string[];
    monthTitle: string;
    cursor: { year: number; month: number };
    current: DateRangeFilter;
    shiftMonth: (delta: number) => void;
    applyPreset: (preset: RangePreset) => void;
    isActivePreset: (preset: RangePresetConfig) => boolean;
    selectEndpoint: (endpoint: 'start' | 'end') => void;
    onPick: (key: string) => void;
}


function useDateRangeCore(props: DateRangePopoverProps): DateRangeCore {
    const locale = useLocale();
    const weekStart = locale === 'zh-CN' ? 1 : 0;
    const [editing, setEditing] = useState<'start' | 'end'>('start');
    const base = props.range ? new Date(props.range.end) : new Date();
    const [cursor, setCursor] = useState({ year: base.getFullYear(), month: base.getMonth() });
    const [position, setPosition] = useState({ top: 0, left: 0, origin: 'top right' });
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    useEscape(props.open, props.onClose);
    useClickOutside(props.anchor ? [popoverRef, props.anchor] : [popoverRef], props.open, props.onClose);
    usePopoverPosition(props.open, isEditorOpen, props.anchor, setPosition);
    useGridFocus(props.open, editing, cursor, gridRef);
    const todayKey = useMemo(() => dateKey(new Date()), []);
    const weekdayLabels = useMemo(() => {
        const formatter = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
        return Array.from({ length: 7 }, (_, index) => formatter.format(new Date(2024, 0, 7 + ((weekStart + index) % 7))));
    }, [locale, weekStart]);
    const monthTitle = useMemo(() => new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' }).format(new Date(cursor.year, cursor.month, 1)), [cursor, locale]);
    const current = props.range ?? { start: dateKey(new Date()), end: dateKey(new Date()) };
    const shiftMonth = (delta: number) => {
        const month = cursor.month + delta;
        setCursor({ year: cursor.year + Math.floor(month / 12), month: ((month % 12) + 12) % 12 });
    };
    const monthOf = (key: string) => {
        const date = parseDateKey(key);
        return { year: date.getFullYear(), month: date.getMonth() };
    };
    const applyRange = (next: DateRangeFilter) => {
        props.onChange(next);
        setCursor(monthOf(next.end));
        setEditing('end');
    };
    const applyPreset = (preset: RangePreset) => applyRange(presetRange(preset, new Date(), weekStart));
    const isActivePreset = (preset: RangePresetConfig) => props.relative != null && props.relative.days === preset.days && props.relative.direction === preset.direction;
    const selectEndpoint = (endpoint: 'start' | 'end') => {
        setEditing(endpoint);
        setCursor(monthOf(current[endpoint]));
    };
    const onPick = (key: string) => {
        const next = editing === 'start' ? { start: key, end: current.end } : { start: current.start, end: key };
        if (next.start > next.end)
            applyRange({ start: next.end, end: next.start });
        else
            applyRange(next);
    };
    return { weekStart, editing, setEditing, isEditorOpen, setIsEditorOpen, position, popoverRef, gridRef, todayKey, weekdayLabels, monthTitle, cursor, current, shiftMonth, applyPreset, isActivePreset, selectEndpoint, onPick };
}


interface DateRangePopoverState extends DateRangeCore {
    locateFlash: number;
    presets: RangePresetConfig[];
    updatePreset: (id: string, patch: Partial<Pick<RangePresetConfig, 'days' | 'direction'>>) => void;
    removePreset: (id: string) => void;
    addPreset: () => void;
    drag: PresetDrag;
    onChange: (range: DateRangeFilter | null) => void;
    onApplyRelative: (value: RelativeFilter) => void;
}

export function useDateRangePopover(props: DateRangePopoverProps): DateRangePopoverState {
    const core = useDateRangeCore(props);
    const { presets, setPresets, updatePreset, removePreset, addPreset } = useRangePresets();
    const drag = usePresetDrag(presets, setPresets);
    const locateFlash = useRangeGridFlash(props.open, core.editing, props.range, core.gridRef);
    return { ...core, locateFlash, presets, updatePreset, removePreset, addPreset, drag, onChange: props.onChange, onApplyRelative: props.onApplyRelative };
}


interface RangePresetsState {
    presets: RangePresetConfig[];
    setPresets: React.Dispatch<React.SetStateAction<RangePresetConfig[]>>;
    updatePreset: (id: string, patch: Partial<Pick<RangePresetConfig, 'days' | 'direction'>>) => void;
    removePreset: (id: string) => void;
    addPreset: () => void;
}


function useRangePresets(): RangePresetsState {
    const [presets, setPresets] = useState<RangePresetConfig[]>(loadRangePresets);
    useEffect(() => {
        saveRangePresets(presets);
    }, [presets]);
    const updatePreset = (id: string, patch: Partial<Pick<RangePresetConfig, 'days' | 'direction'>>) => {
        setPresets((list) => list.map((item) => item.id === id ? { ...item, ...patch } : item));
    };
    const removePreset = (id: string) => setPresets((list) => list.filter((item) => item.id !== id));
    const addPreset = () => {
        setPresets((list) => list.length >= RANGE_PRESET_MAX
            ? list
            : [...list, { id: `p${Date.now().toString(36)}`, days: 7, direction: 'edit' }]);
    };
    return { presets, setPresets, updatePreset, removePreset, addPreset };
}

export interface PresetDrag {
    dragStart: (index: number) => React.DragEventHandler;
    dragOver: (index: number) => React.DragEventHandler;
    dragEnd: () => void;
    movePreset: (index: number, delta: -1 | 1) => void;
    moveButtonsRef: React.MutableRefObject<Map<string, { up: HTMLButtonElement | null; down: HTMLButtonElement | null }>>;
}


function usePresetDrag(presets: RangePresetConfig[], setPresets: React.Dispatch<React.SetStateAction<RangePresetConfig[]>>): PresetDrag {
    const dragPresetIndex = useRef<number | null>(null);
    const handlePresetDragStart = (index: number) => (event: React.DragEvent) => {
        dragPresetIndex.current = index;
        event.dataTransfer.effectAllowed = 'move';
        try {
            event.dataTransfer.setData('text/plain', String(index));
        }
        catch {
            // Drag payload is best-effort; the drop handler re-reads the index from state, not dataTransfer.
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
    return { dragStart: handlePresetDragStart, dragOver: handlePresetDragOver, dragEnd: handlePresetDragEnd, movePreset: handleMovePreset, moveButtonsRef: presetMoveButtons };
}