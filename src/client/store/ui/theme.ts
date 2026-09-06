import type { UiState } from './types';

/** Applies the current appearance to <html> data attributes (theme/accent/background). */
export function applyThemeToDom(state: Pick<UiState, 'theme' | 'accent' | 'background' | 'fontScale'>): void {
  const root = document.documentElement
  const dark =
    state.theme === 'dark' ||
    (state.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  root.dataset.theme = dark ? 'dark' : 'light'
  root.dataset.accent = state.accent
  root.dataset.background = state.background
}