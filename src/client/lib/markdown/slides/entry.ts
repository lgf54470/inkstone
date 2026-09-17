import type { Root } from 'react-dom/client'
import type { AppLocale } from '@shared/types'
import type { BentoDoc, SlidesFenceRef, SlidesMode, SlidesWriter } from './types'

export interface SlidesBlockEntry {
  key: string
  scope: string
  noteId: string | null
  index: number
  host: HTMLElement
  source: string
  data: BentoDoc | null
  mode: SlidesMode
  editable: boolean
  owner: 'inline' | 'overlay'
  dark: boolean
  locale: AppLocale
  container: HTMLElement | null
  root: Root | null
  /** The control the editor was opened from, so closing it can put the focus back where it was. */
  opener: HTMLElement | null
  ref: SlidesFenceRef | null
  write: SlidesWriter | null
  /** Host feedback for a change the user has to be told about (the body switching syntax). */
  notice: (() => void) | null
  /** Told whether an edit is still waiting for its write — the surface's unsaved-change state. */
  report: ((pending: boolean) => void) | null
  dirty: boolean
  timer: number | null
}
