import type { NoteSummary } from "@shared/types";
import { dateKey } from "../time";
import type { VirtualTreeNamespace } from './ids';
import { TODO_TREE } from './ids';
import { DEFAULT_TODO_TAG } from './ids';
import { splitTodoTags } from './ids';
import { virtualId } from './ids';
import { parseVirtualId } from './ids';
import { quarterOfMonth } from './ids';
import { buildVirtualTree } from './tree';

export type CalendarPeriod =
    | { kind: 'root' }
    | { kind: 'year'; year: number }
    | { kind: 'quarter'; year: number; quarter: number }
    | { kind: 'month'; year: number; month: number }
    | { kind: 'week'; year: number; month: number; week: number }

export interface CalendarNode {
    id: string
    name: string
    depth: number
    count: number
    children: CalendarNode[]
}

export function calendarNodeName(period: CalendarPeriod): string {
    switch (period.kind) {
        case 'root':
            return ''
        case 'year':
            return String(period.year)
        case 'quarter':
            return `Q${period.quarter}`
        case 'month':
            return String(period.month).padStart(2, '0')
        case 'week':
            return `ww${String(period.week).padStart(2, '0')}`
    }
}

export function isoWeekOf(date: Date): { year: number; week: number } {
    const thursday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    thursday.setDate(thursday.getDate() + 4 - (thursday.getDay() || 7));
    const yearStart = new Date(thursday.getFullYear(), 0, 1);
    const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
    return { year: thursday.getFullYear(), week };
}

export function mondayOfWeek(year: number, week: number): Date {
    const jan4 = new Date(year, 0, 4);
    const jan4Day = jan4.getDay() || 7;
    const week1Monday = jan4.getDate() - (jan4Day - 1);
    return new Date(year, 0, week1Monday + (week - 1) * 7);
}

export function calendarPeriodsForDate(date: Date): {
    year: CalendarPeriod;
    quarter: CalendarPeriod;
    month: CalendarPeriod;
    week: CalendarPeriod;
} {
    const { year, month, week } = noteWeekPeriod(date.getTime());
    return {
        year: { kind: 'year', year },
        quarter: { kind: 'quarter', year, quarter: quarterOfMonth(month) },
        month: { kind: 'month', year, month },
        week: { kind: 'week', year, month, week },
    };
}

export function calendarPeriodForIsoWeek(year: number, week: number): CalendarPeriod | null {
    if (!Number.isInteger(week) || week < 1 || week > 53)
        return null;
    const monday = mondayOfWeek(year, week);
    const thursday = new Date(monday);
    thursday.setDate(monday.getDate() + 3);
    const actual = isoWeekOf(thursday);
    if (actual.year !== year || actual.week !== week)
        return null;
    return { kind: 'week', year, month: thursday.getMonth() + 1, week };
}

export function dateFromParts(year: number, month: number, day: number): Date | null {
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day)
        return null;
    return date;
}

export function parseCalendarJumpQuery(query: string, today?: Date): CalendarPeriod | null {
    const text = query.trim().toLowerCase();
    const yearMatch = /^(\d{4})$/.exec(text);
    if (yearMatch)
        return { kind: 'year', year: Number(yearMatch[1]) };
    const monthMatch = /^(\d{4})-(\d{1,2})$/.exec(text);
    if (monthMatch) {
        const month = Number(monthMatch[2]);
        if (month < 1 || month > 12)
            return null;
        return { kind: 'month', year: Number(monthMatch[1]), month };
    }
    const fullDateMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
    if (fullDateMatch) {
        const date = dateFromParts(Number(fullDateMatch[1]), Number(fullDateMatch[2]), Number(fullDateMatch[3]));
        if (!date)
            return null;
        return calendarPeriodsForDate(date).week;
    }
    const monthDayMatch = /^(\d{1,2})-(\d{1,2})$/.exec(text);
    if (monthDayMatch) {
        const base = today ?? new Date();
        const date = dateFromParts(base.getFullYear(), Number(monthDayMatch[1]), Number(monthDayMatch[2]));
        if (!date)
            return null;
        return calendarPeriodsForDate(date).week;
    }
    const weekMatch = /^ww(\d{1,2})$/.exec(text);
    if (weekMatch)
        return calendarPeriodForIsoWeek((today ?? new Date()).getFullYear(), Number(weekMatch[1]));
    const yearWeekMatch = /^(\d{4})-ww(\d{1,2})$/.exec(text);
    if (yearWeekMatch)
        return calendarPeriodForIsoWeek(Number(yearWeekMatch[1]), Number(yearWeekMatch[2]));
    return null;
}

export function virtualNearestNeighbors(period: CalendarPeriod, notes: Iterable<NoteSummary>, ns: VirtualTreeNamespace): { prev: CalendarNode | null; next: CalendarNode | null } {
    const targetId = virtualId(period, ns);
    let prev: CalendarNode | null = null;
    let next: CalendarNode | null = null;
    const scan = (nodes: CalendarNode[]): void => {
        for (const node of nodes) {
            const parsed = parseVirtualId(node.id, ns);
            if (parsed && parsed.kind === period.kind) {
                if (node.id < targetId && (!prev || node.id > prev.id))
                    prev = node;
                else if (node.id > targetId && (!next || node.id < next.id))
                    next = node;
                continue;
            }
            scan(node.children);
        }
    };
    scan(buildVirtualTree(notes, ns));
    return { prev, next };
}

export function calendarPeriodLabel(period: CalendarPeriod): string | null {
    switch (period.kind) {
        case 'root':
            return null;
        case 'year':
            return String(period.year);
        case 'quarter':
            return `${period.year} · Q${period.quarter}`;
        case 'month':
            return `${period.year}-${String(period.month).padStart(2, '0')}`;
        case 'week':
            return `${period.year} · ww${String(period.week).padStart(2, '0')}`;
    }
}

export function virtualPeriodKeyRange(id: string | null | undefined, ns: VirtualTreeNamespace): { start: string; end: string } | null {
    const period = parseVirtualId(id, ns);
    if (!period || period.kind === 'root')
        return null;
    const start = new Date(0);
    const end = new Date(0);
    switch (period.kind) {
        case 'year':
            start.setFullYear(period.year, 0, 1);
            end.setFullYear(period.year, 11, 31);
            break;
        case 'quarter': {
            const firstMonth = (period.quarter - 1) * 3;
            start.setFullYear(period.year, firstMonth, 1);
            end.setFullYear(period.year, firstMonth + 3, 0);
            break;
        }
        case 'month':
            start.setFullYear(period.year, period.month - 1, 1);
            end.setFullYear(period.year, period.month, 0);
            break;
        case 'week': {
            const monday = mondayOfWeek(period.year, period.week);
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            return { start: dateKey(monday), end: dateKey(sunday) };
        }
        default:
            return null;
    }
    return { start: dateKey(start), end: dateKey(end) };
}

export function noteWeekPeriod(ts: number): { year: number; month: number; week: number } {
    const date = new Date(ts);
    const { year, week } = isoWeekOf(date);
    const thursday = mondayOfWeek(year, week);
    thursday.setDate(thursday.getDate() + 3);
    return { year, month: thursday.getMonth() + 1, week };
}

export function calendarPeriodMatchesNote(period: CalendarPeriod, note: NoteSummary): boolean {
    if (period.kind === 'root')
        return true;
    const leaf = noteWeekPeriod(note.createdAt);
    switch (period.kind) {
        case 'year':
            return leaf.year === period.year;
        case 'quarter':
            return leaf.year === period.year && quarterOfMonth(leaf.month) === period.quarter;
        case 'month':
            return leaf.year === period.year && leaf.month === period.month;
        case 'week':
            return leaf.year === period.year && leaf.month === period.month && leaf.week === period.week;
        default:
            return true;
    }
}

export function virtualPeriodMatchesNote(period: CalendarPeriod, note: NoteSummary, ns: VirtualTreeNamespace, tagText: string = DEFAULT_TODO_TAG): boolean {
    if (ns === TODO_TREE && !splitTodoTags(tagText).some((tag) => note.tags.includes(tag)))
        return false;
    return calendarPeriodMatchesNote(period, note);
}
