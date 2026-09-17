import { describe, expect, it, vi } from 'vitest'
import { t } from '../../../i18n'
import { MAX_SLIDE_IMAGE_BYTES, imageBoxForAspect } from '../image-asset'
import { imageInsertToast, insertImageFromPicker, type InsertImageDeps } from './insert-image'

function photo(bytes: number): File {
  return new File([new Uint8Array(bytes)], 'photo.jpg', { type: 'image/jpeg' })
}

function deps(overrides: Partial<InsertImageDeps> = {}): InsertImageDeps {
  return {
    pick: async () => photo(1024),
    upload: async () => '/api/files/abc/content',
    prepare: async (file) => file,
    sizeOf: async () => ({ width: 1000, height: 500 }),
    ...overrides,
  }
}

describe('inserting the picture that was chosen', () => {
  it('uploads it and sizes the box to its own shape', async () => {
    const upload = vi.fn(async () => '/api/files/abc/content')

    await expect(insertImageFromPicker(deps({ upload }))).resolves.toEqual({
      status: 'inserted',
      src: '/api/files/abc/content',
      box: { w: 480, h: 240 },
    })
    expect(upload).toHaveBeenCalledTimes(1)
  })

  it('falls back to the default box when the picture size cannot be read', async () => {
    const result = await insertImageFromPicker(deps({ sizeOf: async () => null }))

    expect(result).toEqual({
      status: 'inserted',
      src: '/api/files/abc/content',
      box: imageBoxForAspect(),
    })
  })
})

describe('ending an insert without a picture', () => {
  it('does nothing at all when the dialog was dismissed', async () => {
    const upload = vi.fn(async () => '/api/files/abc/content')

    await expect(insertImageFromPicker(deps({ pick: async () => null, upload }))).resolves.toEqual({
      status: 'cancelled',
    })
    expect(upload).not.toHaveBeenCalled()
  })

  it('refuses a file past the cap before uploading it', async () => {
    const upload = vi.fn(async () => '/api/files/abc/content')
    const picked = photo(MAX_SLIDE_IMAGE_BYTES + 1)

    await expect(insertImageFromPicker(deps({ pick: async () => picked, upload }))).resolves.toEqual({
      status: 'too-large',
    })
    expect(upload).not.toHaveBeenCalled()
  })

  it('re-checks the cap after preparing, for a pass that grows the file', async () => {
    await expect(
      insertImageFromPicker(deps({ prepare: async () => photo(MAX_SLIDE_IMAGE_BYTES + 1) })),
    ).resolves.toEqual({ status: 'too-large' })
  })

  it('reports a failed upload with the error instead of an image pointing nowhere', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const error = new Error('quota exceeded')

    const result = await insertImageFromPicker(
      deps({
        upload: async () => {
          throw error
        },
      }),
    )

    expect(result).toEqual({ status: 'failed', error })
    expect(warn).toHaveBeenCalledWith('[slides] adding a picture failed', error)
    warn.mockRestore()
  })
})

describe('imageInsertToast', () => {
  it('names the size limit when the file was too large', () => {
    const toast = imageInsertToast({ status: 'too-large' })

    expect(toast.title).toBe(t('slides.image_too_large'))
    expect(toast.tone).toBe('danger')
    // The hint interpolates the cap; without the locale resources loaded the message id
    // comes back as-is, so what is asserted here is which message the cap goes into.
    expect(toast.description).toBe(t('slides.image_too_large_hint', { value0: 8 }))
  })

  it('carries the upload error to the reader', () => {
    const toast = imageInsertToast({ status: 'failed', error: new Error('quota exceeded') })

    expect(toast.title).toBe(t('slides.image_failed'))
    expect(toast.description).toContain('quota exceeded')
    expect(toast.tone).toBe('danger')
  })
})
