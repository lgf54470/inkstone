import { useMemo, useRef, useState } from 'react';
import { BarChart3, CalendarCheck, CalendarDays, CalendarRange, ChevronDown, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { cn } from '../lib/cn';
import { t } from '../lib/i18n';
import { dateKey } from '../lib/time';
import { IconButton } from './primitives';
import { Tooltip } from './overlay';

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
    selectedKey?: string | null;
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
    for (let index = 0; index < weekCount * 7; index++) {
        const key = dateKey(cursorDate);
        const count = counts.get(key) ?? 0;
        if (count > max)
            max = count;
        raw.push({ key, count, today: key === options.todayKey, selected: key === options.selectedKey });
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
    selectedKey?: string | null;
    view: 'month' | 'weeks' | 'year';
    onViewChange: (view: 'month' | 'weeks' | 'year') => void;
    cursor: { year: number; month: number };
    onCursorChange: (cursor: { year: number; month: number }) => void;
    onDayClick: (key: string, diaryId: string | null) => void;
    onDaySelect: (key: string) => void;
    onNoteClick: (noteId: string) => void;
}

/** Reusable calendar + activity heatmap: navigable month grid, yearly month columns, and a GitHub-style weekly strip, with optional per-day note lists. */
export function ActivityCalendar({ counts, notesByDay, getDiaryId, locale, weekStart = 1, today, range, selectedKey, view, onViewChange, cursor, onCursorChange, onDayClick, onDaySelect, onNoteClick }: ActivityCalendarProps) {
    const [expandedWeek, setExpandedWeek] = useState<number | null>(null);
    const [expandedDay, setExpandedDay] = useState<string | null>(null);
    const [expandedWeekNotes, setExpandedWeekNotes] = useState(false);
    const [focusedKey, setFocusedKey] = useState<string | null>(null);
    const [focusedMonth, setFocusedMonth] = useState<number | null>(null);
    const lastExpandedWeek = useRef<number | null>(null);
    const lastExpandedDay = useRef<string | null>(null);
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

    const weekdayLabels = useMemo(() => {
        const formatter = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
        return Array.from({ length: 7 }, (_, index) => formatter.format(new Date(2024, 0, 7 + ((weekStart + index) % 7))));
    }, [locale, weekStart]);

    const cells = useMemo(() => {
        const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
        const offset = (new Date(cursor.year, cursor.month, 1).getDay() - weekStart + 7) % 7;
        const rows = Math.ceil((offset + daysInMonth) / 7);
        let max = 0;
        for (let day = 1; day <= daysInMonth; day++) {
            max = Math.max(max, counts.get(dateKey(new Date(cursor.year, cursor.month, day))) ?? 0);
        }
        const out: { key: string; day: number; inMonth: boolean; today: boolean; selected: boolean; count: number; level: number; diaryId: string | null }[] = [];
        for (let index = 0; index < rows * 7; index++) {
            const day = index - offset + 1;
            const inMonth = day >= 1 && day <= daysInMonth;
            const date = new Date(cursor.year, cursor.month, day);
            const key = dateKey(date);
            const count = inMonth ? (counts.get(key) ?? 0) : 0;
            out.push({
                key,
                day: date.getDate(),
                inMonth,
                today: key === todayKey,
                selected: inMonth && key === selectedKey,
                count,
                level: count === 0 ? 0 : Math.max(1, Math.round((4 * count) / Math.max(1, max))),
                diaryId: getDiaryId?.(key) ?? null,
            });
        }
        return out;
    }, [counts, cursor, getDiaryId, selectedKey, todayKey, weekStart]);

    const inMonthKeys = useMemo(() => cells.filter((cell) => cell.inMonth).map((cell) => cell.key), [cells]);
    const focusKey = focusedKey !== null && inMonthKeys.includes(focusedKey)
        ? focusedKey
        : (cells.find((cell) => cell.today)?.key ?? inMonthKeys[0] ?? null);

    const handleGridKeyDown = (event: React.KeyboardEvent) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key))
            return;
        event.preventDefault();
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
    };

    const handleRootKeyDown = (event: React.KeyboardEvent) => {
        if (event.key !== 'Escape')
            return;
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

    const yearMonths = useMemo(() => {
        const formatter = new Intl.DateTimeFormat(locale, { month: 'short' });
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
        return Array.from({ length: 12 }, (_, month) => {
            const daysInMonth = new Date(cursor.year, month + 1, 0).getDate();
            const offset = (new Date(cursor.year, month, 1).getDay() - weekStart + 7) % 7;
            const rows = Math.ceil((offset + daysInMonth) / 7);
            const cells: { level: number; today: boolean }[] = [];
            for (let index = 0; index < rows * 7; index++) {
                const day = index - offset + 1;
                const inMonth = day >= 1 && day <= daysInMonth;
                const key = inMonth ? dateKey(new Date(cursor.year, month, day)) : '';
                const count = inMonth ? (counts.get(key) ?? 0) : 0;
                cells.push({
                    level: count === 0 ? 0 : Math.max(1, Math.round((4 * count) / Math.max(1, yearMax))),
                    today: key === todayKey,
                });
            }
            return { month, label: formatter.format(new Date(cursor.year, month, 1)), total: totals[month] ?? 0, cells };
        });
    }, [counts, cursor.year, locale, todayKey, weekStart]);

    const stripWeeks = useMemo(() => buildStripWeeks(counts, { range, weekStart, now, todayKey, selectedKey, getDiaryId, notesByDay }), [counts, getDiaryId, notesByDay, now, range, selectedKey, todayKey, weekStart]);
    const weekCells = shownWeek !== null ? stripWeeks[shownWeek] : undefined;
    const weekCellsTotal = weekCells?.reduce((sum, cell) => sum + cell.notes.length, 0) ?? 0;

    const focusMonth = focusedMonth !== null && focusedMonth >= 0 && focusedMonth < 12
        ? focusedMonth
        : (isCurrentYear ? now.getMonth() : 0);

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
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
            return;
        event.preventDefault();
        let index = focusMonth;
        if (event.key === 'ArrowLeft')
            index--;
        else if (event.key === 'ArrowRight')
            index++;
        else if (event.key === 'Home')
            index = 0;
        else if (event.key === 'End')
            index = 11;
        index = Math.max(0, Math.min(11, index));
        setFocusedMonth(index);
        event.currentTarget.querySelector<HTMLButtonElement>(`[data-month="${index}"]`)?.focus();
    };

    return (<div onKeyDown={handleRootKeyDown}>
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
                <button type="button" aria-pressed={view === 'month'} onClick={() => onViewChange('month')} className="flex h-6 items-center gap-1 px-2 text-[10.5px] font-medium transition-colors aria-pressed:bg-[var(--accent-soft)] aria-pressed:text-[var(--accent)]">
                    <CalendarDays size={11}/>{t("sidebar.calendar_month_view")}
                </button>
                <button type="button" aria-pressed={view === 'weeks'} onClick={() => onViewChange('weeks')} className="flex h-6 items-center gap-1 border-l border-[var(--border-default)] px-2 text-[10.5px] font-medium transition-colors aria-pressed:bg-[var(--accent-soft)] aria-pressed:text-[var(--accent)]">
                    <BarChart3 size={11}/>{t("sidebar.calendar_week_view")}
                </button>
                <button type="button" aria-pressed={view === 'year'} onClick={() => onViewChange('year')} className="flex h-6 items-center gap-1 border-l border-[var(--border-default)] px-2 text-[10.5px] font-medium transition-colors aria-pressed:bg-[var(--accent-soft)] aria-pressed:text-[var(--accent)]">
                    <CalendarRange size={11}/>{t("sidebar.calendar_year_view")}
                </button>
            </div>
        </div>
        {view === 'month' ? (<div className="mt-1.5 grid grid-cols-7 gap-[2px] px-0.5" onKeyDown={handleGridKeyDown}>
            {weekdayLabels.map((label, index) => (<div key={index} className="flex items-center justify-center text-[9px] font-medium text-[var(--text-quaternary)]">
                {label}
            </div>))}
            {cells.map((cell) => (<Tooltip key={cell.key} label={t("sidebar.calendar_day_tooltip_value0", { value0: cell.key, value1: cell.count })}>
                <button type="button" data-day-key={cell.key} tabIndex={cell.key === focusKey ? 0 : -1} aria-pressed={cell.selected} aria-label={t("sidebar.calendar_day_tooltip_value0", { value0: cell.key, value1: cell.count })} onClick={() => onDayClick(cell.key, cell.diaryId)} className={cn('relative flex aspect-square items-center justify-center rounded-[4px] text-[9.5px] leading-none transition-colors', 'hover:ring-1 hover:ring-inset hover:ring-[var(--accent-ring)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent)]', cell.today && 'ring-1 ring-inset ring-[var(--accent)]', cell.inMonth ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-quaternary)] opacity-60', cell.count > 0 && 'font-semibold text-[var(--text-primary)]')} style={cell.level > 0 ? { backgroundColor: `color-mix(in oklab, var(--accent) ${HEAT_PERCENTS[cell.level]}%, transparent)` } : undefined}>
                    {cell.day}
                    {cell.diaryId && (<span aria-hidden="true" className="absolute bottom-[2px] left-1/2 size-[3px] -translate-x-1/2 rounded-full bg-[var(--accent)]"/>)}
                    {cell.selected && (<span aria-hidden="true" className="absolute inset-x-1 bottom-[1px] h-[2px] rounded-full bg-[var(--accent)]"/>)}
                </button>
            </Tooltip>))}
        </div>) : view === 'year' ? (<div className="mt-1.5 grid grid-cols-12 gap-1 px-0.5" onKeyDown={handleYearGridKeyDown}>
            {yearMonths.map((month) => (<button key={month.month} type="button" data-month={month.month} tabIndex={month.month === focusMonth ? 0 : -1} aria-label={t("sidebar.calendar_year_month_value0", { value0: month.label, value1: month.total })} onClick={() => {
                setFocusedMonth(month.month);
                onCursorChange({ year: cursor.year, month: month.month });
                onViewChange('month');
            }} className="flex min-w-0 flex-col items-center gap-1 rounded-[4px] px-px py-1 transition-colors hover:bg-[var(--bg-hover)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent)]">
                <span className="text-[8.5px] font-medium text-[var(--text-quaternary)]">{month.label}</span>
                <span className="grid w-full grid-cols-7 gap-px">
                    {month.cells.map((cell, index) => (<span key={index} aria-hidden="true" className={cn('aspect-square w-full rounded-[1px]', cell.today && 'ring-1 ring-inset ring-[var(--accent)]')} style={cell.level > 0 ? { backgroundColor: `color-mix(in oklab, var(--accent) ${HEAT_PERCENTS[cell.level]}%, transparent)` } : { backgroundColor: 'var(--bg-inset)' }}/>))}
                </span>
            </button>))}
        </div>) : (<div className="mt-1.5 px-0.5">
            <div className="px-0.5 pb-1 text-[9px] font-medium text-[var(--text-quaternary)]">{t("sidebar.calendar_week_strip_value0", { value0: stripWeeks.length })}</div>
            <div className="flex gap-[2px]">
                {stripWeeks.map((week, weekIndex) => (<button key={weekIndex} type="button" aria-expanded={expandedWeek === weekIndex} aria-label={t("sidebar.calendar_expand_week")} onClick={() => toggleWeek(weekIndex)} className={cn('flex min-w-0 flex-1 flex-col gap-[2px] rounded-[3px] p-px transition-colors', expandedWeek === weekIndex && 'bg-[var(--accent-soft)]')}>
                    {week.map((cell) => (<Tooltip key={cell.key} label={t("sidebar.calendar_day_tooltip_value0", { value0: cell.key, value1: cell.count })}>
                        <span aria-hidden="true" className={cn('aspect-square w-full rounded-[2px]', cell.today && 'ring-1 ring-inset ring-[var(--accent)]')} style={cell.level > 0 ? { backgroundColor: `color-mix(in oklab, var(--accent) ${HEAT_PERCENTS[cell.level]}%, transparent)` } : { backgroundColor: 'var(--bg-inset)' }}/>
                    </Tooltip>))}
                </button>))}
            </div>
            <div className={cn('grid transition-[grid-template-rows] duration-[var(--dur-base)] ease-out', expandedWeek !== null ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                <div aria-hidden={expandedWeek === null} inert={expandedWeek === null} className="min-h-0 overflow-hidden">
                    <div className="mt-1.5 space-y-px rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-inset)] p-1">
                        {shownWeek !== null && stripWeeks[shownWeek] && stripWeeks[shownWeek].map((cell, dayIndex) => (<div key={cell.key}>
                            <div className="flex items-center gap-0.5">
                                <button type="button" aria-label={t("sidebar.calendar_day_tooltip_value0", { value0: cell.key, value1: cell.count })} onClick={() => onDayClick(cell.key, cell.diaryId)} className={cn('flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-[var(--r-sm)] px-1.5 text-left transition-colors hover:bg-[var(--bg-hover)]', cell.selected && 'bg-[var(--accent-soft)]')}>
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
                                {cell.notes.length > 0 && (<button type="button" aria-expanded={expandedDay === cell.key} aria-label={t("sidebar.calendar_expand_day")} onClick={() => setExpandedDay((current) => current === cell.key ? null : cell.key)} className={cn('flex size-6 shrink-0 items-center justify-center rounded-[var(--r-sm)] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]', expandedDay === cell.key && 'text-[var(--text-secondary)]')}>
                                    <ChevronDown size={10} className={cn('transition-transform duration-[var(--dur-fast)]', expandedDay === cell.key && 'rotate-180')}/>
                                </button>)}
                            </div>
                            <div className={cn('grid transition-[grid-template-rows] duration-[var(--dur-base)] ease-out', expandedDay === cell.key ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                                <div aria-hidden={expandedDay !== cell.key} inert={expandedDay !== cell.key} className="min-h-0 overflow-hidden">
                                    <div className="space-y-px py-0.5 pl-3.5 pr-1">
                                        {shownDay === cell.key && cell.notes.map((note) => (<button key={note.id} type="button" onClick={() => onNoteClick(note.id)} className="flex h-6 w-full items-center gap-1.5 rounded-[var(--r-sm)] px-1.5 text-left transition-colors hover:bg-[var(--bg-hover)]">
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
                            <button type="button" aria-expanded={expandedWeekNotes} aria-label={t("sidebar.calendar_week_notes_value0", { value0: weekCellsTotal })} onClick={() => setExpandedWeekNotes((open) => !open)} className="flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-[var(--r-sm)] px-1.5 text-left transition-colors hover:bg-[var(--bg-hover)]">
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
                                        }} className="flex w-full items-center gap-1 rounded-[var(--r-sm)] px-1.5 py-0.5 text-left text-[9.5px] font-medium text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-hover)]">
                                            <span>{weekdayLabels[dayIndex]}</span>
                                            <span className="tabular">{cell.key.slice(5)}</span>
                                            <span className="ml-auto tabular">{cell.notes.length}</span>
                                        </button>
                                        {cell.notes.map((note) => (<button key={note.id} type="button" onClick={() => onNoteClick(note.id)} className="flex h-6 w-full items-center gap-1.5 rounded-[var(--r-sm)] py-0.5 pr-1.5 pl-5 text-left transition-colors hover:bg-[var(--bg-hover)]">
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

function alignWeekStart(date: Date, weekStart: 0 | 1): Date {
    const out = new Date(date);
    out.setHours(0, 0, 0, 0);
    out.setDate(out.getDate() - ((out.getDay() - weekStart + 7) % 7));
    return out;
}