import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { t } from '../../lib/i18n';
import { Tooltip } from '../../components/overlay';

export function TreeExpandButton({ expanded, hasChildren, onToggle }: {
    expanded: boolean;
    hasChildren: boolean;
    onToggle: () => void;
}) {
    const label = expanded ? t("sidebar.collapse") : t("sidebar.expand");
    return (
        <Tooltip label={label} side="right">
            <button type="button" disabled={!hasChildren} aria-hidden={!hasChildren || undefined} tabIndex={hasChildren ? undefined : -1} onClick={(e) => {
                e.stopPropagation();
                onToggle();
            }} aria-label={label} className={cn('flex size-8 shrink-0 items-center justify-center rounded text-[var(--text-quaternary)] md:size-4', 'transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)]', expanded && 'rotate-90', !hasChildren && 'invisible')}>
                <ChevronRight size={12}/>
            </button>
        </Tooltip>
    );
}
