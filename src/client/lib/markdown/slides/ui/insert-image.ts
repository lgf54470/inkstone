import { useCallback, useEffect, useRef } from 'react'
import { api } from '../../../api'
import { errorMessage } from '../../../errors'
import { optimizeImageFile } from '../../../image'
import { t } from '../../../i18n'
import type { SlideElement } from '../types'
import { MAX_SLIDE_IMAGE_BYTES, decodeImageSize, imageBoxForAspect, imageTooLarge } from '../image-asset'
import { createDefaultImage } from './element-factories'
import { pickImageFile } from './pick-image'
import { useUi } from '../../../../store/ui'

export type InsertImageResult =
  | { status: 'inserted'; src: string; box: { w: number; h: number } }
  | { status: 'cancelled' }
  | { status: 'too-large' }
  | { status: 'failed'; error: unknown }

export interface InsertImageDeps {
  pick: () => Promise<File | null>
  upload: (file: File) => Promise<string>
  prepare?: (file: File) => Promise<File>
  sizeOf?: (file: Blob) => Promise<{ width: number; height: number } | null>
}

/**
 * One picture, from the dialog to a source address the slide can point at. Every ending is
 * named rather than thrown: the person who cancelled sees nothing, and the person whose
 * file was refused is told which of the two things went wrong — the file was too large, or
 * the upload did not work — instead of a button that appeared to do nothing.
 */
export async function insertImageFromPicker(deps: InsertImageDeps): Promise<InsertImageResult> {
  const file = await deps.pick()
  if (!file) return { status: 'cancelled' }
  return await insertImageFromFile(file, deps)
}

/** The same journey for a file already in hand — a paste carries the bytes, not a dialog. */
export async function insertImageFromFile(
  file: File,
  deps: Omit<InsertImageDeps, 'pick'>,
): Promise<InsertImageResult> {
  if (imageTooLarge(file.size)) return { status: 'too-large' }
  try {
    const prepared = await (deps.prepare ?? optimizeImageFile)(file)
    if (imageTooLarge(prepared.size)) return { status: 'too-large' }
    const src = await deps.upload(prepared)
    const size = await (deps.sizeOf ?? decodeImageSize)(prepared)
    return { status: 'inserted', src, box: imageBoxForAspect(size?.width, size?.height) }
  } catch (error) {
    console.warn('[slides] adding a picture failed', error)
    return { status: 'failed', error }
  }
}

/** The real wiring: the browser's dialog, the deck's note as the attachment's owner, Inkstone's store as the host. */
export function noteImageDeps(noteId: string | null): InsertImageDeps {
  return {
    pick: pickImageFile,
    upload: async (file) => (await api.files.upload(file, noteId ?? undefined)).url,
  }
}

export interface SlidesImageHost {
  /** The note that owns the upload; null on a surface with no note. */
  noteId: string | null
  /** The slide the picture is meant for, read when it lands rather than when it was asked for. */
  targetSlideId: () => string | null
  /** Puts one element on that slide; false when the slide is gone by then. */
  insert: (slideId: string, element: SlideElement) => boolean
  /** The element the reader now has selected. */
  select: (elementId: string) => void
}

/**
 * The editor's two ways in for a picture — the file dialog and a paste — ending the same way:
 * the upload becomes an element on the slide the reader was on, and every ending that is not
 * that one is said out loud. A picture whose slide vanished while it uploaded keeps its bytes
 * (the upload belongs to the note) and loses only its place, which is what the toast says.
 */
export function useSlidesImages(host: SlidesImageHost): {
  addFromPicker: () => Promise<void>
  addFile: (file: File) => Promise<void>
} {
  const latest = useRef(host)
  useEffect(() => {
    latest.current = host
  })

  const deliver = useCallback(async (result: Promise<InsertImageResult>): Promise<void> => {
    const landed = await result
    if (landed.status === 'cancelled') return
    if (landed.status !== 'inserted') {
      useUi.getState().toast(imageInsertToast(landed))
      return
    }
    const current = latest.current
    const element = createDefaultImage(landed.src, landed.box)
    const slideId = current.targetSlideId()
    if (!slideId || !current.insert(slideId, element)) {
      console.warn('[slides] the picture is uploaded but its slide is gone')
      useUi.getState().toast({
        title: t('slides.image_failed'),
        description: t('slides.image_slide_gone'),
        tone: 'danger',
      })
      return
    }
    current.select(element.id)
  }, [])

  const addFromPicker = useCallback(async (): Promise<void> => {
    await deliver(insertImageFromPicker(noteImageDeps(latest.current.noteId)))
  }, [deliver])

  const addFile = useCallback(
    async (file: File): Promise<void> => {
      await deliver(insertImageFromFile(file, noteImageDeps(latest.current.noteId)))
    },
    [deliver],
  )

  return { addFromPicker, addFile }
}

export type InsertImageToast = { title: string; description: string; tone: 'danger' }

export function imageInsertToast(
  result: Exclude<InsertImageResult, { status: 'inserted' } | { status: 'cancelled' }>,
): InsertImageToast {
  if (result.status === 'too-large') {
    return {
      title: t('slides.image_too_large'),
      description: t('slides.image_too_large_hint', { value0: Math.round(MAX_SLIDE_IMAGE_BYTES / (1024 * 1024)) }),
      tone: 'danger',
    }
  }
  return { title: t('slides.image_failed'), description: errorMessage(result.error), tone: 'danger' }
}
