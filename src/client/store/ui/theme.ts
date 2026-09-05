import type { ThemePref } from '@shared/types';
import type { UiState } from './types';
import { useUi } from './store';



export function applyThemeToDom(state: Pick<UiState, 'theme' | 'accent' | 'background' | 'fontScale'>): void {
  const root = document.documentElement
  const dark =
    state.theme === 'dark' ||
    (state.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  root.dataset.theme = dark ? 'dark' : 'light'
  root.dataset.accent = state.accent
  root.dataset.background = state.background
}



export let themeTransitionTimer: number | undefined



export function switchThemeWithTransition(
  next: ThemePref,
  origin?: { x: number; y: number },
  commit?: () => void,
): void {
  const ui = useUi.getState()
  const apply = commit ?? (() => ui.applyAppearance({ theme: next }))
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { ready: Promise<void> }
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const root = document.documentElement
  window.clearTimeout(themeTransitionTimer)
  themeTransitionTimer = undefined
  root.classList.remove('theme-transition')

  if (!doc.startViewTransition || reduced || !origin) {
    root.classList.add('theme-transition')
    apply()
    themeTransitionTimer = window.setTimeout(() => {
      root.classList.remove('theme-transition')
      themeTransitionTimer = undefined
    }, 300)
    return
  }

  const transition = doc.startViewTransition(() => {
    apply()
  })

  void (async () => {
    try {
      await transition.ready
      const radius = Math.hypot(
        Math.max(origin.x, innerWidth - origin.x),
        Math.max(origin.y, innerHeight - origin.y),
      )
      document.documentElement.animate(
        {
          clipPath: [`circle(0px at ${origin.x}px ${origin.y}px)`, `circle(${radius}px at ${origin.x}px ${origin.y}px)`],
        },
        {
          duration: 460,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          pseudoElement: '::view-transition-new(root)',
        },
      )
    } catch {
      // The view transition can be skipped (reduced motion, interrupted navigation); the circular reveal is purely decorative.
    }
  })()
}
