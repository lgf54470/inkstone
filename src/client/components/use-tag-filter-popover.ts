import { useEffect } from 'react';
import { getVisibleViewport } from '../lib/viewport';

export function usePopoverPosition(open: boolean, align: 'start' | 'end', anchor: React.RefObject<HTMLButtonElement | null>, visibleCount: number, setPosition: React.Dispatch<React.SetStateAction<{ top: number; left: number; origin: string }>>): void {
  useEffect(() => {
    if (!open)
      return;
    const margin = 8;
    const width = 236;
    const height = Math.min(392, Math.max(120, visibleCount * 30 + 96));
    const rect = anchor.current?.getBoundingClientRect();
    if (!rect)
      return;
    let top = rect.bottom + 5;
    let left = align === 'end' ? rect.right - width : rect.left;
    const viewport = getVisibleViewport();
    const flipUp = top + height > viewport.bottom - margin;
    if (flipUp)
      top = Math.max(viewport.top + margin, rect.top - height - 5);
    left = Math.min(Math.max(viewport.left + margin, left), viewport.right - width - margin);
    setPosition({ top, left, origin: `${flipUp ? 'bottom' : 'top'} ${align === 'end' ? 'right' : 'left'}` });
  }, [open, align, visibleCount, anchor, setPosition]);
}

export function usePopoverFocus(open: boolean, inputRef: React.RefObject<HTMLInputElement | null>, setQuery: React.Dispatch<React.SetStateAction<string>>): void {
  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, inputRef, setQuery]);
}

export function useHighlightScroll(query: string, highlightedRef: React.RefObject<HTMLButtonElement | null>): void {
  useEffect(() => {
    highlightedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [query, highlightedRef]);
}