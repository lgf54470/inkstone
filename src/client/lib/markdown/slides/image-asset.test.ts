import { describe, expect, it } from 'vitest'
import { IMAGE_BOX_MAX_WIDTH, MAX_SLIDE_IMAGE_BYTES, decodeImageSize, imageBoxForAspect, imageTooLarge } from './image-asset'

describe('imageTooLarge', () => {
  it('accepts a file at the cap and refuses one past it', () => {
    expect(imageTooLarge(MAX_SLIDE_IMAGE_BYTES)).toBe(false)
    expect(imageTooLarge(MAX_SLIDE_IMAGE_BYTES + 1)).toBe(true)
  })
})

describe('imageBoxForAspect', () => {
  it('scales a wide picture down to the page width, keeping its shape', () => {
    expect(imageBoxForAspect(2000, 1000)).toEqual({ w: IMAGE_BOX_MAX_WIDTH, h: IMAGE_BOX_MAX_WIDTH / 2 })
  })

  it('leaves a picture that already fits at its own size', () => {
    expect(imageBoxForAspect(300, 200)).toEqual({ w: 300, h: 200 })
  })

  it('fits a tall picture by its height rather than overflowing the page', () => {
    const box = imageBoxForAspect(500, 1500)
    expect(box.h).toBe(IMAGE_BOX_MAX_WIDTH)
    expect(box.w).toBeLessThan(IMAGE_BOX_MAX_WIDTH)
  })

  it('falls back to a landscape box when the size is missing or nonsensical', () => {
    const fallback = { w: IMAGE_BOX_MAX_WIDTH, h: Math.round(IMAGE_BOX_MAX_WIDTH / (4 / 3)) }
    expect(imageBoxForAspect()).toEqual(fallback)
    expect(imageBoxForAspect(0, 100)).toEqual(fallback)
    expect(imageBoxForAspect(Number.NaN, 100)).toEqual(fallback)
  })
})

/** jsdom has no image decoder, so each case installs the one it needs and puts back what was there. */
function stubDecoder(decoder: (() => Promise<{ width: number; height: number; close?: () => void }>) | undefined): () => void {
  const original = globalThis.createImageBitmap
  if (decoder) {
    globalThis.createImageBitmap = decoder as unknown as typeof createImageBitmap
  } else {
    Reflect.deleteProperty(globalThis, 'createImageBitmap')
  }
  return () => {
    if (original) globalThis.createImageBitmap = original
    else Reflect.deleteProperty(globalThis, 'createImageBitmap')
  }
}

describe('decodeImageSize', () => {
  it('reports the decoded pixel size and releases the bitmap', async () => {
    const closed: boolean[] = []
    const restore = stubDecoder(async () => ({ width: 640, height: 360, close: () => closed.push(true) }))
    try {
      await expect(decodeImageSize(new Blob())).resolves.toEqual({ width: 640, height: 360 })
      expect(closed).toEqual([true])
    } finally {
      restore()
    }
  })

  it('answers null instead of throwing when the bytes cannot be decoded', async () => {
    const restore = stubDecoder(async () => {
      throw new Error('unsupported image')
    })
    try {
      await expect(decodeImageSize(new Blob())).resolves.toBeNull()
    } finally {
      restore()
    }
  })

  it('answers null when the browser has no decoder at all', async () => {
    const restore = stubDecoder(undefined)
    try {
      await expect(decodeImageSize(new Blob())).resolves.toBeNull()
    } finally {
      restore()
    }
  })
})
