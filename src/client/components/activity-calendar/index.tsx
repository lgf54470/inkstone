import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { DateRangeFilter } from '@shared/types';
import { cn } from '../../lib/cn';
import { CalendarHeader } from './header';
import { WeeksStrip } from './weeks-strip';
import { HEAT_PERCENTS, buildStripWeeks, type WeekCell } from './strip';
import type { ActivityCalendarProps } from './props';
import { t } from '../../lib/i18n';
import { dateKey } from '../../lib/time';
import { latestEditOutsideWindow } from '../../features/list';
import { Tooltip } from '../overlay';
import { MonthGrid, YearGrid, YEAR_GRID_COLUMNS, buildMonthGridCells, yearGridColumns, type YearGridColumns } from '../calendar-grids';
export { latestEditOutsideWindow };
export { buildStripWeeks } from './strip';
import { monthRangeToKeys } from './range';
export { monthRangeToKeys } from './range';
export type { BuildStripWeeksOptions, CalendarDayNote, WeekCell } from './strip';

// The calendar's inputs (counts, notesByDay, diary lookup) now keep their
// identity whenever a notes-map commit touches none of the read fields, so a
// shallow memo lets the whole heatmap subtree skip rendering on such commits
// (typing pauses still legitimately rebuild today's slice and re-render).
export const ActivityCalendarMemo = memo(ActivityCalendar);

/** Reusable calendar + activity heatmap: navigable month grid, yearly month columns, and a GitHub-style weekly strip, with optional per-day note lists. */
export function ActivityCalendar({ counts, notesByDay, getDiaryId, locale, weekStart = 1, today, range, selectedRange, latestEditKey, view, onViewChange, cursor, onCursorChange, onDayClick, onDaySelect,    onRangeSelect, onGapDayClick, onNoteClick, columnsPreference = 'auto', jumpFlash = 0 }: ActivityCalendarProps) {
    const [expandedWeek, setExpandedWeek] = useState<number | null>(null);
    const [expandedDay, setExpandedDay] = useState<string | null>(null);
    const [isExpandedWeekNotes, setIsExpandedWeekNotes] = useState(false);
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
    const monthFlashRef = useRef<HTMLDivElement | null>(null);
    const weekFlashRef = useRef<HTMLDivElement | null>(null);
    const [internalFlash, setInternalFlash] = useState(0);
    const flash = () => setInternalFlash((n) => n + 1);
    const flashNonce = jumpFlash + internalFlash;
    useEffect(() => {
        // Marks an external month jump (settings preview click) or an internal jump (week click, gap-cell follow, endpoint locate) with the same fade-in + receding accent ring.
        if (flashNonce <= 0)
            return;
        const el = view === 'month' ? monthFlashRef.current : view === 'weeks' ? weekFlashRef.current : null;
        if (!el || typeof el.animate !== 'function')
            return;
        if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
            return;
        const animation = el.animate([
            { opacity: 0.25, boxShadow: '0 0 0 2px var(--accent)' },
            { opacity: 1, boxShadow: '0 0 0 9px rgba(0, 0, 0, 0)' },
        ], { duration: 1100, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' });
        return () => animation.cancel();
    }, [flashNonce, view]);
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
        setIsExpandedWeekNotes(false);
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
        if (isExpandedWeekNotes) {
            setIsExpandedWeekNotes(false);
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
        flash();
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

    const focusWeekday = (month: number, column: number, scope: Element) => {
        scope.querySelector<HTMLButtonElement>(`[data-month-card="${month}"] [data-weekday="${column}"]`)?.focus();
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
        const target = event.target as HTMLElement;
        const weekdayButton = target.closest<HTMLButtonElement>('[data-weekday]');
        const card = target.closest<HTMLElement>('[data-month-card]');
        const cardMonth = card ? Number(card.getAttribute('data-month-card')) : -1;
        if (weekdayButton && cardMonth >= 0 && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Escape'].includes(event.key)) {
            event.preventDefault();
            const column = Number(weekdayButton.getAttribute('data-weekday'));
            if (event.key === 'ArrowLeft')
                focusWeekday(cardMonth, Math.max(0, column - 1), event.currentTarget);
            else if (event.key === 'ArrowRight')
                focusWeekday(cardMonth, Math.min(6, column + 1), event.currentTarget);
            else
                event.currentTarget.querySelector<HTMLButtonElement>(`[data-month="${cardMonth}"]`)?.focus();
            return;
        }
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key))
            return;
        event.preventDefault();
        if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && cardMonth >= 0) {
            focusWeekday(cardMonth, 0, event.currentTarget);
            return;
        }
        let index = focusMonth;
        if (event.key === 'ArrowUp')
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
            handleGapDayClick(key);
        else
            onDayClick(key, diaryId);
    };
    const handleGapDayClick = (key: string) => {
        flash();
        onGapDayClick(key);
    };
    const handleStripWeekClick = (event: React.MouseEvent, weekIndex: number) => {
        const week = stripWeeks[weekIndex];
        const first = week?.[0]?.key;
        const last = week?.[6]?.key;
        if (first && last)
            onRangeSelect(first, last);
        if (!event.shiftKey)
            toggleWeek(weekIndex);
        flash();
    };

    return (<div ref={rootRef} onKeyDown={handleRootKeyDown}>
        <CalendarHeader
        view={view}
        onViewChange={onViewChange}
        isCurrentMonth={isCurrentMonth}
        isCurrentYear={isCurrentYear}
        shiftMonth={shiftMonth}
        shiftYear={shiftYear}
        jumpToCurrentMonth={jumpToCurrentMonth}
        jumpToCurrentYear={jumpToCurrentYear}
    />
        {view === 'month' ? (<><div className="mt-1.5 px-0.5">
            {latestEditOutside !== null && (<button type="button" aria-label={t(gapAhead ? "sidebar.calendar_gap_banner_ahead_value0" : "sidebar.calendar_gap_banner_value0", { value0: latestOutsideDays ?? 0 })} onClick={() => handleGapDayClick(latestEditOutside.key)} className="flex h-6 w-full items-center gap-1.5 rounded-[var(--r-sm)] border border-dashed border-[var(--accent)]/60 bg-[var(--accent-soft)]/60 px-2 text-[length:var(--text-10)] font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent-soft)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent)]">
                    <RotateCcw size={10} className="shrink-0"/>
                    <span className="min-w-0 flex-1 truncate text-left">{t(gapAhead ? "sidebar.calendar_gap_banner_ahead_value0" : "sidebar.calendar_gap_banner_value0", { value0: latestOutsideDays ?? 0 })}</span>
                </button>)}
            </div><div ref={monthFlashRef} className="rounded-[var(--r-md)]"><MonthGrid
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
                    }} className={cn('relative flex aspect-square items-center justify-center rounded-[var(--r-xs)] text-[length:var(--text-9\.5)] leading-none transition-colors', 'hover:ring-1 hover:ring-inset hover:ring-[var(--accent-ring)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent)]', cell.today && 'ring-1 ring-inset ring-[var(--accent)]', cell.inMonth ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-quaternary)] opacity-60', count > 0 && 'font-semibold text-[var(--text-primary)]', isLatestOutside(cell.key) && 'border border-dashed border-[var(--accent)]/80')} style={level > 0 ? { backgroundColor: `color-mix(in oklab, var(--accent) ${HEAT_PERCENTS[level]}%, transparent)` } : undefined}>
                        {cell.day}
                        {diaryId && (<span aria-hidden="true" className="absolute bottom-[2px] left-1/2 size-[3px] -translate-x-1/2 rounded-full bg-[var(--accent)]"/>)}
                        {selected && (<span aria-hidden="true" className="absolute inset-x-1 bottom-[1px] h-[2px] rounded-full bg-[var(--accent)]"/>)}
                    </button>
                </Tooltip>);
            }}
        /></div></>) : view === 'year' ? (<>
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
                    return (<div key={month.month} data-month-card={month.month} className={cn('flex min-w-0 flex-col items-center gap-1 rounded-[var(--r-xs)] px-px py-1 transition-colors hover:bg-[var(--bg-hover)] focus-within:ring-1 focus-within:ring-inset focus-within:ring-[var(--accent)]', inRangePreview && 'bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)]', yearRangeAnchor?.month === month.month && 'ring-1 ring-inset ring-[var(--accent)]')} onMouseEnter={() => { if (yearRangeAnchor !== null) setYearRangeHover(month.month); }}>
                        <span className="text-[length:var(--text-8\.5)] font-medium text-[var(--text-quaternary)]">{monthLabels[month.month]}</span>
                        <span className="grid w-full grid-cols-7 gap-px leading-none">
                            {weekdayLabels.map((label, index) => (<button key={index} type="button" data-weekday={index} tabIndex={-1} aria-label={t("sidebar.calendar_year_weekday_value0", { value0: monthLabels[month.month] ?? '', value1: label })} onClick={() => handleWeekdayClick(month.month, index)} className="rounded-[var(--r-1)] py-px text-center text-[length:var(--text-6)] font-medium text-[var(--text-quaternary)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent)]">
                                {label}
                            </button>))}
                        </span>
                        <button type="button" data-month={month.month} tabIndex={month.month === focusMonth ? 0 : -1} aria-label={t("sidebar.calendar_year_month_value0", { value0: monthLabels[month.month] ?? '', value1: yearMeta.totals[month.month] ?? 0 })} onClick={(event) => {
                            setFocusedMonth(month.month);
                            if (event.detail === 0) {
                                onCursorChange({ year: cursor.year, month: month.month });
                                onViewChange('month');
                                flash();
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
                        }} className="grid w-full grid-cols-7 gap-px rounded-[var(--r-2)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent)]">
                            {month.cells.map((cell, index) => (<span key={index} aria-hidden="true" className={cn('aspect-square w-full rounded-[var(--r-1)]', cell.today && 'ring-1 ring-inset ring-[var(--accent)]')} style={!cell.inMonth
                                ? { backgroundColor: 'transparent' }
                                : (yearLevel(cell.key) > 0 ? { backgroundColor: `color-mix(in oklab, var(--accent) ${HEAT_PERCENTS[yearLevel(cell.key)]}%, transparent)` } : { backgroundColor: 'var(--bg-inset)' })}/>))}
                        </button>
                    </div>);
                }}
            />
            {yearRangeAnchor !== null && (<div className="mt-1 px-0.5 text-[length:var(--text-9)] text-[var(--text-tertiary)]">
                {t("sidebar.calendar_year_range_hint_value0", { value0: monthLabels[yearRangeAnchor.month] ?? '' })}
            </div>)}
        </>) : (<WeeksStrip
        stripWeeks={stripWeeks}
        expandedWeek={expandedWeek}
        shownWeek={shownWeek}
        expandedDay={expandedDay}
        shownDay={shownDay}
        isExpandedWeekNotes={isExpandedWeekNotes}
        weekCells={weekCells}
        weekCellsTotal={weekCellsTotal}
        weekdayLabels={weekdayLabels}
        flashRef={weekFlashRef}
        onStripWeekClick={handleStripWeekClick}
        onToggleDay={(key) => setExpandedDay((current) => (current === key ? null : key))}
        onToggleWeekNotes={() => setIsExpandedWeekNotes((open) => !open)}
        onActivateDay={activateDay}
        onNoteClick={onNoteClick}
        onJumpToDay={(key) => {
            const [year, month] = key.split('-').map(Number);
            setFocusedKey(key);
            onCursorChange({ year, month: month - 1 });
            onViewChange('month');
            onDaySelect(key);
        }}
        isWeekRangeActive={isWeekRangeActive}
        isLatestOutside={isLatestOutside}
        gapLabel={gapLabel}
        flaggedLabel={flaggedLabel}
    />)}
        <div className="mt-1.5 flex items-center gap-1 px-1">
            <span className="text-[length:var(--text-9)] text-[var(--text-quaternary)]">{t("sidebar.calendar_less")}</span>
            {[0, 1, 2, 3, 4].map((level) => (<span key={level} aria-hidden="true" className="size-[9px] rounded-[var(--r-2)]" style={{ backgroundColor: level === 0 ? 'var(--bg-inset)' : `color-mix(in oklab, var(--accent) ${HEAT_PERCENTS[level]}%, transparent)` }}/>))}
            <span className="text-[length:var(--text-9)] text-[var(--text-quaternary)]">{t("sidebar.calendar_more")}</span>
        </div>
    </div>);
}