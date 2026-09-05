import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Kbd } from '../primitives';
import { t } from '../../lib/i18n';
import { getVisibleViewport } from '../../lib/viewport';
import { Z_INDEX } from '../../lib/z-index';
import { useEscape, useClickOutside } from './hooks';



export interface MenuItem {
    id: string;
    label: string;
    icon?: ReactNode;
    combo?: string;
    tone?: 'default' | 'danger';
    disabled?: boolean;
    checked?: boolean;
    onSelect?: () => void;
    separatorBefore?: boolean;
    submenu?: ReactNode | ((props: { closeMenu: () => void }) => ReactNode);
}


export function Menu({ anchor, open, onClose, items, align = 'start', width = 208, label = t("overlay.menu"), zIndex, }: {
    anchor: RefObject<HTMLElement | null> | {
        x: number;
        y: number;
    };
    open: boolean;
    onClose: () => void;
    items: MenuItem[];
    align?: 'start' | 'end';
    width?: number;
    label?: string;
    zIndex?: number;
}) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{
        top: number;
        left: number;
        origin: string;
    }>({
        top: 0,
        left: 0,
        origin: 'top left',
    });
    const [cursor, setCursor] = useState(0);
    const [activeSubmenuId, setActiveSubmenuId] = useState<string | null>(null);
    const [submenuAnchorRect, setSubmenuAnchorRect] = useState<DOMRect | null>(null);
    const [submenuPos, setSubmenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
    const submenuRef = useRef<HTMLDivElement>(null);
    const anchorRef = 'current' in anchor ? anchor : null;
    const point = 'current' in anchor ? null : anchor;
    const menuWidth = Math.min(width, Math.max(0, innerWidth - 16));

    useEffect(() => {
        if (!open) {
            setActiveSubmenuId(null);
            setSubmenuAnchorRect(null);
        }
    }, [open]);

    useLayoutEffect(() => {
        if (!open)
            return;
        const margin = 8;
        const itemHeight = innerWidth < 768 ? 40 : 30;
        const height = Math.min(items.length * itemHeight + 12, 420);
        let top: number;
        let left: number;
        if (point) {
            top = point.y;
            left = point.x;
        }
        else {
            const rect = anchorRef?.current?.getBoundingClientRect();
            if (!rect)
                return;
            top = rect.bottom + 5;
            left = align === 'end' ? rect.right - menuWidth : rect.left;
        }
        const viewport = getVisibleViewport();
        const flipUp = top + height > viewport.bottom - margin;
        if (flipUp)
            top = Math.max(viewport.top + margin, (point ? point.y : (anchorRef?.current?.getBoundingClientRect().top ?? top)) - height - 5);
        left = Math.min(Math.max(viewport.left + margin, left), viewport.right - menuWidth - margin);
        setPosition({ top, left, origin: `${flipUp ? 'bottom' : 'top'} ${align === 'end' ? 'right' : 'left'}` });
        setCursor(items.findIndex((i) => !i.disabled));
    }, [open, items, align, menuWidth, anchorRef, point]);

    useLayoutEffect(() => {
        if (!activeSubmenuId || !submenuAnchorRect)
            return;
        const margin = 8;
        const viewport = getVisibleViewport();
        const parentRect = menuRef.current?.getBoundingClientRect();
        const itemRect = submenuAnchorRect;
        const submenuWidth = submenuRef.current?.offsetWidth || 260;
        const submenuHeight = submenuRef.current?.offsetHeight || 320;

        const preferredRight = (parentRect ? parentRect.right : itemRect.right) - 2;
        const preferredLeft = (parentRect ? parentRect.left : itemRect.left) - submenuWidth + 2;

        let left = preferredRight;
        if (left + submenuWidth > viewport.right - margin) {
            left = preferredLeft >= viewport.left + margin ? preferredLeft : Math.max(viewport.left + margin, viewport.right - submenuWidth - margin);
        }

        let top = itemRect.top - 4;
        if (top + submenuHeight > viewport.bottom - margin) {
            top = Math.max(viewport.top + margin, viewport.bottom - submenuHeight - margin);
        }
        if (top < viewport.top + margin) {
            top = viewport.top + margin;
        }

        setSubmenuPos({ top, left });
    }, [activeSubmenuId, submenuAnchorRect]);

    useEscape(open, onClose);
    useClickOutside(anchorRef ? [menuRef, anchorRef, submenuRef] : [menuRef, submenuRef], open, onClose);
    useEffect(() => {
        if (!open)
            return;
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        return () => {
            if (previousFocus?.isConnected)
                previousFocus.focus({ preventScroll: true });
        };
    }, [open]);
    useEffect(() => {
        if (!open)
            return;
        if (cursor < 0) {
            menuRef.current?.focus({ preventScroll: true });
            return;
        }
        menuRef.current
            ?.querySelector<HTMLElement>(`[data-menu-index="${cursor}"]`)
            ?.focus({ preventScroll: true });
    }, [open, cursor]);
    useEffect(() => {
        if (!open)
            return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const step = event.key === 'ArrowDown' ? 1 : -1;
                setCursor((current) => {
                    let next = current;
                    for (let i = 0; i < items.length; i++) {
                        next = (next + step + items.length) % items.length;
                        if (!items[next]?.disabled)
                            return next;
                    }
                    return current;
                });
            }
            else if (event.key === 'ArrowRight') {
                const item = items[cursor];
                if (item?.submenu) {
                    event.preventDefault();
                    const btn = menuRef.current?.querySelector<HTMLElement>(`[data-menu-index="${cursor}"]`);
                    if (btn) {
                        setActiveSubmenuId(item.id);
                        setSubmenuAnchorRect(btn.getBoundingClientRect());
                        queueMicrotask(() => {
                            submenuRef.current?.querySelector<HTMLElement>('input, button')?.focus();
                        });
                    }
                }
            }
            else if (event.key === 'Home' || event.key === 'End') {
                event.preventDefault();
                const indexes = items
                    .map((item, index) => item.disabled ? -1 : index)
                    .filter((index) => index >= 0);
                setCursor(event.key === 'Home' ? (indexes[0] ?? -1) : (indexes[indexes.length - 1] ?? -1));
            }
            else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                const item = items[cursor];
                if (item && !item.disabled) {
                    if (item.submenu) {
                        const btn = menuRef.current?.querySelector<HTMLElement>(`[data-menu-index="${cursor}"]`);
                        if (btn) {
                            setActiveSubmenuId((curr) => curr === item.id ? null : item.id);
                            setSubmenuAnchorRect(btn.getBoundingClientRect());
                        }
                        return;
                    }
                    item.onSelect?.();
                    onClose();
                }
            }
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
    }, [open, items, cursor, onClose]);
    if (!open)
        return null;
    const activeItem = items.find((i) => i.id === activeSubmenuId);
    return (<>
      {createPortal(<div ref={menuRef} role="menu" aria-label={label} tabIndex={-1} className="anim-pop fixed z-[var(--z-pop)] max-h-[420px] overflow-y-auto rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-1 shadow-[var(--shadow-pop)] outline-none" style={{ top: position.top, left: position.left, width: menuWidth, transformOrigin: position.origin, zIndex }}>
        {items.map((item, index) => (<div key={item.id}>
            {item.separatorBefore && <div role="separator" className="my-1 h-px bg-[var(--border-subtle)]"/>}
            <button type="button" role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'} aria-checked={item.checked === undefined ? undefined : item.checked} tabIndex={index === cursor ? 0 : -1} data-menu-index={index} disabled={item.disabled} onMouseEnter={(e) => {
                  if (!item.disabled) {
                      setCursor(index);
                      if (item.submenu) {
                          setActiveSubmenuId(item.id);
                          setSubmenuAnchorRect(e.currentTarget.getBoundingClientRect());
                      } else {
                          setActiveSubmenuId(null);
                          setSubmenuAnchorRect(null);
                      }
                  }
              }} onClick={(e) => {
                  if (item.submenu) {
                      setActiveSubmenuId((curr) => curr === item.id ? null : item.id);
                      setSubmenuAnchorRect(e.currentTarget.getBoundingClientRect());
                      return;
                  }
                  item.onSelect?.();
                  onClose();
              }} className={cn('flex h-10 w-full items-center gap-2.5 rounded-[var(--r-sm)] px-2 text-left text-[length:var(--text-12\.5)] md:h-[30px]', 'transition-colors duration-[80ms] disabled:pointer-events-none disabled:opacity-40', index === cursor ? 'bg-[var(--bg-hover)]' : '', item.tone === 'danger'
                  ? 'text-[var(--danger)]'
                  : index === cursor
                      ? 'text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)]')}>
              {item.icon && (<span className="flex size-4 shrink-0 items-center justify-center opacity-85">
                  {item.icon}
                </span>)}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.checked && <span className="text-[var(--accent)]">✓</span>}
              {item.submenu ? (
                <ChevronRight size={13} className="ml-auto shrink-0 opacity-70" />
              ) : (
                item.combo && <Kbd combo={item.combo}/>
              )}
            </button>
          </div>))}
      </div>, document.body)}
      {activeItem && activeItem.submenu && createPortal(
        <div
          ref={submenuRef}
          tabIndex={-1}
          className="anim-pop fixed outline-none"
          style={{
            top: submenuPos.top,
            left: submenuPos.left,
            zIndex: (zIndex ?? Z_INDEX.menu) + 10,
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setActiveSubmenuId(null);
              menuRef.current?.querySelector<HTMLElement>(`[data-menu-index="${cursor}"]`)?.focus();
            }
          }}
        >
          {typeof activeItem.submenu === 'function'
            ? activeItem.submenu({ closeMenu: onClose })
            : activeItem.submenu}
        </div>,
        document.body
      )}
    </>);
}


export function useContextMenu() {
    const [point, setPoint] = useState<{
        x: number;
        y: number;
    } | null>(null);
    return {
        point,
        close: () => setPoint(null),
        onContextMenu: (event: React.MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
            setPoint({ x: event.clientX, y: event.clientY });
        },
    };
}
