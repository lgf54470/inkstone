import type { Hotkey } from '../../lib/hotkeys'
import { t } from '../../lib/i18n'
import { SEEK_STEP_MS, seekTargetMs } from './music-utils'
import { progressTimeMs, useMusic } from './music-store'

/**
 * What Space belongs to before the music player: anything the keyboard presses with it. `<button>`
 * takes the key natively, and `[role="button"]` is that same contract written by hand (the tag pill
 * is a `span` that has to activate on Space — without it here, the hotkey takes the key and the pill
 * never hears it). The other roles are the menu/choice controls whose own keys this must not eat.
 */
const SPACE_OTHER_OWNERS =
  'button, a, input, select, textarea, [role="button"], [role="menu"], [role="menuitem"], [role="radio"], [role="checkbox"], [role="tab"]'

/**
 * Surfaces that use Space as one of their own gestures: the slides editor (Space arms its pan, the
 * gesture its help card documents), the show it opens (Space advances a slide) and the template
 * library (Space toggles the card under the cursor while selecting). Each of them listens on its own
 * subtree or on `window`, and this registry is bound on `window` in the *capture* phase — so it runs
 * first, and calling `preventDefault()`/`stopPropagation()` means the key never arrives.
 *
 * Measured rather than assumed, on a real instance with a track loaded: a real Space pressed inside
 * the slides editor reached the window capture listener with `defaultPrevented` already true, never
 * reached the window bubble listener the pan hook sits on, and started a track — the player's
 * `<audio>` element did not exist before the key and was mounted with a stream after it. That is the
 * whole of the flakiness the visual gate recorded for the pan gesture: what varies between runs is
 * whether a track is in the queue yet, not the load on the machine.
 */
const SPACE_OWNING_SURFACES = '.bento-slides-fullscreen, .bento-slides-presenter, [data-surface="templates"]'

// Space is how keyboards press the focused button, and with nothing loaded it should
// still scroll the page — so the shortcut only claims the key on plain ground once a track exists.
function claimsSpace(event: KeyboardEvent): boolean {
  const target = event.target
  if (target instanceof Element && target.closest(SPACE_OTHER_OWNERS)) return false
  // Whether one of those surfaces is on screen, not where the key was aimed: the pan hook and the
  // show both listen on `window`, so an armed pan is the *page's* state and the key's target is the
  // focused element — the body, when nothing in the overlay holds focus.
  if (typeof document !== 'undefined' && document.querySelector(SPACE_OWNING_SURFACES)) return false
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
