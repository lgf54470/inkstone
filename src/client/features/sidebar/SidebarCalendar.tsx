import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronDown } from 'lucide-react';
import type { DateRangeFilter } from '@shared/types';
import { cn } from '../../lib/cn';
import { t, useLocale } from '../../lib/i18n';
import { useNotes } from '../../store/notes';
import { useUi } from '../../store/ui';
import { ActivityCalendarMemo } from '../../components/activity-calendar';
import { buildActivityProjectionCached } from '../../lib/calendar-tree';
import { CalendarView, loadCalendarPersist, saveCalendarPersist } from './calendar-persist';
import { useGapIndicatorStore } from '../list/use-gap-indicator';
import { useYearGridColumns } from '../../lib/year-grid-prefs';

export function SidebarCalendar() {
    const locale = useLocale();
    const notes = useNotes((s) => s.notes);
    const openNote = useNotes((s) => s.openNote);
    const createNote = useNotes((s) => s.createNote);
    const toast = useUi((s) => s.toast);
    const dateFilter = useUi((s) => s.dateFilter);
    const calendarJump = useUi((s) => s.calendarJump);
    const yearGridColumns = useYearGridColumns();
    const [persisted] = useState(loadCalendarPersist);
    const [collapsed, setCollapsed] = useState(persisted.collapsed);
    const [view, setView] = useState<CalendarView>(persisted.view);
    const [cursor, setCursor] = useState(() => {
        const now = new Date();
        return { year: now.getFullYear(), month: now.getMonth() };
    });
    const now = useMemo(() => new Date(), []);
    const isCurrentMonth = cursor.year === now.getFullYear() && cursor.month === now.getMonth();
    const showTodayChip = view === 'year' ? cursor.year === now.getFullYear() : isCurrentMonth;
    useEffect(() => {
        saveCalendarPersist({ collapsed, view });
    }, [collapsed, view]);

    useEffect(() => {
        if (!calendarJump)
            return;
        setView('month');
        setCursor({ year: calendarJump.year, month: calendarJump.month });
    }, [calendarJump]);

    const weekStart = locale === 'zh-CN' ? 1 : 0;
    const diaryTitle = useCallback((key: string) => t("sidebar.diary_title_value0", { value0: key }), []);

    // Single cached projection replaces the three whole-vault Object.values
    // scans: a typing commit only re-derives the edited note's day slice and
    // title slot, leaving every untouched output identity stable.
    const projection = useMemo(() => buildActivityProjectionCached(notes), [notes]);
    const counts = projection.counts;
    const noteIdByTitle = projection.noteIdByTitle;
    const notesByDay = projection.notesByDay;
    const getDiaryId = useCallback((key: string) => noteIdByTitle.get(diaryTitle(key)) ?? null, [diaryTitle, noteIdByTitle]);
    const latestEditKey = useGapIndicatorStore((s) => s.latestEditKey);

    const monthTitle = useMemo(() => new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'long',
    }).format(new Date(cursor.year, cursor.month, 1)), [cursor, locale]);

    const headerTitle = view === 'year' ? String(cursor.year) : monthTitle;

    const applyDateFilter = useCallback((range: DateRangeFilter | null) => {
        useUi.getState().setRelativeFilter(null);
        useUi.getState().setDateFilter(range);
    }, []);
    const handleDayClick = useCallback(async (key: string, diaryId: string | null) => {
        const current = useUi.getState().dateFilter;
        const isSameSingleDay = current !== null && current.start === key && current.end === key;
        applyDateFilter(isSameSingleDay ? null : { start: key, end: key });
        if (diaryId) {
            openNote(diaryId);
            toast({ title: t("sidebar.calendar_diary_opened_value0", { value0: key }), tone: 'success' });
            return;
        }
        const [year, month, day] = key.split('-').map(Number);
        const time = new Date(year, month - 1, day);
        time.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60), Math.floor(Math.random() * 60), 0);
        const stamp = `${key} ${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}:${String(time.getSeconds()).padStart(2, '0')}`;
        const title = diaryTitle(key);
        const tag = t("sidebar.diary_tag");
        const content = `---
title: "${title}"
createdAt: ${stamp}
tags:
  - ${tag}
aliases:
  - ''
---

`;
        const id = await createNote({ title, content, open: true });
        if (id)
            toast({ title: t("sidebar.calendar_diary_created_value0", { value0: key }), tone: 'success' });
    }, [applyDateFilter, createNote, diaryTitle, openNote, toast]);

    // Every ActivityCalendar prop is stabilized so the shallow memo only skips
    // the subtree when the projection identities genuinely didn't change.
    const onDayClick = useCallback((key: string, diaryId: string | null) => { void handleDayClick(key, diaryId); }, [handleDayClick]);
    const onDaySelect = useCallback((key: string) => applyDateFilter({ start: key, end: key }), [applyDateFilter]);
    const onRangeSelect = useCallback((start: string, end: string) => applyDateFilter({ start, end }), [applyDateFilter]);
    const onGapDayClick = useCallback((key: string) => {
        const relative = useUi.getState().relativeFilter;
        if (relative)
            useUi.getState().setRelativeFilter({ days: relative.days, direction: 'edit' });
        else
            applyDateFilter({ start: key, end: key });
    }, [applyDateFilter]);
    const onNoteClick = useCallback((noteId: string) => { openNote(noteId); }, [openNote]);

    return (<section aria-label={t("sidebar.calendar_title")} className="mb-2.5">
        <div className="flex items-center gap-1 px-0.5">
            <button type="button" aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)} className="flex min-w-0 items-center gap-1 rounded-[var(--r-sm)] px-1 py-0.5 text-left transition-colors hover:bg-[var(--bg-hover)]">
                <CalendarDays size={12} className="shrink-0 text-[var(--text-quaternary)]"/>
                <span className="truncate text-[11px] font-semibold text-[var(--text-secondary)]">{headerTitle}</span>
                {showTodayChip && (<span className="shrink-0 rounded-full bg-[var(--accent-soft)] px-1.5 py-px text-[9px] font-medium text-[var(--accent)]">{t("sidebar.calendar_today")}</span>)}
                <ChevronDown size={11} className={cn('shrink-0 text-[var(--text-quaternary)] transition-transform duration-[var(--dur-fast)]', collapsed && '-rotate-90')}/>
            </button>
        </div>
        {!collapsed && (<ActivityCalendarMemo counts={counts} notesByDay={notesByDay} getDiaryId={getDiaryId} locale={locale} weekStart={weekStart} today={now} selectedRange={dateFilter} latestEditKey={latestEditKey} view={view} onViewChange={setView} cursor={cursor} onCursorChange={setCursor} columnsPreference={yearGridColumns} jumpFlash={calendarJump?.nonce ?? 0} onDayClick={onDayClick} onDaySelect={onDaySelect} onRangeSelect={onRangeSelect} onGapDayClick={onGapDayClick} onNoteClick={onNoteClick}/>)}
    </section>);
}