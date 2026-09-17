import { api } from '../../../api'
import { errorMessage } from '../../../errors'
import { optimizeImageFile } from '../../../image'
import { t } from '../../../i18n'
import { MAX_SLIDE_IMAGE_BYTES, decodeImageSize, imageBoxForAspect, imageTooLarge } from '../image-asset'
import { pickImageFile } from './pick-image'

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
