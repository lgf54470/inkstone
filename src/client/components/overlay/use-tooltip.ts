import { useCallback, useEffect, useRef } from 'react';

// TooltipPosition/TooltipSide live here (not in tooltip.tsx) because tooltip.tsx
// already imports the runtime hooks from this module; defining the position
// shapes here keeps the pair free of an import cycle.
export type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipPosition {
  top: number;
  left: number;
  side: TooltipSide;
}

export function useTooltipAnchor(delay: number, setPosition: React.Dispatch<React.SetStateAction<TooltipPosition | null>>, setRect: React.Dispatch<React.SetStateAction<DOMRect | null>>): {
  holderRef: React.RefObject<HTMLSpanElement | null>;
  measureAnchor: () => DOMRect | null;
  show: () => void;
  hide: () => void;
} {
  const holderRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<number>(0);
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
  return { holderRef, measureAnchor, show, hide };
}

export function useTooltipReposition(rect: DOMRect | null, measureAnchor: () => DOMRect | null, setRect: React.Dispatch<React.SetStateAction<DOMRect | null>>, setPosition: React.Dispatch<React.SetStateAction<TooltipPosition | null>>): void {
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
  }, [measureAnchor, rect, setRect, setPosition]);
}