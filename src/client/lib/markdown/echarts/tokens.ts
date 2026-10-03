/**
 * One CSS custom property, read from the element the theme is resolved onto.
 *
 * The fallback matters: with no stylesheet in reach — a jsdom test, the first paint before the
 * tokens land — `getPropertyValue` answers `''`, and an empty colour is one echarts will happily
 * paint with, which reads as a chart that has lost its text rather than as a missing token.
 */
export function token(name: string, fallback: string): string {
  const style = getComputedStyle(document.documentElement)
  return style.getPropertyValue(name).trim() || fallback
}
