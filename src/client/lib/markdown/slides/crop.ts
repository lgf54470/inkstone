import type { CSSProperties } from 'react'
import type { ImageCrop } from './types'

/**
 * A crop is a window into a picture that COVERS its frame: `scale` enlarges it inside, and
 * `x`/`y` (0..1) pick which edge the frame aligns to. The mapping below is the format's own
 * (bento/slides crop.ts): the picture is `scale × 100%` of the frame on both axes with
 * `object-fit: cover`, offset by `-(scale − 1) × x` of the frame, and `object-position` moves
 * the cover overflow by the same fraction. Both moves use the same number, so the mapping is
 * monotonic and the frame can never show empty space at any x, y or scale.
 */
export const CROP_MAX_SCALE = 8

/**
 * Out-of-range numbers clamp rather than drop: a hand-edited 1.2 means "the right edge", and
 * a crop that names only some of its three numbers takes the middle for the rest. The input is
 * a partial because it arrives from a file, where any shape of object is possible.
 */
export function normalizeCrop(crop?: Partial<ImageCrop> | null): ImageCrop | null {
  if (!crop || typeof crop !== 'object') return null
  const clamp = (value: unknown, low: number, high: number, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.min(high, Math.max(low, value))
      : fallback
  return {
    x: clamp(crop.x, 0, 1, 0.5),
    y: clamp(crop.y, 0, 1, 0.5),
    scale: clamp(crop.scale, 1, CROP_MAX_SCALE, 1),
  }
}

/** Is this picture the same as no crop at all (cover-fitted, centred, 1×)? */
export function isIdentityCrop(crop?: Partial<ImageCrop> | null): boolean {
  const normalized = normalizeCrop(crop)
  return !normalized || (normalized.scale === 1 && normalized.x === 0.5 && normalized.y === 0.5)
}

/** The style for the picture inside a frame that carries the crop. */
export function cropImageStyle(crop: Partial<ImageCrop>): CSSProperties {
  const { x, y, scale } = normalizeCrop(crop)!
  const percent = (value: number) => `${Math.round(value * 10000) / 100}%`
  const size = percent(scale)
  return {
    position: 'absolute',
    left: percent(-(scale - 1) * x),
    top: percent(-(scale - 1) * y),
    width: size,
    height: size,
    objectFit: 'cover',
    objectPosition: `${percent(x)} ${percent(y)}`,
    maxWidth: 'none',
  }
}
