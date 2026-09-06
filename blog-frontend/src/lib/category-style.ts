/**
 * Category badge/dot inline styles, shared by PostCard and category pages.
 * The old `color + "40"` hex-alpha trick silently fails for non-hex colors
 * (e.g. fallback `oklch(...)` values), so the border tint is built with
 * color-mix instead — valid for hex, oklch and named colors alike.
 * `40` hex-alpha ≈ 25% opacity, so mix 25% to keep visuals unchanged for hex.
 */
export function categoryChipStyle(
  color?: string | null
): { color: string; borderColor: string } | undefined {
  if (!color) return undefined
  return {
    color,
    borderColor: `color-mix(in srgb, ${color} 25%, transparent)`,
  }
}

export function categoryDotStyle(color?: string | null): { backgroundColor: string } {
  return { backgroundColor: color || 'var(--accent)' }
}
