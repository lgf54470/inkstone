import type { Hotkey } from '../../lib/hotkeys'
import { t } from '../../lib/i18n'
import { SEEK_STEP_MS, seekTargetMs } from './music-utils'
import { progressTimeMs, useMusic } from './music-store'

// Space is how keyboards press the focused button, and with nothing loaded it should
// still scroll the page — so the shortcut only claims the key on plain ground once a track exists.
function claimsSpace(event: KeyboardEvent): boolean {
  const target = event.target
  if (target instanceof Element && target.closest('button, a, input, select, textarea, [role="menu"], [role="menuitem"], [role="radio"], [role="checkbox"], [role="tab"]')) return false
  const state = useMusic.getState()
  return state.queue[state.currentIndex] != null
}

function seekBy(deltaMs: number): void {
  const state = useMusic.getState()
  state.seek(seekTargetMs(progressTimeMs(), state.durationMs, deltaMs))
}

export const MUSIC_HOTKEYS: Hotkey[] = [
  {
    id: 'music-play-pause',
    combo: 'space',
    description: () => t('music.play_pause'),
    group: () => t('shell.global'),
    when: claimsSpace,
    handler: () => void useMusic.getState().togglePlay(),
  },
  {
    id: 'music-previous',
    combo: 'mod+arrowleft',
    description: () => t('music.previous'),
    group: () => t('shell.global'),
    handler: () => void useMusic.getState().playPrevious(),
  },
  {
    id: 'music-next',
    combo: 'mod+arrowright',
    description: () => t('music.next'),
    group: () => t('shell.global'),
    handler: () => void useMusic.getState().playNext(),
  },
  {
    id: 'music-rewind',
    combo: 'alt+arrowleft',
    description: () => t('music.rewind'),
    group: () => t('shell.global'),
    handler: () => seekBy(-SEEK_STEP_MS),
  },
  {
    id: 'music-forward',
    combo: 'alt+arrowright',
    description: () => t('music.forward'),
    group: () => t('shell.global'),
    handler: () => seekBy(SEEK_STEP_MS),
  },
]
