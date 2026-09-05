import { useEffect, useRef, useState, type ComponentType, type RefObject } from 'react';
import {
    ListTree,
    Heading1,
    Heading2,
    Heading3,
    Heading4,
    Heading5,
    Heading6,
    type LucideProps,
} from 'lucide-react';
import type { Heading } from '../../lib/markdown/renderer';
import { cn } from '../../lib/cn';
import { Tooltip } from '../../components/overlay';
import { t } from "../../lib/i18n";

const HEADING_ICONS: Record<number, ComponentType<LucideProps>> = {
    1: Heading1,
    2: Heading2,
    3: Heading3,
    4: Heading4,
    5: Heading5,
    6: Heading6,
};

export function getHeadingIcon(level: number): ComponentType<LucideProps> {
    return HEADING_ICONS[level] ?? Heading6;
}

export function getHeadingTypography(level: number, isActive: boolean) {
    switch (level) {
        case 1:
            return {
                fontSize: 'text-[13px]',
                fontWeight: 'font-semibold',
                textColor: isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]',
                iconSize: 12.5,
                iconColor: isActive ? 'text-[var(--accent)] opacity-100' : 'text-[var(--text-tertiary)] opacity-80',
                paddingY: 'py-1',
            };
        case 2:
            return {
                fontSize: 'text-[12px]',
                fontWeight: isActive ? 'font-semibold' : 'font-medium',
                textColor: isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]/85',
                iconSize: 11.5,
                iconColor: isActive ? 'text-[var(--accent)] opacity-100' : 'text-[var(--text-quaternary)] opacity-80',
                paddingY: 'py-1',
            };
        case 3:
            return {
                fontSize: 'text-[11.5px]',
                fontWeight: isActive ? 'font-medium' : 'font-normal',
                textColor: isActive ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]',
                iconSize: 11,
                iconColor: isActive ? 'text-[var(--accent)] opacity-100' : 'text-[var(--text-quaternary)] opacity-70',
                paddingY: 'py-0.5',
            };
        case 4:
            return {
                fontSize: 'text-[11px]',
                fontWeight: isActive ? 'font-medium' : 'font-normal',
                textColor: isActive ? 'text-[var(--accent)]' : 'text-[var(--text-quaternary)]',
                iconSize: 10.5,
                iconColor: isActive ? 'text-[var(--accent)] opacity-100' : 'text-[var(--text-quaternary)] opacity-60',
                paddingY: 'py-0.5',
            };
        default:
            return {
                fontSize: 'text-[10.5px]',
                fontWeight: isActive ? 'font-medium' : 'font-normal',
                textColor: isActive ? 'text-[var(--accent)]' : 'text-[var(--text-quaternary)]',
                iconSize: 10,
                iconColor: isActive ? 'text-[var(--accent)] opacity-100' : 'text-[var(--text-quaternary)] opacity-60',
                paddingY: 'py-0.5',
            };
    }
}

export function Outline({ headings, onSelect, scrollerRef, className, }: {
    headings: Heading[];
    onSelect: (heading: Heading) => void;
    scrollerRef?: RefObject<HTMLElement | null>;
    className?: string;
}) {
    const [active, setActive] = useState<string | null>(null);
    const rafRef = useRef(0);
    useEffect(() => {
        const scroller = scrollerRef?.current ?? document.querySelector<HTMLElement>('[data-preview-scroller]');
        if (!scroller || headings.length === 0)
            return;
        const onScroll = () => {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(() => {
                const top = scroller.scrollTop + 60;
                let current: string | null = headings[0]?.slug ?? null;
                for (const heading of headings) {
                    const el = scroller.querySelector<HTMLElement>(`#${CSS.escape(heading.slug)}`);
                    if (!el)
                        continue;
                    if (el.offsetTop <= top)
                        current = heading.slug;
                    else
                        break;
                }
                setActive(current);
            });
        };
        onScroll();
        scroller.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            scroller.removeEventListener('scroll', onScroll);
            cancelAnimationFrame(rafRef.current);
        };
    }, [headings, scrollerRef]);
    if (headings.length === 0)
        return null;
    const minLevel = Math.min(...headings.map((h) => h.level));
    return (<nav className={cn('sticky top-0 max-h-full w-[168px] shrink-0 self-start overflow-y-auto py-5 pr-3', className)} aria-label={t("common.outline")}>
      <div className="mb-2 flex items-center gap-1.5 px-2 text-[10.5px] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]">
        <ListTree size={11}/>{t("common.outline")}</div>
      <ul className="space-y-px">
        {headings.map((heading, index) => {
            const isActive = heading.slug === active;
            const typography = getHeadingTypography(heading.level, isActive);
            const HeadingIcon = getHeadingIcon(heading.level);
            const relativeLevel = Math.min(Math.max(0, heading.level - minLevel), 4);
            const isFirst = index === 0;
            const prevHeading = index > 0 ? headings[index - 1] : undefined;
            const isH1 = heading.level === 1;
            const isH2 = heading.level === 2;
            const marginTopClass = !isFirst && isH1
                ? 'mt-1.5'
                : (!isFirst && isH2 && prevHeading && prevHeading.level !== 1)
                    ? 'mt-0.5'
                    : '';
            return (<li key={`${heading.slug}-${index}`} className={marginTopClass}>
              <Tooltip label={heading.text || t("preview.untitled")} side="left">
                <button type="button" aria-current={isActive ? 'location' : undefined} data-heading-level={heading.level} onClick={() => onSelect(heading)} className={cn('group relative flex w-full items-center gap-1.5 rounded-[var(--r-sm)] pr-1.5 text-left leading-snug', 'transition-colors duration-[var(--dur-fast)]', typography.fontSize, typography.fontWeight, typography.textColor, typography.paddingY, isActive
                    ? 'bg-[var(--accent-soft)]'
                    : 'hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]')} style={{ paddingLeft: 8 + relativeLevel * 10 }}>
                  {isActive && (<span aria-hidden="true" className="absolute top-1/2 left-0.5 h-3.5 w-[2.5px] -translate-y-1/2 rounded-full bg-[var(--accent)]"/>)}
                  <HeadingIcon size={typography.iconSize} aria-hidden="true" className={cn('shrink-0 transition-opacity duration-[var(--dur-fast)]', typography.iconColor, !isActive && 'group-hover:text-[var(--text-secondary)] group-hover:opacity-100')}/>
                  <span className="min-w-0 flex-1 truncate">
                    {heading.text || t("preview.untitled")}
                  </span>
                </button>
              </Tooltip>
            </li>);
        })}
      </ul>
    </nav>);
}
