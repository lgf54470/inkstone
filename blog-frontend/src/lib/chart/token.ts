/**
 * One CSS custom property, read from the element the theme is resolved onto.
 *
 * The fallback matters: with no stylesheet in reach a `getPropertyValue` answers `''`, and an empty
 * colour is one echarts paints with, which reads as a chart that lost its text.
 */
export function token(name: string, fallback: string): string {
  const style = getComputedStyle(document.documentElement)
  return style.getPropertyValue(name).trim() || fallback
}
