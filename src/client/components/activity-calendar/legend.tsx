import type { JSX } from 'react';
import { t } from '../../lib/i18n';
import { HEAT_PERCENTS } from './strip';

export function HeatLegend(): JSX.Element {
    return (<div className="mt-1.5 flex items-center gap-1 px-1">
        <span className="text-[length:var(--text-9)] text-[var(--text-quaternary)]">{t("sidebar.calendar_less")}</span>
        {[0, 1, 2, 3, 4].map((level) => (<span key={level} aria-hidden="true" className="size-[9px] rounded-[var(--r-2)]" style={{ backgroundColor: level === 0 ? 'var(--bg-inset)' : `color-mix(in oklab, var(--accent) ${HEAT_PERCENTS[level]}%, transparent)` }}/>))}
        <span className="text-[length:var(--text-9)] text-[var(--text-quaternary)]">{t("sidebar.calendar_more")}</span>
    </div>);
}