import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, CalendarCheck, CalendarDays, CalendarRange, ChevronDown, ChevronLeft, ChevronRight, FileText, RotateCcw } from 'lucide-react';
import type { DateRangeFilter } from '@shared/types';
import { cn } from '../lib/cn';
import { t } from '../lib/i18n';
import { dateKey } from '../lib/time';
import { latestEditOutsideWindow } from '../features/list/use-rolling-filter';
import { IconButton } from './primitives';
import { Tooltip } from './overlay';
import { MonthGrid, YearGrid, YEAR_GRID_COLUMNS, buildMonthGridCells, yearGridColumns, type YearGridColumns, type YearGridColumnsPref } from './calendar-grids';
export { latestEditOutsideWindow };

const HEAT_PERCENTS = [0, 16, 34, 54, 76] as const;


const DEFAULT_WEEKS = 16;

export interface CalendarDayNote {
    id: string;
    title: string;
}

export interface WeekCell {
    key: string;
    count: number;
    today: boolean;
    selected: boolean;
    level: number;
    diaryId: string | null;
    notes: CalendarDayNote[];
}

export interface BuildStripWeeksOptions {
    range?: { start: Date; end: Date };
    weekStart?: 0 | 1;
    now?: Date;
    todayKey?: string;
    selectedRange?: DateRangeFilter | null;
    getDiaryId?: (key: string) => string | null;
    notesByDay?: ReadonlyMap<string, CalendarDayNote[]>;
}

export function buildStripWeeks(counts: ReadonlyMap<string, number>, options: BuildStripWeeksOptions = {}): WeekCell[][] {
    const weekStart = options.weekStart ?? 0;
    const anchor = alignWeekStart(options.range ? new Date(options.range.end) : (options.now ?? new Date()), weekStart);
    const rangeStart = options.range
        ? alignWeekStart(new Date(options.range.start), weekStart)
        : (() => {
            const d = new Date(anchor);
            d.setDate(d.getDate() - (DEFAULT_WEEKS - 1) * 7);
            return d;
        })();
    const weekCount = Math.max(1, Math.round((anchor.getTime() - rangeStart.getTime()) / (7 * 24 * 3600 * 1000)) + 1);
    let max = 0;
    const raw: { key: string; count: number; today: boolean; selected: boolean }[] = [];
    const cursorDate = new Date(rangeStart);
    const selectedRange = options.selectedRange;
    const inRange = (key: string) => selectedRange != null && key >= selectedRange.start && key <= selectedRange.end;
    for (let index = 0; index < weekCount * 7; index++) {
        const key = dateKey(cursorDate);
        const count = counts.get(key) ?? 0;
        if (count > max)
            max = count;
        raw.push({ key, count, today: key === options.todayKey, selected: inRange(key) });
        cursorDate.setDate(cursorDate.getDate() + 1);
    }
    const weeks: WeekCell[][] = [];
    for (let week = 0; week < weekCount; week++) {
        weeks.push(raw.slice(week * 7, week * 7 + 7).map(({ key, count, today, selected }) => ({
            key,
            count,
            today,
            selected,
            level: count === 0 ? 0 : Math.max(1, Math.round((4 * count) / Math.max(1, max))),
            diaryId: options.getDiaryId?.(key) ?? null,
            notes: options.notesByDay?.get(key) ?? [],
        })));
    }
    return weeks;
}

export interface ActivityCalendarProps {
    counts: ReadonlyMap<string, number>;
    notesByDay?: ReadonlyMap<string, CalendarDayNote[]>;
    getDiaryId?: (key: string) => string | null;
    locale: string;
    weekStart?: 0 | 1;
    today?: Date;
    range?: { start: Date; end: Date };
    selectedRange?: DateRangeFilter | null;
    latestEditKey?: string | null;
    view: 'month' | 'weeks' | 'year';
    onViewChange: (view: 'month' | 'weeks' | 'year') => void;
    cursor: { year: number; month: number };
    onCursorChange: (cursor: { year: number; month: number }) => void;
    onDayClick: (key: string, diaryId: string | null) => void;
    onDaySelect: (key: string) => void;
    onRangeSelect: (start: string, end: string) => void;
    onGapDayClick: (key: string) => void;
    onNoteClick: (noteId: string) => void;
    columnsPreference?: YearGridColumnsPref;
}

/** Reusable calendar + activity heatmap: navigable month grid, yearly month columns, and a GitHub-style weekly strip, with optional per-day note lists. */
export function ActivityCalendar({ counts, notesByDay, getDiaryId, locale, weekStart = 1, today, range, selectedRange, latestEditKey, view, onViewChange, cursor, onCursorChange, onDayClick, onDaySelect, onRangeSelect, onGapDayClick, onNoteClick, columnsPreference = 'auto' }: ActivityCalendarProps) {
    const [expandedWeek, setExpandedWeek] = useState<number | null>(null);
    const [expandedDay, setExpandedDay] = useState<string | null>(null);
    const [expandedWeekNotes, setExpandedWeekNotes] = useState(false);
    const [focusedKey, setFocusedKey] = useState<string | null>(null);
    const [focusedMonth, setFocusedMonth] = useState<number | null>(null);
    const [dragRange, setDragRange] = useState<DateRangeFilter | null>(null);
    const lastExpandedWeek = useRef<number | null>(null);
    const lastExpandedDay = useRef<string | null>(null);
    const dragStartKey = useRef<string | null>(null);
    const dragHoverKey = useRef<string | null>(null);
    const [yearRangeAnchor, setYearRangeAnchor] = useState<{ year: number; month: number } | null>(null);
    const [yearRangeHover, setYearRangeHover] = useState<number | null>(null);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const [rootWidth, setRootWidth] = useState<number | null>(null);
    useEffect(() => {
        const el = rootRef.current;
        if (!el)
            return;
        setRootWidth(el.getBoundingClientRect().width);
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries)
                setRootWidth(entry.contentRect.width);
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);
    const yearColumns: YearGridColumns = columnsPreference !== 'auto' ? (columnsPreference === '4' ? 4 : 3) : (rootWidth === null ? YEAR_GRID_COLUMNS : yearGridColumns(rootWidth));
    if (expandedWeek !== null)
        lastExpandedWeek.current = expandedWeek;
    if (expandedDay !== null)
        lastExpandedDay.current = expandedDay;
    const shownWeek = expandedWeek ?? lastExpandedWeek.current;
    const shownDay = expandedDay ?? lastExpandedDay.current;

    const now = useMemo(() => today ?? new Date(), [today]);
    const todayKey = dateKey(now);
    const isCurrentMonth = cursor.year === now.getFullYear() && cursor.month === now.getMonth();
    const isCurrentYear = cursor.year === now.getFullYear();

    const shiftMonth = (delta: number) => {
        const month = cursor.month + delta;
        onCursorChange({ year: cursor.year + Math.floor(month / 12), month: ((month % 12) + 12) % 12 });
    };
    const shiftYear = (delta: number) => onCursorChange({ year: cursor.year + delta, month: cursor.month });
    const jumpToCurrentMonth = () => onCursorChange({ year: now.getFullYear(), month: now.getMonth() });
    const jumpToCurrentYear = () => onCursorChange({ year: now.getFullYear(), month: cursor.month });
    const toggleWeek = (index: number) => {
        setExpandedWeek((current) => current === index ? null : index);
        setExpandedDay(null);
        setExpandedWeekNotes(false);
    };
    const isWeekRangeActive = (week: WeekCell[]) => selectedRange != null && week[0]?.key === selectedRange.start && week[6]?.key === selectedRange.end;
    useEffect(() => {
        setYearRangeAnchor(null);
        setYearRangeHover(null);
    }, [view, cursor.year]);

    const weekdayLabels = useMemo(() => {
        const formatter = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
        return Array.from({ length: 7 }, (_, index) => formatter.format(new Date(2024, 0, 7 + ((weekStart + index) % 7))));
    }, [locale, weekStart]);

    const gridTitle = useMemo(() => new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'long',
    }).format(new Date(cursor.year, cursor.month, 1)), [cursor, locale]);

    const monthLabels = useMemo(() => {
        const formatter = new Intl.DateTimeFormat(locale, { month: 'short' });
        return Array.from({ length: 12 }, (_, month) => formatter.format(new Date(cursor.year, month, 1)));
    }, [cursor.year, locale]);

    const monthCells = useMemo(() => buildMonthGridCells(cursor.year, cursor.month, weekStart, todayKey), [cursor, todayKey, weekStart]);
    const inMonthKeys = useMemo(() => monthCells.filter((cell) => cell.inMonth).map((cell) => cell.key), [monthCells]);
    const focusKey = focusedKey !== null && inMonthKeys.includes(focusedKey)
        ? focusedKey
        : (monthCells.find((cell) => cell.today)?.key ?? inMonthKeys[0] ?? null);

    const cellMeta = useMemo(() => {
        let max = 0;
        const byKey = new Map<string, number>();
        for (const cell of monthCells) {
            if (!cell.inMonth)
                continue;
            const count = counts.get(cell.key) ?? 0;
            byKey.set(cell.key, count);
            if (count > max)
                max = count;
        }
        return { byKey, max };
    }, [counts, monthCells]);

    const effectiveRange = dragRange ?? selectedRange;
    const inRange = (key: string) => effectiveRange != null && key >= effectiveRange.start && key <= effectiveRange.end;

    const normalizeRange = (a: string, b: string): DateRangeFilter => a <= b ? { start: a, end: b } : { start: b, end: a };

    useEffect(() => {
        const onWindowMouseUp = () => {
            if (dragStartKey.current === null)
                return;
            const anchor = dragStartKey.current;
            const hover = dragHoverKey.current;
            dragStartKey.current = null;
            dragHoverKey.current = null;
            setDragRange(null);
            if (hover !== null && hover !== anchor) {
                const range = normalizeRange(anchor, hover);
                onRangeSelect(range.start, range.end);
            }
        };
        window.addEventListener('mouseup', onWindowMouseUp);
        return () => window.removeEventListener('mouseup', onWindowMouseUp);
    }, [onRangeSelect]);

    const handleGridKeyDown = (event: React.KeyboardEvent) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key))
            return;
        event.preventDefault();
        const anchor = event.shiftKey ? focusKey : null;
        let index = inMonthKeys.indexOf(focusKey);
        if (index < 0)
            index = 0;
        if (event.key === 'ArrowLeft')
            index--;
        else if (event.key === 'ArrowRight')
            index++;
        else if (event.key === 'ArrowUp')
            index -= 7;
        else if (event.key === 'ArrowDown')
            index += 7;
        else if (event.key === 'Home')
            index = 0;
        else if (event.key === 'End')
            index = inMonthKeys.length - 1;
        index = Math.max(0, Math.min(inMonthKeys.length - 1, index));
        const targetKey = inMonthKeys[index];
        if (!targetKey)
            return;
        setFocusedKey(targetKey);
        event.currentTarget.querySelector<HTMLButtonElement>(`[data-day-key="${targetKey}"]`)?.focus();
        if (anchor !== null) {
            const range = normalizeRange(anchor, targetKey);
            onRangeSelect(range.start, range.end);
        }
    };

    const handleGridMouseDown = (event: React.MouseEvent) => {
        const key = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-day-key]')?.dataset.dayKey ?? null;
        if (key === null)
            return;
        dragStartKey.current = key;
        dragHoverKey.current = key;
        setDragRange(null);
    };

    const handleGridMouseEnter = (event: React.MouseEvent) => {
        if (dragStartKey.current === null)
            return;
        const key = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-day-key]')?.dataset.dayKey ?? null;
        if (key === null)
            return;
        dragHoverKey.current = key;
        setDragRange(normalizeRange(dragStartKey.current, key));
    };

    const handleRootKeyDown = (event: React.KeyboardEvent) => {
        if (event.key !== 'Escape')
            return;
        if (view === 'year' && yearRangeAnchor !== null) {
            setYearRangeAnchor(null);
            setYearRangeHover(null);
            return;
        }
        if (expandedDay !== null) {
            setExpandedDay(null);
            return;
        }
        if (expandedWeekNotes) {
            setExpandedWeekNotes(false);
            return;
        }
        if (expandedWeek !== null)
            setExpandedWeek(null);
    };

    const yearMeta = useMemo(() => {
        const totals: number[] = [];
        let yearMax = 0;
        for (let month = 0; month < 12; month++) {
            const daysInMonth = new Date(cursor.year, month + 1, 0).getDate();
            let total = 0;
            for (let day = 1; day <= daysInMonth; day++)
                total += counts.get(dateKey(new Date(cursor.year, month, day))) ?? 0;
            totals.push(total);
            if (total > yearMax)
                yearMax = total;
        }
        return { totals, yearMax };
    }, [counts, cursor.year]);
    const yearLevel = (key: string) => {
        const count = counts.get(key) ?? 0;
        return count === 0 ? 0 : Math.max(1, Math.round((4 * count) / Math.max(1, yearMeta.yearMax)));
    };

    const stripWeeks = useMemo(() => buildStripWeeks(counts, { range, weekStart, now, todayKey, selectedRange, getDiaryId, notesByDay }), [counts, getDiaryId, notesByDay, now, range, selectedRange, todayKey, weekStart]);
    const weekCells = shownWeek !== null ? stripWeeks[shownWeek] : undefined;
    const weekCellsTotal = weekCells?.reduce((sum, cell) => sum + cell.notes.length, 0) ?? 0;

    const focusMonth = focusedMonth !== null && focusedMonth >= 0 && focusedMonth < 12
        ? focusedMonth
        : (isCurrentYear ? now.getMonth() : 0);

    const handleWeekdayClick = (month: number, column: number) => {
        const first = new Date(cursor.year, month, 1);
        const offset = (first.getDay() - weekStart + 7) % 7;
        const day = 1 + ((column - offset + 7) % 7);
        const date = new Date(cursor.year, month, day);
        const start = new Date(date);
        start.setDate(start.getDate() - ((start.getDay() - weekStart + 7) % 7));
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        onCursorChange({ year: cursor.year, month });
        onViewChange('month');
        onRangeSelect(dateKey(start), dateKey(end));
    };

    const handleYearGridKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'PageUp') {
            event.preventDefault();
            shiftYear(-1);
            return;
        }
        if (event.key === 'PageDown') {
            event.preventDefault();
            shiftYear(1);
            return;
        }
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key))
            return;
        event.preventDefault();
        let index = focusMonth;
        if (event.key === 'ArrowLeft')
            index--;
        else if (event.key === 'ArrowRight')
            index++;
        else if (event.key === 'ArrowUp')
            index -= yearColumns;
        else if (event.key === 'ArrowDown')
            index += yearColumns;
        else if (event.key === 'Home')
            index = 0;
        else if (event.key === 'End')
            index = 11;
        index = Math.max(0, Math.min(11, index));
        setFocusedMonth(index);
        event.currentTarget.querySelector<HTMLButtonElement>(`[data-month="${index}"]`)?.focus();
    };

    const latestEditOutside = latestEditOutsideWindow(selectedRange, latestEditKey);
    const latestEditOutsideKey = latestEditOutside?.key ?? null;
    const latestOutsideDays = latestEditOutside?.days ?? null;
    const isLatestOutside = (key: string) => latestEditOutsideKey === key;
    const gapAhead = latestEditOutside?.ahead ?? false;
    const dayLabel = (key: string) => t("sidebar.calendar_day_tooltip_value0", { value0: key, value1: counts.get(key) ?? 0 });
    const flaggedLabel = (key: string) => isLatestOutside(key)
        ? `${dayLabel(key)} · ${t("sidebar.calendar_outside_window_value0", { value0: latestOutsideDays ?? 0 })}`
        : dayLabel(key);
    const gapLabel = (key: string) => isLatestOutside(key)
        ? `${flaggedLabel(key)} · ${t("sidebar.calendar_gap_click_follow")}`
        : flaggedLabel(key);
    const activateDay = (key: string, diaryId: string | null) => {
        if (isLatestOutside(key) && latestEditOutside !== null)
            onGapDayClick(key);
        else
            onDayClick(key, diaryId);
    };

    return (<div ref={rootRef} onKeyDown={handleRootKeyDown}>
        <div className="mt-1 flex items-center justify-between gap-1 px-0.5">
            <div className="flex items-center gap-0.5">
                {view === 'month' && (<>
                    {!isCurrentMonth && (<Tooltip label={t("sidebar.calendar_this_month")} side="bottom">
                        <IconButton label={t("sidebar.calendar_this_month")} size="sm" onClick={jumpToCurrentMonth}>
                            <CalendarCheck size={13}/>
                        </IconButton>
                    </Tooltip>)}
                    <Tooltip label={t("sidebar.calendar_prev_month")} side="bottom">
                        <IconButton label={t("sidebar.calendar_prev_month")} size="sm" onClick={() => shiftMonth(-1)}>
                            <ChevronLeft size={13}/>
                        </IconButton>
                    </Tooltip>
                    <Tooltip label={t("sidebar.calendar_next_month")} side="bottom">
                        <IconButton label={t("sidebar.calendar_next_month")} size="sm" onClick={() => shiftMonth(1)}>
                            <ChevronRight size={13}/>
                        </IconButton>
                    </Tooltip>
                </>)}
                {view === 'year' && (<>
                    {!isCurrentYear && (<Tooltip label={t("sidebar.calendar_this_year")} side="bottom">
                        <IconButton label={t("sidebar.calendar_this_year")} size="sm" onClick={jumpToCurrentYear}>
                            <CalendarCheck size={13}/>
                        </IconButton>
                    </Tooltip>)}
                    <Tooltip label={t("sidebar.calendar_prev_year")} side="bottom">
                        <IconButton label={t("sidebar.calendar_prev_year")} size="sm" onClick={() => shiftYear(-1)}>
                            <ChevronLeft size={13}/>
                        </IconButton>
                    </Tooltip>
                    <Tooltip label={t("sidebar.calendar_next_year")} side="bottom">
                        <IconButton label={t("sidebar.calendar_next_year")} size="sm" onClick={() => shiftYear(1)}>
                            <ChevronRight size={13}/>
                        </IconButton>
                    </Tooltip>
                </>)}
            </div>
            <div role="group" aria-label={t("sidebar.calendar_view")} className="flex overflow-hidden rounded-[var(--r-sm)] border border-[var(--border-default)]">
                <button type="button" aria-pressed={view === 'month'} onClick={() => onViewChange('month')} className="flex h-6 min-w-0 items-center gap-0.5 whitespace-nowrap px-1.5 text-[10.5px] font-medium transition-colors aria-pressed:bg-[var(--accent-soft)] aria-pressed:text-[var(--accent)]">
                    <CalendarDays size={10} className="shrink-0"/><span className="truncate">{t("sidebar.calendar_month_view")}</span>
                </button>
                <button type="button" aria-pressed={view === 'weeks'} onClick={() => onViewChange('weeks')} className="flex h-6 min-w-0 items-center gap-0.5 whitespace-nowrap border-l border-[var(--border-default)] px-1.5 text-[10.5px] font-medium transition-colors aria-pressed:bg-[var(--accent-soft)] aria-pressed:text-[var(--accent)]">
                    <BarChart3 size={10} className="shrink-0"/><span className="truncate">{t("sidebar.calendar_week_view")}</span>
                </button>
                <button type="button" aria-pressed={view === 'year'} onClick={() => onViewChange('year')} className="flex h-6 min-w-0 items-center gap-0.5 whitespace-nowrap border-l border-[var(--border-default)] px-1.5 text-[10.5px] font-medium transition-colors aria-pressed:bg-[var(--accent-soft)] aria-pressed:text-[var(--accent)]">
                    <CalendarRange size={10} className="shrink-0"/><span className="truncate">{t("sidebar.calendar_year_view")}</span>
                </button>
            </div>
        </div>
        {view === 'month' ? (<><div className="mt-1.5 px-0.5">
            {latestEditOutside !== null && (<button type="button" aria-label={t(gapAhead ? "sidebar.calendar_gap_banner_ahead_value0" : "sidebar.calendar_gap_banner_value0", { value0: latestOutsideDays ?? 0 })} onClick={() => onGapDayClick(latestEditOutside.key)} className="flex h-6 w-full items-center gap-1.5 rounded-[var(--r-sm)] border border-dashed border-[var(--accent)]/60 bg-[var(--accent-soft)]/60 px-2 text-[10px] font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent-soft)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent)]">
                    <RotateCcw size={10} className="shrink-0"/>
                    <span className="min-w-0 flex-1 truncate text-left">{t(gapAhead ? "sidebar.calendar_gap_banner_ahead_value0" : "sidebar.calendar_gap_banner_value0", { value0: latestOutsideDays ?? 0 })}</span>
                </button>)}
            </div><MonthGrid
            year={cursor.year}
            month={cursor.month}
            weekStart={weekStart}
            todayKey={todayKey}
            weekdayLabels={weekdayLabels}
            ariaLabel={t("sidebar.calendar_month_grid_aria", { value0: gridTitle })}
            onKeyDown={handleGridKeyDown}
            onMouseDown={handleGridMouseDown}
            onMouseEnter={handleGridMouseEnter}
            className="mt-1.5 px-0.5"
            renderCell={(cell) => {
                const count = cellMeta.byKey.get(cell.key) ?? 0;
                const level = count === 0 ? 0 : Math.max(1, Math.round((4 * count) / Math.max(1, cellMeta.max)));
                const diaryId = getDiaryId?.(cell.key) ?? null;
                const selected = cell.inMonth && inRange(cell.key);
                return (<Tooltip label={gapLabel(cell.key)}>
                    <button type="button" data-day-key={cell.key} tabIndex={cell.key === focusKey ? 0 : -1} aria-pressed={selected} aria-label={gapLabel(cell.key)} onClick={() => {
                        setFocusedKey(cell.key);
                        activateDay(cell.key, diaryId);
                    }} className={cn('relative flex aspect-square items-center justify-center rounded-[4px] text-[9.5px] leading-none transition-colors', 'hover:ring-1 hover:ring-inset hover:ring-[var(--accent-ring)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent)]', cell.today && 'ring-1 ring-inset ring-[var(--accent)]', cell.inMonth ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-quaternary)] opacity-60', count > 0 && 'font-semibold text-[var(--text-primary)]', isLatestOutside(cell.key) && 'border border-dashed border-[var(--accent)]/80')} style={level > 0 ? { backgroundColor: `color-mix(in oklab, var(--accent) ${HEAT_PERCENTS[level]}%, transparent)` } : undefined}>
                        {cell.day}
                        {diaryId && (<span aria-hidden="true" className="absolute bottom-[2px] left-1/2 size-[3px] -translate-x-1/2 rounded-full bg-[var(--accent)]"/>)}
                        {selected && (<span aria-hidden="true" className="absolute inset-x-1 bottom-[1px] h-[2px] rounded-full bg-[var(--accent)]"/>)}
                    </button>
                </Tooltip>);
            }}
        /></>) : view === 'year' ? (<>
            <YearGrid
                year={cursor.year}
                weekStart={weekStart}
                todayKey={todayKey}
                columns={yearColumns}
                ariaLabel={t("sidebar.calendar_year_grid_aria", { value0: cursor.year })}
                onKeyDown={handleYearGridKeyDown}
                className="mt-1.5 px-0.5"
                renderMonth={(month) => {
                    const inRangePreview = yearRangeAnchor !== null && yearRangeHover !== null
                        && month.month >= Math.min(yearRangeAnchor.month, yearRangeHover)
                        && month.month <= Math.max(yearRangeAnchor.month, yearRangeHover);
                    return (<div key={month.month} data-month-card={month.month} className={cn('flex min-w-0 flex-col items-center gap-1 rounded-[4px] px-px py-1 transition-colors hover:bg-[var(--bg-hover)] focus-within:ring-1 focus-within:ring-inset focus-within:ring-[var(--accent)]', inRangePreview && 'bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)]', yearRangeAnchor?.month === month.month && 'ring-1 ring-inset ring-[var(--accent)]')} onMouseEnter={() => { if (yearRangeAnchor !== null) setYearRangeHover(month.month); }}>
                        <span className="text-[8.5px] font-medium text-[var(--text-quaternary)]">{monthLabels[month.month]}</span>
                        <span className="grid w-full grid-cols-7 gap-px leading-none">
                            {weekdayLabels.map((label, index) => (<button key={index} type="button" tabIndex={-1} aria-label={t("sidebar.calendar_year_weekday_value0", { value0: monthLabels[month.month] ?? '', value1: label })} onClick={() => handleWeekdayClick(month.month, index)} className="rounded-[1px] py-px text-center text-[6px] font-medium text-[var(--text-quaternary)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent)]">
                                {label}
                            </button>))}
                        </span>
                        <button type="button" data-month={month.month} tabIndex={month.month === focusMonth ? 0 : -1} aria-label={t("sidebar.calendar_year_month_value0", { value0: monthLabels[month.month] ?? '', value1: yearMeta.totals[month.month] ?? 0 })} onClick={(event) => {
                            setFocusedMonth(month.month);
                            if (event.detail === 0) {
                                onCursorChange({ year: cursor.year, month: month.month });
                                onViewChange('month');
                                return;
                            }
                            if (yearRangeAnchor === null) {
                                setYearRangeAnchor({ year: cursor.year, month: month.month });
                                setYearRangeHover(month.month);
                                return;
                            }
                            const range = monthRangeToKeys(yearRangeAnchor.year, yearRangeAnchor.month, month.month);
                            setYearRangeAnchor(null);
                            setYearRangeHover(null);
                            onRangeSelect(range.start, range.end);
                        }} className="grid w-full grid-cols-7 gap-px rounded-[2px] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent)]">
                            {month.cells.map((cell, index) => (<span key={index} aria-hidden="true" className={cn('aspect-square w-full rounded-[1px]', cell.today && 'ring-1 ring-inset ring-[var(--accent)]')} style={!cell.inMonth
                                ? { backgroundColor: 'transparent' }
                                : (yearLevel(cell.key) > 0 ? { backgroundColor: `color-mix(in oklab, var(--accent) ${HEAT_PERCENTS[yearLevel(cell.key)]}%, transparent)` } : { backgroundColor: 'var(--bg-inset)' })}/>))}
                        </button>
                    </div>);
                }}
            />
            {yearRangeAnchor !== null && (<div className="mt-1 px-0.5 text-[9px] text-[var(--text-tertiary)]">
                {t("sidebar.calendar_year_range_hint_value0", { value0: monthLabels[yearRangeAnchor.month] ?? '' })}
            </div>)}
        </>) : (<div className="mt-1.5 px-0.5">
            <div className="px-0.5 pb-1 text-[9px] font-medium text-[var(--text-quaternary)]">{t("sidebar.calendar_week_strip_value0", { value0: stripWeeks.length })}</div>
            <div className="flex gap-[2px]">
                {stripWeeks.map((week, weekIndex) => (<button key={weekIndex} type="button" aria-expanded={expandedWeek === weekIndex} aria-pressed={isWeekRangeActive(week)} aria-label={t("sidebar.calendar_expand_week_value0", { value0: week[0]?.key.slice(5), value1: week[6]?.key.slice(5) })} onClick={(event) => {
                    const first = week[0]?.key;
                    const last = week[6]?.key;
                    if (first && last)
                        onRangeSelect(first, last);
                    if (!event.shiftKey)
                        toggleWeek(weekIndex);
                }} className={cn('flex min-w-0 flex-1 flex-col gap-[2px] rounded-[3px] p-px transition-colors focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent)]', expandedWeek === weekIndex && 'bg-[var(--accent-soft)]')}>
                    {week.map((cell) => (<Tooltip key={cell.key} label={flaggedLabel(cell.key)}>
                        <span aria-hidden="true" className={cn('aspect-square w-full rounded-[2px]', cell.today && 'ring-1 ring-inset ring-[var(--accent)]', cell.selected && !cell.today && 'ring-1 ring-inset ring-[var(--accent)]/70', isLatestOutside(cell.key) && 'border border-dashed border-[var(--accent)]/80')} style={cell.level > 0 ? { backgroundColor: `color-mix(in oklab, var(--accent) ${HEAT_PERCENTS[cell.level]}%, transparent)` } : { backgroundColor: 'var(--bg-inset)' }}/>
                    </Tooltip>))}
                </button>))}
            </div>
            <div className={cn('grid transition-[grid-template-rows] duration-[var(--dur-base)] ease-out', expandedWeek !== null ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                <div aria-hidden={expandedWeek === null} inert={expandedWeek === null} className="min-h-0 overflow-hidden">
                    <div className="mt-1.5 space-y-px rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-inset)] p-1">
                        {shownWeek !== null && stripWeeks[shownWeek] && stripWeeks[shownWeek].map((cell, dayIndex) => (<div key={cell.key}>
                            <div className="flex items-center gap-0.5">
                                <button type="button" aria-label={gapLabel(cell.key)} onClick={() => activateDay(cell.key, cell.diaryId)} className={cn('flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-[var(--r-sm)] px-1.5 text-left transition-colors hover:bg-[var(--bg-hover)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent)]', cell.selected && 'bg-[var(--accent-soft)]', isLatestOutside(cell.key) && 'border border-dashed border-[var(--accent)]/80')}>
                                    <span className="w-3 shrink-0 text-center text-[9.5px] font-medium text-[var(--text-quaternary)]">{weekdayLabels[dayIndex]}</span>
                                    <span className="shrink-0 text-[10.5px] tabular text-[var(--text-secondary)]">{cell.key.slice(5)}</span>
                                    {cell.today && (<span aria-hidden="true" className="size-[5px] shrink-0 rounded-full bg-[var(--accent)]"/>)}
                                    <span className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5">
                                        {cell.diaryId && (<span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-1.5 py-px text-[9px] font-medium text-[var(--accent)]">
                                            <span aria-hidden="true" className="size-[3px] rounded-full bg-[var(--accent)]"/>{t("sidebar.diary_tag")}
                                        </span>)}
                                        {cell.count > 0 && (<span className="text-[9.5px] tabular text-[var(--text-quaternary)]">{cell.count}</span>)}
                                    </span>
                                </button>
                                {cell.notes.length > 0 && (<button type="button" aria-expanded={expandedDay === cell.key} aria-label={t("sidebar.calendar_expand_day")} onClick={() => setExpandedDay((current) => current === cell.key ? null : cell.key)} className={cn('flex size-6 shrink-0 items-center justify-center rounded-[var(--r-sm)] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent)]', expandedDay === cell.key && 'text-[var(--text-secondary)]')}>
                                    <ChevronDown size={10} className={cn('transition-transform duration-[var(--dur-fast)]', expandedDay === cell.key && 'rotate-180')}/>
                                </button>)}
                            </div>
                            <div className={cn('grid transition-[grid-template-rows] duration-[var(--dur-base)] ease-out', expandedDay === cell.key ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                                <div aria-hidden={expandedDay !== cell.key} inert={expandedDay !== cell.key} className="min-h-0 overflow-hidden">
                                    <div className="space-y-px py-0.5 pl-3.5 pr-1">
                                        {shownDay === cell.key && cell.notes.map((note) => (<button key={note.id} type="button" onClick={() => onNoteClick(note.id)} className="flex h-6 w-full items-center gap-1.5 rounded-[var(--r-sm)] px-1.5 text-left transition-colors hover:bg-[var(--bg-hover)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent)]">
                                            <FileText size={9} className="shrink-0 text-[var(--text-quaternary)]"/>
                                            <span className="min-w-0 flex-1 truncate text-[10.5px] text-[var(--text-secondary)]">{note.title}</span>
                                        </button>))}
                                    </div>
                                </div>
                            </div>
                        </div>))}
                    {weekCellsTotal > 0 && (<>
                        <div className="my-0.5 border-t border-[var(--border-subtle)]"/>
                        <div className="flex items-center">
                            <button type="button" aria-expanded={expandedWeekNotes} aria-label={t("sidebar.calendar_week_notes_value0", { value0: weekCellsTotal })} onClick={() => setExpandedWeekNotes((open) => !open)} className="flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-[var(--r-sm)] px-1.5 text-left transition-colors hover:bg-[var(--bg-hover)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent)]">
                                <FileText size={10} className="shrink-0 text-[var(--text-quaternary)]"/>
                                <span className="text-[10.5px] text-[var(--text-secondary)]">{t("sidebar.calendar_week_notes_value0", { value0: weekCellsTotal })}</span>
                                <ChevronDown size={10} className={cn('ml-auto text-[var(--text-quaternary)] transition-transform duration-[var(--dur-fast)]', expandedWeekNotes && 'rotate-180')}/>
                            </button>
                        </div>
                        <div className={cn('grid transition-[grid-template-rows] duration-[var(--dur-base)] ease-out', expandedWeekNotes ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                            <div aria-hidden={!expandedWeekNotes} inert={!expandedWeekNotes} className="min-h-0 overflow-hidden">
                                <div className="space-y-1 py-0.5">
                                    {weekCells!.map((cell, dayIndex) => (cell.notes.length > 0 ? (<div key={cell.key}>
                                        <button type="button" aria-label={t("sidebar.calendar_jump_to_day")} onClick={() => {
                                            const [year, month] = cell.key.split('-').map(Number);
                                            setFocusedKey(cell.key);
                                            onCursorChange({ year, month: month - 1 });
                                            onViewChange('month');
                                            onDaySelect(cell.key);
                                        }} className="flex w-full items-center gap-1 rounded-[var(--r-sm)] px-1.5 py-0.5 text-left text-[9.5px] font-medium text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-hover)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent)]">
                                            <span>{weekdayLabels[dayIndex]}</span>
                                            <span className="tabular">{cell.key.slice(5)}</span>
                                            <span className="ml-auto tabular">{cell.notes.length}</span>
                                        </button>
                                        {cell.notes.map((note) => (<button key={note.id} type="button" onClick={() => onNoteClick(note.id)} className="flex h-6 w-full items-center gap-1.5 rounded-[var(--r-sm)] py-0.5 pr-1.5 pl-5 text-left transition-colors hover:bg-[var(--bg-hover)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent)]">
                                            <FileText size={9} className="shrink-0 text-[var(--text-quaternary)]"/>
                                            <span className="min-w-0 flex-1 truncate text-[10.5px] text-[var(--text-secondary)]">{note.title}</span>
                                        </button>))}
                                    </div>) : null))}
                                </div>
                            </div>
                        </div>
                    </>)}
                    </div>
                </div>
            </div>
        </div>)}
        <div className="mt-1.5 flex items-center gap-1 px-1">
            <span className="text-[9px] text-[var(--text-quaternary)]">{t("sidebar.calendar_less")}</span>
            {[0, 1, 2, 3, 4].map((level) => (<span key={level} aria-hidden="true" className="size-[9px] rounded-[2px]" style={{ backgroundColor: level === 0 ? 'var(--bg-inset)' : `color-mix(in oklab, var(--accent) ${HEAT_PERCENTS[level]}%, transparent)` }}/>))}
            <span className="text-[9px] text-[var(--text-quaternary)]">{t("sidebar.calendar_more")}</span>
        </div>
    </div>);
}

/** Convert an inclusive month range (0-11 indices within a year) to inclusive day keys. */
export function monthRangeToKeys(year: number, startMonth: number, endMonth: number): DateRangeFilter {
    const start = Math.min(startMonth, endMonth);
    const end = Math.max(startMonth, endMonth);
    return { start: dateKey(new Date(year, start, 1)), end: dateKey(new Date(year, end + 1, 0)) };
}

function alignWeekStart(date: Date, weekStart: 0 | 1): Date {
    const out = new Date(date);
    out.setHours(0, 0, 0, 0);
    out.setDate(out.getDate() - ((out.getDay() - weekStart + 7) % 7));
    return out;
}