import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Info, Undo2, X, XCircle } from 'lucide-react';
import { cn } from '../lib/cn';
import { useUi, type ToastItem } from '../store/ui';
import { Button } from './primitives';
import { Tooltip } from './overlay';
import { t } from '../lib/i18n';
import { isEditableTarget } from '../lib/hotkeys';
import { useUndoToastFocus } from '../lib/undo-focus-pref';
import { EmptyIllustration, type EmptyArt } from './empty-illustrations';

const SKELETON_WIDE = 'w-[86%]'
const SKELETON_NARROW = 'w-[70%]'
const SKELETON_FADE_STEP = 0.11
const SKELETON_W_BASE = 58
const SKELETON_W_STEP = 13
const SKELETON_W_MOD = 34
const SKELETON_W2_BASE = 72
const SKELETON_W2_STEP = 7
const SKELETON_W2_MOD = 24
const LOADING_ICON_SIZE = 20

const TONE_ICON = {
  default: <Info size={14}/>,
  success: <Check size={14}/>,
  warning: <AlertTriangle size={14}/>,
  danger: <XCircle size={14}/>,
};
const TONE_COLOR = {
  default: 'text-[var(--accent)]',
  success: 'text-[var(--success)]',
  warning: 'text-[var(--warning)]',
  danger: 'text-[var(--danger)]',
};
function useToastAutoFocus(item: ToastItem, undoFocusEnabled: boolean, containerRef: React.RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    // Landing focus on the undo action is the keyboard fast-path, but it must never
    // interrupt typing, steal from an open dialog, or fight another undo toast.
    if (!item.action || !undoFocusEnabled)
      return;
    const active = document.activeElement;
    if (active && isEditableTarget(active))
      return;
    if (active?.closest('[role="dialog"]'))
      return;
    if (active?.closest('[data-undo-focus]'))
      return;
    containerRef.current?.querySelector<HTMLButtonElement>('[data-undo-focus]')?.focus({ preventScroll: true });
  }, [item.action, undoFocusEnabled, containerRef]);
}
function useToastTimer(item: ToastItem, dismiss: (id: string) => void, setIsLeaving: (leaving: boolean) => void): { pausedRef: React.MutableRefObject<boolean> } {
  const pausedRef = useRef(false);
  const timerRef = useRef<number>(0);
  const dismissTimerRef = useRef<number>(0);
  useEffect(() => {
    const start = () => {
      timerRef.current = window.setTimeout(() => {
        if (pausedRef.current)
          return start();
        setIsLeaving(true);
        dismissTimerRef.current = window.setTimeout(() => dismiss(item.id), 200);
      }, item.duration);
    };
    start();
    return () => {
      window.clearTimeout(timerRef.current);
      window.clearTimeout(dismissTimerRef.current);
    };
  }, [item.id, item.duration, dismiss, setIsLeaving]);
  return { pausedRef };
}
function Toast({ item }: {
  item: ToastItem;
}) {
  const dismiss = useUi((s) => s.dismissToast);
  const [isLeaving, setIsLeaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isUndo = item.kind === 'undo';
  const undoFocusEnabled = useUndoToastFocus();
  useToastAutoFocus(item, undoFocusEnabled, containerRef);
  const { pausedRef } = useToastTimer(item, dismiss, setIsLeaving);
  return (<div ref={containerRef} onMouseEnter={() => (pausedRef.current = true)} onMouseLeave={() => (pausedRef.current = false)} className={cn('pointer-events-auto flex w-[min(400px,calc(100vw-32px))] items-start gap-2.5', 'rounded-[var(--r-lg)] border p-3 pr-2', 'shadow-[var(--shadow-pop)] transition-all duration-[var(--dur-base)] ease-[var(--ease-out)]', isUndo
      ? 'border-[color-mix(in_oklab,var(--accent)_55%,transparent)] bg-[color-mix(in_oklab,var(--accent)_7%,var(--bg-overlay))]'
      : 'border-[var(--border-default)] bg-[var(--bg-overlay)]', isLeaving ? 'translate-x-2 opacity-0' : 'anim-slide-right')} role={item.tone === 'danger' ? 'alert' : 'status'} aria-label={item.action ? `${item.title} ${item.action.label}` : undefined}>
    <span className={cn('mt-[1px] shrink-0', isUndo ? 'text-[var(--accent)]' : TONE_COLOR[item.tone])}>{isUndo ? <Undo2 size={14}/> : TONE_ICON[item.tone]}</span>
    <div className='min-w-0 flex-1'>
    <div className="text-[length:var(--text-12\\.5)] leading-snug font-medium text-[var(--text-primary)]">
      {item.title}
    </div>
    {item.description && (<div className="mt-0.5 text-[length:var(--text-11\\.5)] leading-relaxed text-[var(--text-tertiary)]">
      {item.description}
      </div>)}
    </div>
    {item.action && (<Button data-undo-focus size='sm' variant='ghost' className='-my-0.5 shrink-0 text-[var(--accent)]' onClick={() => {
        item.action?.run();
        dismiss(item.id);
      }}>
      {item.action.label}
    </Button>)}
    <Tooltip label={t('feedback.dismiss')} side='left'>
    <button type='button' onClick={() => dismiss(item.id)} aria-label={t('feedback.dismiss')} className='mt-[1px] shrink-0 rounded p-1 text-[var(--text-quaternary)] transition-colors hover:text-[var(--text-secondary)]'>
      <X size={12}/>
    </button>
    </Tooltip>
  </div>);
}
export function Toaster() {
  const toasts = useUi((s) => s.toasts);
  if (typeof document === 'undefined')
    return null;
  return createPortal(<div className='app-viewport-toaster pointer-events-none fixed right-2 bottom-[calc(64px+env(safe-area-inset-bottom))] z-[var(--z-toast)] flex flex-col items-end gap-2 md:right-4 md:bottom-4'>
    {toasts.map((item) => (<Toast key={item.id} item={item}/>))}
  </div>, document.body);
}

export function Skeleton({ className, style }: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={cn('skeleton', className)} style={style}/>;
}
export function NoteListSkeleton({ count = 7 }: {
  count?: number;
}) {
  return (<div className='space-y-1 p-2'>
    {Array.from({ length: count }, (_, i) => (<div key={i} className='space-y-2 rounded-[var(--r-md)] p-2.5' style={{ opacity: 1 - i * SKELETON_FADE_STEP }}>
      <Skeleton className='h-3.25' style={{ width: `${SKELETON_W_BASE + ((i * SKELETON_W_STEP) % SKELETON_W_MOD)}%` }}/>
      <Skeleton className='h-2.75' style={{ width: `${SKELETON_W2_BASE + ((i * SKELETON_W2_STEP) % SKELETON_W2_MOD)}%` }}/>
      <Skeleton className='h-2.5 w-16'/>
    </div>))}
  </div>);
}
export function EditorSkeleton() {
  return (<div className='mx-auto max-w-[70ch] space-y-3 px-6 py-8'>
    <Skeleton className='h-6 w-1/2'/>
    <div className='h-3'/>
    {[92, 100, 78, 96, 64].map((w, i) => (<Skeleton key={i} className='h-3.25' style={{ width: `${w}%` }}/>))}
    <div className='h-4'/>
    <Skeleton className={`h-3.25 ${SKELETON_WIDE}`}/>
    <Skeleton className={`h-3.25 ${SKELETON_NARROW}`}/>
  </div>);
}
export type { EmptyArt };
export function Empty({ art = 'notes', title, description, action, compact, }: {
  art?: EmptyArt;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (<div className={cn('flex flex-col items-center justify-center px-8 text-center', compact ? 'py-10' : 'h-full min-h-60 py-16')}>
    <EmptyIllustration art={art}/>
    <p className="mt-4 text-[length:var(--text-13\\.5)] font-medium text-[var(--text-secondary)]">{title}</p>
    {description && (<p className='mt-1.5 max-w-72.5 text-[length:var(--text-12)] leading-relaxed text-[var(--text-quaternary)]'>
      {description}
    </p>)}
    {action && <div className='mt-4'>{action}</div>}
  </div>);
}
export function LoadingBlock({ label = t('common.loading') }: {
  label?: string;
}) {
  return (<div role='status' aria-live='polite' className='flex h-full min-h-40 flex-col items-center justify-center gap-2.5 text-[var(--text-quaternary)]'>
    <svg aria-hidden='true' width={LOADING_ICON_SIZE} height={LOADING_ICON_SIZE} viewBox='0 0 24 24' fill='none' className='animate-[ink-spin_.7s_linear_infinite]'>
    <circle cx='12' cy='12' r='9' stroke='currentColor' strokeWidth='2.4' opacity='0.2'/>
    <path d='M21 12a9 9 0 0 0-9-9' stroke='currentColor' strokeWidth='2.4' strokeLinecap='round'/>
    </svg>
    <span className='text-[length:var(--text-12)]'>{label}</span>
  </div>);
}