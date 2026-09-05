import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Kbd } from '../primitives';
import { getVisibleViewport } from '../../lib/viewport';


export function Tooltip({ label, combo, children, side = 'bottom', delay = 420, }: {
    label: ReactNode;
    combo?: string;
    children: ReactNode;
    side?: 'top' | 'bottom' | 'left' | 'right';
    delay?: number;
}) {
    const holderRef = useRef<HTMLSpanElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const timerRef = useRef<number>(0);
    const [rect, setRect] = useState<DOMRect | null>(null);
    const [position, setPosition] = useState<TooltipPosition | null>(null);
    const measureAnchor = useCallback(() => {
        const anchor = holderRef.current?.firstElementChild;
        if (!(anchor instanceof Element))
            return null;
        const next = anchor.getBoundingClientRect();
        return next.width || next.height ? next : null;
    }, []);
    const show = () => {
        window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
            const next = measureAnchor();
            if (next) {
                setPosition(null);
                setRect(next);
            }
        }, delay);
    };
    const hide = () => {
        window.clearTimeout(timerRef.current);
        setPosition(null);
        setRect(null);
    };
    useEffect(() => () => window.clearTimeout(timerRef.current), []);
    useLayoutEffect(() => {
        const tooltip = tooltipRef.current;
        if (!rect || !tooltip)
            return;
        setPosition(placeTooltip(rect, tooltip.getBoundingClientRect(), side));
    }, [combo, label, rect, side]);
    useEffect(() => {
        if (!rect)
            return;
        const update = () => {
            const next = measureAnchor();
            if (next)
                setRect(next);
            else {
                setPosition(null);
                setRect(null);
            }
        };
        window.addEventListener('resize', update);
        window.addEventListener('scroll', update, true);
        return () => {
            window.removeEventListener('resize', update);
            window.removeEventListener('scroll', update, true);
        };
    }, [measureAnchor, rect]);
    const style: React.CSSProperties = position
        ? { top: position.top, left: position.left, visibility: 'visible' }
        : { top: 0, left: 0, visibility: 'hidden' };
    return (<>
      <span ref={holderRef} onMouseEnter={() => {
            if (typeof window.matchMedia !== 'function' || window.matchMedia('(hover: hover) and (pointer: fine)').matches)
                show();
        }} onMouseLeave={hide} onFocus={(event) => {
            if ((event.target as HTMLElement).matches(':focus-visible'))
                show();
        }} onBlur={hide} className="contents">
        {children}
      </span>
      {rect &&
            createPortal(<div ref={tooltipRef} role="tooltip" data-side={position?.side} className="anim-fade pointer-events-none fixed z-[var(--z-tooltip)] flex max-w-[calc(100vw-16px)] items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--border-default)] bg-[var(--bg-overlay)] px-2 py-1 text-[length:var(--text-11\.5)] whitespace-nowrap text-[var(--text-secondary)] shadow-[var(--shadow-pop)]" style={style}>
            {label}
            {combo && <Kbd combo={combo}/>}
          </div>, document.body)}
    </>);
}


export type TooltipSide = 'top' | 'bottom' | 'left' | 'right';


export interface TooltipPosition {
    top: number;
    left: number;
    side: TooltipSide;
}


export function placeTooltip(anchor: DOMRect, tooltip: DOMRect, preferred: TooltipSide): TooltipPosition {
    const gap = 7;
    const padding = 8;
    const viewport = getVisibleViewport();
    const viewportLeft = viewport.left;
    const viewportTop = viewport.top;
    const viewportRight = viewport.right;
    const viewportBottom = viewport.bottom;
    let side = preferred;
    if (preferred === 'bottom' && anchor.bottom + gap + tooltip.height > viewportBottom - padding &&
        (anchor.top - gap - tooltip.height >= viewportTop + padding || anchor.top - viewportTop > viewportBottom - anchor.bottom)) {
        side = 'top';
    }
    else if (preferred === 'top' && anchor.top - gap - tooltip.height < viewportTop + padding &&
        (anchor.bottom + gap + tooltip.height <= viewportBottom - padding || viewportBottom - anchor.bottom > anchor.top - viewportTop)) {
        side = 'bottom';
    }
    else if (preferred === 'right' && anchor.right + gap + tooltip.width > viewportRight - padding &&
        (anchor.left - gap - tooltip.width >= viewportLeft + padding || anchor.left - viewportLeft > viewportRight - anchor.right)) {
        side = 'left';
    }
    else if (preferred === 'left' && anchor.left - gap - tooltip.width < viewportLeft + padding &&
        (anchor.right + gap + tooltip.width <= viewportRight - padding || viewportRight - anchor.right > anchor.left - viewportLeft)) {
        side = 'right';
    }
    const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));
    if (side === 'top' || side === 'bottom') {
        return {
            side,
            top: side === 'bottom' ? anchor.bottom + gap : anchor.top - gap - tooltip.height,
            left: clamp(anchor.left + anchor.width / 2 - tooltip.width / 2, viewportLeft + padding, viewportRight - tooltip.width - padding),
        };
    }
    return {
        side,
        top: clamp(anchor.top + anchor.height / 2 - tooltip.height / 2, viewportTop + padding, viewportBottom - tooltip.height - padding),
        left: side === 'right' ? anchor.right + gap : anchor.left - gap - tooltip.width,
    };
}
