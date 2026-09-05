import type { JSX } from 'react';
import { BarChart3, CalendarCheck, CalendarDays, CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { t } from '../../lib/i18n';
import { IconButton } from '../primitives';
import { Tooltip } from '../overlay';

interface CalendarHeaderProps {
    view: 'month' | 'weeks' | 'year';
    onViewChange: (view: 'month' | 'weeks' | 'year') => void;
    isCurrentMonth: boolean;
    isCurrentYear: boolean;
    shiftMonth: (delta: number) => void;
    shiftYear: (delta: number) => void;
    jumpToCurrentMonth: () => void;
    jumpToCurrentYear: () => void;
}

export function CalendarHeader({ view, onViewChange, isCurrentMonth, isCurrentYear, shiftMonth, shiftYear, jumpToCurrentMonth, jumpToCurrentYear }: CalendarHeaderProps): JSX.Element {
    return (<div className="mt-1 flex items-center justify-between gap-1 px-0.5">
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
                <button type="button" aria-pressed={view === 'month'} onClick={() => onViewChange('month')} className="flex h-6 min-w-0 items-center gap-0.5 whitespace-nowrap px-1.5 text-[length:var(--text-10\.5)] font-medium transition-colors aria-pressed:bg-[var(--accent-soft)] aria-pressed:text-[var(--accent)]">
                    <CalendarDays size={10} className="shrink-0"/><span className="truncate">{t("sidebar.calendar_month_view")}</span>
                </button>
                <button type="button" aria-pressed={view === 'weeks'} onClick={() => onViewChange('weeks')} className="flex h-6 min-w-0 items-center gap-0.5 whitespace-nowrap border-l border-[var(--border-default)] px-1.5 text-[length:var(--text-10\.5)] font-medium transition-colors aria-pressed:bg-[var(--accent-soft)] aria-pressed:text-[var(--accent)]">
                    <BarChart3 size={10} className="shrink-0"/><span className="truncate">{t("sidebar.calendar_week_view")}</span>
                </button>
                <button type="button" aria-pressed={view === 'year'} onClick={() => onViewChange('year')} className="flex h-6 min-w-0 items-center gap-0.5 whitespace-nowrap border-l border-[var(--border-default)] px-1.5 text-[length:var(--text-10\.5)] font-medium transition-colors aria-pressed:bg-[var(--accent-soft)] aria-pressed:text-[var(--accent)]">
                    <CalendarRange size={10} className="shrink-0"/><span className="truncate">{t("sidebar.calendar_year_view")}</span>
                </button>
            </div>
        </div>);
}
