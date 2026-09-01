import { useMemo, useRef, useState } from 'react';
import { BarChart3, CalendarCheck, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { cn } from '../lib/cn';
import { t } from '../lib/i18n';
import { IconButton } from './primitives';
import { Tooltip } from './overlay';

const HEAT_PERCENTS = [0, 16, 34, 54, 76] as const;
const DEFAULT_WEEKS = 16;

export interface CalendarDayNote {
    id: string;
    title: string;
}

export interface ActivityCalendarProps {
    counts: ReadonlyMap<string, number>;
    notesByDay?: ReadonlyMap<string, CalendarDayNote[]>;
    getDiaryId?: (key: string) => string | null;
    locale: string;
    weekStart?: 0 | 1;
    today?: Date;
    range?: { start: Date; end: Date };
    view: 'month' | 'weeks';
    onViewChange: (view: 'month' | 'weeks') => void;
    cursor: { year: number; month: number };
    onCursorChange: (cursor: { year: number; month: number }) => void;
    onDayClick: (key: string, diaryId: string | null) => void;
    onNoteClick: (noteId: string) => void;
}

/** Reusable month calendar + activity heatmap: navigable month grid and a GitHub-style weekly strip, with optional per-day note lists. */
export function ActivityCalendar({ counts, notesByDay, getDiaryId, locale, weekStart = 1, today, range, view, onViewChange, cursor, onCursorChange, onDayClick, onNoteClick }: ActivityCalendarProps) {
    const [expandedWeek, setExpandedWeek] = useState<number | null>(null);
    const [expandedDay, setExpandedDay] = useState<string | null>(null);
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

    const shiftMonth = (delta: number) => {
        const month = cursor.month + delta;
        onCursorChange({ year: cursor.year + Math.floor(month / 12), month: ((month % 12) + 12) % 12 });
    };
    const jumpToCurrentMonth = () => onCursorChange({ year: now.getFullYear(), month: now.getMonth() });
    const toggleWeek = (index: number) => {
        setExpandedWeek((current) => current === index ? null : index);
        setExpandedDay(null);
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
        const out: { key: string; day: number; inMonth: boolean; today: boolean; count: number; level: number; diaryId: string | null }[] = [];
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
                count,
                level: count === 0 ? 0 : Math.max(1, Math.round((4 * count) / Math.max(1, max))),
                diaryId: getDiaryId?.(key) ?? null,
            });
        }
        return out;
    }, [counts, cursor, getDiaryId, todayKey, weekStart]);

    const stripWeeks = useMemo(() => {
        const anchor = alignWeekStart(range ? new Date(range.end) : now, weekStart);
        const rangeStart = range
            ? alignWeekStart(new Date(range.start), weekStart)
            : (() => {
                const d = new Date(anchor);
                d.setDate(d.getDate() - (DEFAULT_WEEKS - 1) * 7);
                return d;
            })();
        const weekCount = Math.max(1, Math.round((anchor.getTime() - rangeStart.getTime()) / (7 * 24 * 3600 * 1000)) + 1);
        let max = 0;
        const raw: { key: string; count: number; today: boolean }[] = [];
        const cursorDate = new Date(rangeStart);
        for (let index = 0; index < weekCount * 7; index++) {
            const key = dateKey(cursorDate);
            const count = counts.get(key) ?? 0;
            if (count > max)
                max = count;
            raw.push({ key, count, today: key === todayKey });
            cursorDate.setDate(cursorDate.getDate() + 1);
        }
        const weeks: { key: string; count: number; today: boolean; level: number; diaryId: string | null; notes: CalendarDayNote[] }[][] = [];
        for (let week = 0; week < weekCount; week++) {
            weeks.push(raw.slice(week * 7, week * 7 + 7).map(({ key, count, today }) => ({
                key,
                count,
                today,
                level: count === 0 ? 0 : Math.max(1, Math.round((4 * count) / Math.max(1, max))),
                diaryId: getDiaryId?.(key) ?? null,
                notes: notesByDay?.get(key) ?? [],
            })));
        }
        return weeks;
    }, [counts, getDiaryId, notesByDay, now, range, todayKey, weekStart]);

    return (<>
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
            </div>
            <div role="group" aria-label={t("sidebar.calendar_view")} className="flex overflow-hidden rounded-[var(--r-sm)] border border-[var(--border-default)]">
                <button type="button" aria-pressed={view === 'month'} onClick={() => onViewChange('month')} className="flex h-6 items-center gap-1 px-2 text-[10.5px] font-medium transition-colors aria-pressed:bg-[var(--accent-soft)] aria-pressed:text-[var(--accent)]">
                    <CalendarDays size={11}/>{t("sidebar.calendar_month_view")}
                </button>
                <button type="button" aria-pressed={view === 'weeks'} onClick={() => onViewChange('weeks')} className="flex h-6 items-center gap-1 border-l border-[var(--border-default)] px-2 text-[10.5px] font-medium transition-colors aria-pressed:bg-[var(--accent-soft)] aria-pressed:text-[var(--accent)]">
                    <BarChart3 size={11}/>{t("sidebar.calendar_week_view")}
                </button>
            </div>
        </div>
        {view === 'month' ? (<div className="mt-1.5 grid grid-cols-7 gap-[2px] px-0.5">
            {weekdayLabels.map((label, index) => (<div key={index} className="flex items-center justify-center text-[9px] font-medium text-[var(--text-quaternary)]">
                {label}
            </div>))}
            {cells.map((cell) => (<Tooltip key={cell.key} label={t("sidebar.calendar_day_tooltip_value0", { value0: cell.key, value1: cell.count })}>
                <button type="button" aria-label={t("sidebar.calendar_day_tooltip_value0", { value0: cell.key, value1: cell.count })} onClick={() => onDayClick(cell.key, cell.diaryId)} className={cn('relative flex aspect-square items-center justify-center rounded-[4px] text-[9.5px] leading-none transition-colors', 'hover:ring-1 hover:ring-inset hover:ring-[var(--accent-ring)]', cell.today && 'ring-1 ring-inset ring-[var(--accent)]', cell.inMonth ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-quaternary)] opacity-60', cell.count > 0 && 'font-semibold text-[var(--text-primary)]')} style={cell.level > 0 ? { backgroundColor: `color-mix(in oklab, var(--accent) ${HEAT_PERCENTS[cell.level]}%, transparent)` } : undefined}>
                    {cell.day}
                    {cell.diaryId && (<span aria-hidden="true" className="absolute bottom-[2px] left-1/2 size-[3px] -translate-x-1/2 rounded-full bg-[var(--accent)]"/>)}
                </button>
            </Tooltip>))}
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
                                <button type="button" aria-label={t("sidebar.calendar_day_tooltip_value0", { value0: cell.key, value1: cell.count })} onClick={() => onDayClick(cell.key, cell.diaryId)} className="flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-[var(--r-sm)] px-1.5 text-left transition-colors hover:bg-[var(--bg-hover)]">
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
                    </div>
                </div>
            </div>
        </div>)}
        <div className="mt-1.5 flex items-center gap-1 px-1">
            <span className="text-[9px] text-[var(--text-quaternary)]">{t("sidebar.calendar_less")}</span>
            {[0, 1, 2, 3, 4].map((level) => (<span key={level} aria-hidden="true" className="size-[9px] rounded-[2px]" style={{ backgroundColor: level === 0 ? 'var(--bg-inset)' : `color-mix(in oklab, var(--accent) ${HEAT_PERCENTS[level]}%, transparent)` }}/>))}
            <span className="text-[9px] text-[var(--text-quaternary)]">{t("sidebar.calendar_more")}</span>
        </div>
    </>);
}

function pad2(value: number): string {
    return String(value).padStart(2, '0');
}

function dateKey(date: Date): string {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function alignWeekStart(date: Date, weekStart: 0 | 1): Date {
    const out = new Date(date);
    out.setHours(0, 0, 0, 0);
    out.setDate(out.getDate() - ((out.getDay() - weekStart + 7) % 7));
    return out;
}
