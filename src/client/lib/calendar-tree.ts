import type { NoteSummary } from '@shared/types';
import { dateKey } from './time';

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

function matchesNamespace(id: string | null | undefined, ns: VirtualTreeNamespace): boolean {
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

function quarterOfPart(part: string | undefined): number | null {
    const match = /^q([1-4])$/.exec(part ?? '');
    return match ? Number(match[1]) : null;
}

function monthOfPart(part: string | undefined): number | null {
    const match = /^(0[1-9]|1[0-2])$/.exec(part ?? '');
    return match ? Number(match[1]) : null;
}

function quarterOfMonth(month: number): number {
    return Math.floor((month - 1) / 3) + 1;
}

function isoWeekOf(date: Date): { year: number; week: number } {
    const thursday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    thursday.setDate(thursday.getDate() + 4 - (thursday.getDay() || 7));
    const yearStart = new Date(thursday.getFullYear(), 0, 1);
    const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
    return { year: thursday.getFullYear(), week };
}

function mondayOfWeek(year: number, week: number): Date {
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

function dateFromParts(year: number, month: number, day: number): Date | null {
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

function noteWeekPeriod(ts: number): { year: number; month: number; week: number } {
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

export function filterTodoNotes(notes: Iterable<NoteSummary>, tagText: string = DEFAULT_TODO_TAG): NoteSummary[] {
    const tags = splitTodoTags(tagText)
    return [...notes].filter((note) => tags.some((tag) => note.tags.includes(tag)))
}

export function virtualPeriodMatchesNote(period: CalendarPeriod, note: NoteSummary, ns: VirtualTreeNamespace, tagText: string = DEFAULT_TODO_TAG): boolean {
    if (ns === TODO_TREE && !splitTodoTags(tagText).some((tag) => note.tags.includes(tag)))
        return false;
    return calendarPeriodMatchesNote(period, note);
}

export function virtualPathSegments(id: string | null | undefined, ns: VirtualTreeNamespace): string[] | null {
    const period = parseVirtualId(id, ns);
    if (!period || period.kind === 'root')
        return null;
    switch (period.kind) {
        case 'year':
            return [String(period.year)];
        case 'quarter':
            return [String(period.year), `Q${period.quarter}`];
        case 'month':
            return [String(period.year), `Q${quarterOfMonth(period.month)}`, String(period.month).padStart(2, '0')];
        case 'week':
            return [
                String(period.year),
                `Q${quarterOfMonth(period.month)}`,
                String(period.month).padStart(2, '0'),
                `ww${String(period.week).padStart(2, '0')}`,
            ];
        default:
            return null;
    }
}

export function virtualAncestorIds(id: string | null | undefined, ns: VirtualTreeNamespace): string[] {
    const period = parseVirtualId(id, ns);
    if (!period)
        return [];
    const chain: CalendarPeriod[] = [{ kind: 'root' }];
    switch (period.kind) {
        case 'year':
            break;
        case 'quarter':
            chain.push({ kind: 'year', year: period.year });
            break;
        case 'month':
            chain.push({ kind: 'year', year: period.year }, { kind: 'quarter', year: period.year, quarter: quarterOfMonth(period.month) });
            break;
        case 'week':
            chain.push(
                { kind: 'year', year: period.year },
                { kind: 'quarter', year: period.year, quarter: quarterOfMonth(period.month) },
                { kind: 'month', year: period.year, month: period.month },
            );
            break;
        case 'root':
            break;
    }
    return chain.slice(1).map((item) => virtualId(item, ns));
}

export function buildVirtualTree(notes: Iterable<NoteSummary>, ns: VirtualTreeNamespace, includeEmpty = false): CalendarNode[] {
    const counts = new Map<string, number>();
    const childrenOf = new Map<string, Set<string>>();
    const childrenSet = (id: string): Set<string> => {
        let set = childrenOf.get(id);
        if (!set) {
            set = new Set();
            childrenOf.set(id, set);
        }
        return set;
    };
    let minYear = Infinity;
    let maxYear = -Infinity;
    for (const note of notes) {
        if (note.deletedAt !== null)
            continue;
        const leaf = noteWeekPeriod(note.createdAt);
        const ids = [
            ns.rootId,
            virtualId({ kind: 'year', year: leaf.year }, ns),
            virtualId({ kind: 'quarter', year: leaf.year, quarter: quarterOfMonth(leaf.month) }, ns),
            virtualId({ kind: 'month', year: leaf.year, month: leaf.month }, ns),
            virtualId({ kind: 'week', year: leaf.year, month: leaf.month, week: leaf.week }, ns),
        ];
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i]!;
            counts.set(id, (counts.get(id) ?? 0) + 1);
            if (i > 0)
                childrenSet(ids[i - 1]!).add(id);
        }
        minYear = Math.min(minYear, leaf.year);
        maxYear = Math.max(maxYear, leaf.year);
    }
    const build = (id: string, depth: number): CalendarNode => {
        const children = [...(childrenOf.get(id) ?? [])]
            .sort()
            .map((child) => build(child, depth + 1));
        const count = children.length
            ? children.reduce((sum, child) => sum + child.count, 0)
            : (counts.get(id) ?? 0);
        const parsed = parseVirtualId(id, ns);
        return { id, name: parsed ? calendarNodeName(parsed) : '', depth, count, children };
    };
    if (!includeEmpty)
        return build(ns.rootId, -1).children;
    if (!Number.isFinite(minYear))
        return [];
    const years: CalendarNode[] = [];
    for (let year = minYear; year <= maxYear; year++) {
        const quarters: CalendarNode[] = [];
        for (let quarter = 1; quarter <= 4; quarter++) {
            const months: CalendarNode[] = [];
            const firstMonth = (quarter - 1) * 3 + 1;
            for (let month = firstMonth; month < firstMonth + 3; month++) {
                const id = virtualId({ kind: 'month', year, month }, ns);
                const weeks = [...(childrenOf.get(id) ?? [])]
                    .sort()
                    .map((child) => build(child, 3));
                const parsed = parseVirtualId(id, ns)!;
                months.push({ id, name: calendarNodeName(parsed), depth: 2, count: counts.get(id) ?? 0, children: weeks });
            }
            const qId = virtualId({ kind: 'quarter', year, quarter }, ns);
            const qParsed = parseVirtualId(qId, ns)!;
            quarters.push({
                id: qId,
                name: calendarNodeName(qParsed),
                depth: 1,
                count: months.reduce((sum, month) => sum + month.count, 0),
                children: months,
            });
        }
        const yId = virtualId({ kind: 'year', year }, ns);
        const yParsed = parseVirtualId(yId, ns)!;
        years.push({
            id: yId,
            name: calendarNodeName(yParsed),
            depth: 0,
            count: quarters.reduce((sum, quarter) => sum + quarter.count, 0),
            children: quarters,
        });
    }    return years;
}

// The sidebar calendar/todo trees bucket notes only by createdAt, deletedAt and
// (for the todo tree) todo-tag membership. A typing-derived summary commit
// changes none of those, yet it replaces the whole notes-map identity, so both
// trees were rebuilt from scratch over the whole vault on every commit while
// typing. Cache each built tree and, on a notes-map change, bail out of the
// rebuild with a cheap field-by-field scan that returns the same tree identity
// unless the structure genuinely changed; unchanged identity lets every
// downstream consumer skip re-rendering entirely.
interface VirtualTreeCacheSlot {
    notes: Record<string, NoteSummary>
    todoTags: readonly string[] | null
    children: CalendarNode[]
}
const virtualTreeSlots = new Map<string, VirtualTreeCacheSlot>()

function sameTodoTags(a: readonly string[] | null, b: readonly string[] | null): boolean {
    if (a === b)
        return true
    if (!a || !b)
        return false
    return a.length === b.length && a.every((tag, index) => tag === b[index])
}

function isTodoNote(note: NoteSummary, todoTags: readonly string[]): boolean {
    return note.tags.some((tag) => todoTags.includes(tag))
}

function virtualTreeInputsEqual(
    prev: Record<string, NoteSummary>,
    next: Record<string, NoteSummary>,
    todoTags: readonly string[] | null,
): boolean {
    if (prev === next)
        return true
    let prevSize = 0
    for (const id in prev) {
        prevSize++
        const before = prev[id]
        const after = next[id]
        if (!before || !after)
            return false
        // A store commit clones only the notes it actually touched into a
        // fresh map, so reference equality means none of the input fields can
        // have changed on this note (createdAt/deletedAt live on the object).
        if (before === after)
            continue
        if (before.createdAt !== after.createdAt || (before.deletedAt === null) !== (after.deletedAt === null))
            return false
        if (todoTags && isTodoNote(before, todoTags) !== isTodoNote(after, todoTags))
            return false
    }
    let nextSize = 0
    for (const _id in next)
        nextSize++
    return prevSize === nextSize
}

// The input-equality walk runs for every tree on every notes-map commit, so
// its verdict is memoized per map identity: React StrictMode re-renders the
// same commit twice and unrelated consumers may pass the same map again, and
// each of those calls would otherwise rescan the whole vault for nothing.
const virtualTreeVerdicts = new WeakMap<object, Map<string, { prev: Record<string, NoteSummary>; stable: boolean }>>()

export function buildVirtualTreeCached(
    notes: Record<string, NoteSummary>,
    ns: VirtualTreeNamespace,
    includeEmpty: boolean,
    todoTags: readonly string[] | null = null,
): CalendarNode[] {
    const key = `${ns.rootId}|${includeEmpty ? 'e' : 'c'}`
    const cached = virtualTreeSlots.get(key)
    const same = Boolean(cached && sameTodoTags(cached.todoTags, todoTags))
    let isStable = false
    if (same) {
        let perMap = virtualTreeVerdicts.get(notes)
        if (!perMap) {
            perMap = new Map()
            virtualTreeVerdicts.set(notes, perMap)
        }
        const verdict = perMap.get(key)
        if (verdict && verdict.prev === cached!.notes) {
            isStable = verdict.stable
        } else {
            isStable = virtualTreeInputsEqual(cached!.notes, notes, todoTags)
            perMap.set(key, { prev: cached!.notes, stable: isStable })
        }
    }
    if (same && isStable)
        return cached!.children
    const values = todoTags && todoTags.length
        ? Object.values(notes).filter((note) => isTodoNote(note, todoTags))
        : Object.values(notes)
    const children = buildVirtualTree(values, ns, includeEmpty)
    virtualTreeSlots.set(key, { notes, todoTags, children })
    return children
}

// The activity-heatmap calendar derives three whole-vault structures from each
// note (per-day updatedAt counts, first-note-per-title lookup, per-day note
// lists), and every typing pause commits a notes-map identity change, so all
// three Object.values scans used to re-run over the full vault per commit.
// Build the projection once and then repair it by diffing note references: a
// commit only replaces the edited note's object, so untouched day buckets and
// the title map keep their identities (memoized consumers skip them), and only
// the edited note's old/new day slices and title slot are recomputed.
export interface ActivityDayNote {
    id: string
    title: string
    updatedAt: number
}

export interface ActivityProjection {
    counts: Map<string, number>
    noteIdByTitle: Map<string, string>
    notesByDay: Map<string, ActivityDayNote[]>
}

interface ActivityEntry {
    ref: NoteSummary
    key: string
    title: string
}

interface ActivityProjectionSlot extends ActivityProjection {
    notes: Record<string, NoteSummary>
    byId: Map<string, ActivityEntry>
    titleCounts: Map<string, number>
}

let activityProjectionSlot: ActivityProjectionSlot | null = null

function buildActivityProjectionFresh(notes: Record<string, NoteSummary>): ActivityProjectionSlot {
    const counts = new Map<string, number>();
    const noteIdByTitle = new Map<string, string>();
    const notesByDay = new Map<string, ActivityDayNote[]>();
    const byId = new Map<string, ActivityEntry>();
    const titleCounts = new Map<string, number>();
    for (const id in notes) {
        const note = notes[id]!;
        if (note.deletedAt !== null)
            continue;
        const key = dateKey(new Date(note.updatedAt));
        counts.set(key, (counts.get(key) ?? 0) + 1);
        byId.set(id, { ref: note, key, title: note.title });
        titleCounts.set(note.title, (titleCounts.get(note.title) ?? 0) + 1);
        if (!noteIdByTitle.has(note.title))
            noteIdByTitle.set(note.title, id);
        const list = notesByDay.get(key);
        const item: ActivityDayNote = { id, title: note.title, updatedAt: note.updatedAt };
        if (list)
            list.push(item);
        else
            notesByDay.set(key, [item]);
    }
    for (const list of notesByDay.values())
        list.sort((a, b) => b.updatedAt - a.updatedAt);
    return { notes, counts, noteIdByTitle, notesByDay, byId, titleCounts };
}

// First-wins over insertion order, matching the naive rebuild: the map holds
// the first alive note per title, so a vacated slot is re-claimed by the first
// alive note in map order that still carries the title.
function claimNextNoteWithTitle(notes: Record<string, NoteSummary>, title: string): string | null {
    for (const id in notes) {
        const note = notes[id]!;
        if (note.deletedAt === null && note.title === title)
            return id;
    }
    return null;
}

function dropTitleClaim(titleCounts: Map<string, number>, titles: Map<string, string>, notes: Record<string, NoteSummary>, title: string, id: string): void {
    const rest = (titleCounts.get(title) ?? 0) - 1;
    if (rest > 0) {
        titleCounts.set(title, rest);
        if (titles.get(title) === id) {
            titles.delete(title);
            const nextOwner = claimNextNoteWithTitle(notes, title);
            if (nextOwner)
                titles.set(title, nextOwner);
        }
    } else {
        titleCounts.delete(title);
        if (titles.get(title) === id)
            titles.delete(title);
    }
}

// The naive rebuild only ever records days with at least one note, so the
// incremental must drop a key when its count reaches zero (keeps the map
// bounded and matches the reference shape exactly).
function decrementCount(counts: Map<string, number>, key: string): void {
    const next = (counts.get(key) ?? 0) - 1;
    if (next > 0)
        counts.set(key, next);
    else
        counts.delete(key);
}

function removeFromDay(byDay: Map<string, ActivityDayNote[]>, key: string, id: string): void {
    const list = byDay.get(key);
    if (!list)
        return;
    const copy = list.filter((item) => item.id !== id);
    if (copy.length > 0)
        byDay.set(key, copy);
    else
        byDay.delete(key);
}

function upsertInDay(byDay: Map<string, ActivityDayNote[]>, key: string, item: ActivityDayNote): void {
    const list = byDay.get(key);
    const copy = list ? list.map((entry) => (entry.id === item.id ? item : entry)) : [];
    if (!copy.some((entry) => entry.id === item.id))
        copy.push(item);
    copy.sort((a, b) => b.updatedAt - a.updatedAt);
    byDay.set(key, copy);
}

function updateActivityProjection(slot: ActivityProjectionSlot, next: Record<string, NoteSummary>): ActivityProjectionSlot {
    const oldCounts = slot.counts;
    const oldTitles = slot.noteIdByTitle;
    const oldByDay = slot.notesByDay;
    const byId = slot.byId;
    const titleCounts = slot.titleCounts;
    let counts = oldCounts;
    let titles = oldTitles;
    let byDay = oldByDay;
    let visited = 0;
    let tombstoned = 0;
    for (const id in next) {
        visited++;
        const note = next[id]!;
        const prev = byId.get(id);
        if (prev && prev.ref === note)
            continue;
        if (note.deletedAt !== null) {
            tombstoned++;
            if (!prev)
                continue;
            byId.delete(id);
            if (counts === oldCounts)
                counts = new Map(oldCounts);
            if (byDay === oldByDay)
                byDay = new Map(oldByDay);
            decrementCount(counts, prev.key);
            removeFromDay(byDay, prev.key, id);
            if (titles === oldTitles)
                titles = new Map(oldTitles);
            dropTitleClaim(titleCounts, titles, next, prev.title, id);
            continue;
        }
        const key = dateKey(new Date(note.updatedAt));
        if (prev && prev.key === key && prev.title === note.title && prev.ref.updatedAt === note.updatedAt) {
            // A commit that touched fields this projection does not read
            // (excerpt, tags, pin, ...): keep every output identity stable.
            // updatedAt feeds both the day key and the day-list sort, so it
            // must match down to the millisecond for the slice to be skipped.
            byId.set(id, { ref: note, key, title: note.title });
            continue;
        }
        if (!prev) {
            if (counts === oldCounts)
                counts = new Map(oldCounts);
            if (byDay === oldByDay)
                byDay = new Map(oldByDay);
            counts.set(key, (counts.get(key) ?? 0) + 1);
            upsertInDay(byDay, key, { id, title: note.title, updatedAt: note.updatedAt });
            if (titles === oldTitles)
                titles = new Map(oldTitles);
            if (titles.get(note.title) === undefined)
                titles.set(note.title, id);
            titleCounts.set(note.title, (titleCounts.get(note.title) ?? 0) + 1);
            byId.set(id, { ref: note, key, title: note.title });
            continue;
        }
        // An alive note whose projection fields actually changed.
        if (prev.key !== key) {
            if (counts === oldCounts)
                counts = new Map(oldCounts);
            decrementCount(counts, prev.key);
            counts.set(key, (counts.get(key) ?? 0) + 1);
            if (byDay === oldByDay)
                byDay = new Map(oldByDay);
            removeFromDay(byDay, prev.key, id);
            upsertInDay(byDay, key, { id, title: note.title, updatedAt: note.updatedAt });
        } else {
            // Same day: per-day count is unchanged; only the day's list needs
            // rebuilding, so the counts map keeps its identity.
            if (byDay === oldByDay)
                byDay = new Map(oldByDay);
            upsertInDay(byDay, key, { id, title: note.title, updatedAt: note.updatedAt });
        }
        if (prev.title !== note.title) {
            if (titles === oldTitles)
                titles = new Map(oldTitles);
            dropTitleClaim(titleCounts, titles, next, prev.title, id);
            if (titles.get(note.title) === undefined)
                titles.set(note.title, id);
            titleCounts.set(note.title, (titleCounts.get(note.title) ?? 0) + 1);
        }
        byId.set(id, { ref: note, key, title: note.title });
    }
    if (visited - tombstoned !== byId.size) {
        // An id vanished from the map without a tombstone: drop its stale
        // contributions (a rare path that costs one extra walk when it fires).
        if (counts === oldCounts)
            counts = new Map(oldCounts);
        if (byDay === oldByDay)
            byDay = new Map(oldByDay);
        if (titles === oldTitles)
            titles = new Map(oldTitles);
        for (const [id, entry] of [...byId]) {
            if (next[id] !== undefined)
                continue;
            byId.delete(id);
            decrementCount(counts, entry.key);
            removeFromDay(byDay, entry.key, id);
            dropTitleClaim(titleCounts, titles, next, entry.title, id);
        }
    }
    return { notes: next, counts, noteIdByTitle: titles, notesByDay: byDay, byId, titleCounts };
}

export function buildActivityProjectionCached(notes: Record<string, NoteSummary>): ActivityProjection {
    const slot = activityProjectionSlot;
    if (slot && slot.notes === notes)
        return slot;
    const next = slot ? updateActivityProjection(slot, notes) : buildActivityProjectionFresh(notes);
    activityProjectionSlot = next;
    return next;
}
