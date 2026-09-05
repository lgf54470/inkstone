import type { CalendarPeriod } from './periods';

export const CALENDAR_ROOT_ID = 'cal'

export const TODO_ROOT_ID = 'todo'

export interface VirtualTreeNamespace {
    rootId: string
    prefix: string
}

export const CALENDAR_TREE: VirtualTreeNamespace = { rootId: CALENDAR_ROOT_ID, prefix: 'cal:' }

export const TODO_TREE: VirtualTreeNamespace = { rootId: TODO_ROOT_ID, prefix: 'todo:' }

export const DEFAULT_TODO_TAG = '待办'

export const TREE_ROW_INDENT_BASE = 6

export const TREE_ROW_INDENT_STEP = 13

// Left padding (px) for a sidebar tree row at the given visual level, where level 0 is a root row.
export function treeRowIndent(level: number): number {
    return TREE_ROW_INDENT_BASE + level * TREE_ROW_INDENT_STEP
}

// Virtual rows count the root at depth -1, so a row's visual level is its depth plus one.
export function virtualTreeRowIndent(depth: number): number {
    return treeRowIndent(depth + 1)
}

export function splitTodoTags(tagText: string): string[] {
    return tagText.split(',').map((tag) => tag.trim()).filter(Boolean)
}

export function resolveTodoTag(pref: string | null | undefined, locale: string): string {
    const trimmed = pref?.trim()
    if (trimmed)
        return trimmed
    return locale === 'en-US' ? 'todo' : DEFAULT_TODO_TAG
}

export function matchesNamespace(id: string | null | undefined, ns: VirtualTreeNamespace): boolean {
    return id === ns.rootId || Boolean(id?.startsWith(ns.prefix))
}

export function isCalendarFolderId(id: string | null | undefined): boolean {
    return matchesNamespace(id, CALENDAR_TREE)
}

export function isTodoFolderId(id: string | null | undefined): boolean {
    return matchesNamespace(id, TODO_TREE)
}

export function isVirtualFolderId(id: string | null | undefined): boolean {
    return isCalendarFolderId(id) || isTodoFolderId(id)
}

export function virtualId(period: CalendarPeriod, ns: VirtualTreeNamespace): string {
    switch (period.kind) {
        case 'root':
            return ns.rootId
        case 'year':
            return `${ns.prefix}${period.year}`
        case 'quarter':
            return `${ns.prefix}${period.year}:q${period.quarter}`
        case 'month':
            return `${ns.prefix}${period.year}:q${quarterOfMonth(period.month)}:${String(period.month).padStart(2, '0')}`
        case 'week':
            return `${ns.prefix}${period.year}:q${quarterOfMonth(period.month)}:${String(period.month).padStart(2, '0')}:w${String(period.week).padStart(2, '0')}`
    }
}

export function parseVirtualId(id: string | null | undefined, ns: VirtualTreeNamespace): CalendarPeriod | null {
    if (!id)
        return null;
    if (id === ns.rootId)
        return { kind: 'root' };
    if (!id.startsWith(ns.prefix))
        return null;
    const parts = id.slice(ns.prefix.length).split(':');
    if (parts.length < 1 || parts.length > 4)
        return null;
    const year = Number(parts[0]);
    if (!/^\d{4}$/.test(parts[0] ?? '') || !Number.isInteger(year))
        return null;
    if (parts.length === 1)
        return { kind: 'year', year };
    const quarter = quarterOfPart(parts[1]);
    if (quarter === null)
        return null;
    if (parts.length === 2)
        return { kind: 'quarter', year, quarter };
    const month = monthOfPart(parts[2]);
    if (month === null)
        return null;
    if (parts.length === 3)
        return { kind: 'month', year, month };
    const week = /^w(\d{2})$/.exec(parts[3] ?? '')?.[1];
    const weekNumber = week ? Number(week) : NaN;
    if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 53)
        return null;
    return { kind: 'week', year, month, week: weekNumber };
}

export function quarterOfPart(part: string | undefined): number | null {
    const match = /^q([1-4])$/.exec(part ?? '');
    return match ? Number(match[1]) : null;
}

export function monthOfPart(part: string | undefined): number | null {
    const match = /^(0[1-9]|1[0-2])$/.exec(part ?? '');
    return match ? Number(match[1]) : null;
}

export function quarterOfMonth(month: number): number {
    return Math.floor((month - 1) / 3) + 1;
}
