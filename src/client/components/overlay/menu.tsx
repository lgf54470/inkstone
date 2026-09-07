import { useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Kbd } from '../primitives';
import { t } from '../../lib/i18n';
import { Z_INDEX } from '../../lib/z-index';
import { useEscape, useClickOutside } from './hooks';
import { useCursorFocus, useFocusRestore, useMenuActionKeys, useMenuCursorKeys, useMenuPosition, useMenuReset, useSubmenuPosition, type MenuItem } from './use-menu';

interface MenuItemRowProps {
  item: MenuItem;
  index: number;
  cursor: number;
  onHover: (index: number, item: MenuItem, element: HTMLElement) => void;
  onClick: (item: MenuItem, element: HTMLElement) => void;
}

function MenuItemRow({ item, index, cursor, onHover, onClick }: MenuItemRowProps) {
  return (<div key={item.id}>
    {item.separatorBefore && <div role='separator' className='my-1 h-px bg-[var(--border-subtle)]'/>}
    <button type='button' role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'} aria-checked={item.checked === undefined ? undefined : item.checked} tabIndex={index === cursor ? 0 : -1} data-menu-index={index} disabled={item.disabled} onMouseEnter={(e) => {
      if (!item.disabled)
        onHover(index, item, e.currentTarget);
    }}        onClick={(e) => onClick(item, e.currentTarget)} className={cn('flex h-10 w-full items-center gap-2.5 rounded-[var(--r-sm)] px-2 text-left text-[length:var(--text-12\\.5)] md:h-[30px]', 'transition-colors duration-[var(--dur-xs)] disabled:pointer-events-none disabled:opacity-40', index === cursor ? 'bg-[var(--bg-hover)]' : '', item.tone === 'danger'
      ? 'text-[var(--danger)]'
      : index === cursor
        ? 'text-[var(--text-primary)]'
        : 'text-[var(--text-secondary)]')}>
      {item.icon && (<span className='flex size-4 shrink-0 items-center justify-center opacity-85'>
        {item.icon}
      </span>)}
      <span className='min-w-0 flex-1 truncate'>{item.label}</span>
      {item.checked && <span className='text-[var(--accent)]'>✓</span>}
      {item.submenu ? (
        <ChevronRight size={13} className='ml-auto shrink-0 opacity-70' />
      ) : (
        item.combo && <Kbd combo={item.combo}/>
      )}
    </button>
  </div>);
}

export function Menu({ anchor, open, onClose, items, align = 'start', width = 208, label = t('overlay.menu'), zIndex, }: {
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
  const submenuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; origin: string }>({ top: 0, left: 0, origin: 'top left' });
  const [cursor, setCursor] = useState(0);
  const [activeSubmenuId, setActiveSubmenuId] = useState<string | null>(null);
  const [submenuAnchorRect, setSubmenuAnchorRect] = useState<DOMRect | null>(null);
  const [submenuPos, setSubmenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const anchorRef = 'current' in anchor ? anchor : null;
  const menuWidth = Math.min(width, Math.max(0, innerWidth - 16));

  useMenuReset(open, setActiveSubmenuId, setSubmenuAnchorRect);
  useMenuPosition(open, anchor, align, menuWidth, items, setPosition, setCursor);
  useSubmenuPosition(activeSubmenuId, submenuAnchorRect, menuRef, submenuRef, setSubmenuPos);
  useEscape(open, onClose);
  useClickOutside(anchorRef ? [menuRef, anchorRef, submenuRef] : [menuRef, submenuRef], open, onClose);
  useFocusRestore(open);
  useCursorFocus(open, cursor, menuRef);
  useMenuCursorKeys(open, items, setCursor);
  useMenuActionKeys(open, items, cursor, onClose, menuRef, submenuRef, setActiveSubmenuId, setSubmenuAnchorRect);

  const { handleHover, handleClick } = useMenuInteractions(setCursor, setActiveSubmenuId, setSubmenuAnchorRect, onClose);
  if (!open)
    return null;
  const activeItem = items.find((i) => i.id === activeSubmenuId);
  return (<>
    {createPortal(<div ref={menuRef} role='menu' aria-label={label} tabIndex={-1} className='anim-pop fixed z-[var(--z-pop)] max-h-[420px] overflow-y-auto rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-1 shadow-[var(--shadow-pop)] outline-none' style={{ top: position.top, left: position.left, width: menuWidth, transformOrigin: position.origin, zIndex }}>
      {items.map((item, index) => (<MenuItemRow key={item.id} item={item} index={index} cursor={cursor} onHover={handleHover} onClick={handleClick}/>))}
    </div>, document.body)}
    {activeItem && activeItem.submenu && (<MenuSubmenu
      submenu={activeItem.submenu}
      submenuRef={submenuRef}
      submenuPos={submenuPos}
      zIndex={zIndex}
      cursor={cursor}
      menuRef={menuRef}
      onClose={onClose}
      onEsc={() => setActiveSubmenuId(null)}
    />)}
  </>);
}

function useMenuInteractions(setCursor: React.Dispatch<React.SetStateAction<number>>, setActiveSubmenuId: React.Dispatch<React.SetStateAction<string | null>>, setSubmenuAnchorRect: React.Dispatch<React.SetStateAction<DOMRect | null>>, onClose: () => void) {
  const handleHover = (index: number, item: MenuItem, element: HTMLElement) => {
    setCursor(index);
    if (item.submenu) {
      setActiveSubmenuId(item.id);
      setSubmenuAnchorRect(element.getBoundingClientRect());
    }
    else {
      setActiveSubmenuId(null);
      setSubmenuAnchorRect(null);
    }
  };
  const handleClick = (item: MenuItem, element: HTMLElement) => {
    if (item.submenu) {
      setActiveSubmenuId((curr) => curr === item.id ? null : item.id);
      setSubmenuAnchorRect(element.getBoundingClientRect());
      return;
    }
    item.onSelect?.();
    onClose();
  };
  return { handleHover, handleClick };
}

function MenuSubmenu({ submenu, submenuRef, submenuPos, zIndex, cursor, menuRef, onClose, onEsc }: {
  submenu: Exclude<MenuItem['submenu'], undefined>;
  submenuRef: React.RefObject<HTMLDivElement | null>;
  submenuPos: { top: number; left: number };
  zIndex?: number;
  cursor: number;
  menuRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onEsc: () => void;
}) {
  return createPortal(
    <div
      ref={submenuRef}
      tabIndex={-1}
      className='anim-pop fixed outline-none'
      style={{
        top: submenuPos.top,
        left: submenuPos.left,
        zIndex: (zIndex ?? Z_INDEX.menu) + 10,
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onEsc();
          menuRef.current?.querySelector<HTMLElement>(`[data-menu-index="${cursor}"]`)?.focus();
        }
      }}
    >
      {typeof submenu === 'function'
        ? submenu({ closeMenu: onClose })
        : submenu}
    </div>,
    document.body
  );
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