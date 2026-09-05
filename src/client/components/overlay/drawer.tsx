import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { IconButton } from '../primitives';
import { t } from '../../lib/i18n';
import { Z_INDEX } from '../../lib/z-index';
import { useEscape, useLockScroll, useDialogFocus } from './hooks';
import { Tooltip } from './tooltip';


export function Drawer({ open, onClose, side = 'right', width = 380, children, title, zIndex = Z_INDEX.drawer, }: {
    open: boolean;
    onClose: () => void;
    side?: 'left' | 'right';
    width?: number;
    children: ReactNode;
    title?: ReactNode;
    zIndex?: number;
}) {
    const panelRef = useRef<HTMLElement>(null);
    const titleId = useId();
    useEscape(open, onClose);
    useLockScroll(open);
    useDialogFocus(open, panelRef);
    if (!open)
        return null;
    return createPortal(<div className="app-viewport-fixed fixed" style={{ zIndex }}>
      <div className="anim-fade absolute inset-0 bg-[var(--scrim)]" onClick={onClose} aria-hidden="true"/>
      <aside ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} aria-label={title ? undefined : t("overlay.side_panel")} tabIndex={-1} className={cn('absolute top-0 bottom-0 flex flex-col border-[var(--border-default)] bg-[var(--bg-surface)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-[var(--shadow-modal)] outline-none md:py-0', side === 'right' ? 'right-0 border-l' : 'left-0 border-r')} style={{
            width: Math.min(width, window.innerWidth < 768 ? window.innerWidth : window.innerWidth - 32),
            animation: `ink-slide-in-${side} var(--dur-slow) var(--ease-out) both`,
        }}>
        {title && (<header className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-3">
            <span id={titleId} className="text-[length:var(--text-13)] font-semibold">{title}</span>
            <Tooltip label={t("common.close")} combo="escape" side="left">
              <IconButton label={t("common.close")} size="sm" onClick={onClose}>
                <X size={15}/>
              </IconButton>
            </Tooltip>
          </header>)}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>, document.body);
}
