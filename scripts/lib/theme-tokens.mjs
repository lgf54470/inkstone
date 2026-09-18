// Reads the token layer as declared text rather than as painted pixels, for the
// gates that have to judge colours before anything renders them (see
// tests/kanban-tag-contrast.test.ts and tests/kanban-chart-tokens.test.ts).
// A theme is the cascade the browser would apply: the base `:root` block, then
// the theme block, then that theme's white-background override.

export const TOKENS_PATH = 'src/client/styles/tokens.css'

const THEME_SELECTORS = {
  light: [':root {', ":root[data-theme='light'] {", ":root[data-theme='light'][data-background='white'] {"],
  dark: [':root {', ":root[data-theme='dark'] {", ":root[data-theme='dark'][data-background='white'] {"],
}

function declarations(source, selector) {
  const map = new Map()
  // The same selector may appear in several blocks (`:root` is not one block),
  // and the cascade keeps whichever came last.
  for (let start = source.indexOf(selector); start >= 0; start = source.indexOf(selector, start + selector.length)) {
    const block = source.slice(start, source.indexOf('}', start))
    for (const match of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) map.set(match[1], match[2].trim())
  }
  return map
}

export function themeVars(theme, source) {
  const selectors = THEME_SELECTORS[theme]
  if (!selectors) throw new Error(`unknown theme ${theme}`)
  for (const selector of selectors) if (!source.includes(selector)) throw new Error(`missing ${selector}`)
  return selectors.reduce((acc, selector) => {
    for (const [name, value] of declarations(source, selector)) acc.set(name, value)
    return acc
  }, new Map())
}
