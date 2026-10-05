import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { FIRST_PAINT_ROOT_PREFIXES } from '../scripts/lib/boot-graph.mjs'

/**
 * `check-bundle-budget` and `check-vendor-isolation` share one definition of "first paint", and that
 * definition is a hand-written list of chunk prefixes. A list is only as honest as the source it
 * describes: drop one entry and both gates keep passing while quietly measuring a smaller startup —
 * which is the exact blind spot the shared module was extracted to remove. Verified by mutation:
 * deleting `shell-` from the list left both gates green, because every tracked leak (dicebear,
 * qrcode.react, the music store) still has a second path into the closure.
 *
 * So the expected list is derived here from the three source facts that actually make a `lazy()`
 * surface part of the first render, and compared against the constant in both directions. Change a
 * mount in the app and this test says so; delete an entry from the list and it says so too.
 */

// Resolved from the working directory rather than `import.meta.url`: this file runs in the jsdom
// project, where vitest's transform leaves `import.meta.url` undefined and every read would then
// fail as "no such file: tests/undefined" — a broken ruler reporting a passing build.
const repoRoot = process.cwd()
function read(file: string): string {
  const resolved = path.resolve(repoRoot, file)
  if (!existsSync(resolved)) throw new Error(`boot-graph test cannot read ${resolved}; run it from the repository root`)
  return readFileSync(resolved, 'utf8')
}

/** The module a `lazy(() => import('…'))` points at, by its path segment. */
function lazilyMountedInFirstRender(source: string, component: string): string | null {
  const declaration = new RegExp(`const\\s+${component}\\s*=\\s*lazy\\(\\s*\\(\\)\\s*=>\\s*import\\(\\s*['"]([^'"]+)['"]`, 's')
  const match = declaration.exec(source)
  if (!match) return null
  // Declaring a lazy component is not enough — it has to be rendered, not gated behind a surface
  // the user opens. `<Component` appearing in the file is the cheapest honest proxy for that, and
  // the three files below are small enough to read the whole way.
  return source.includes(`<${component}`) ? match[1] : null
}

function rootPrefixOf(specifier: string): string {
  const segment = specifier.replace(/^\.\.?\//, '').split('/').pop() as string
  return `${segment}-`
}

describe('the first-paint definition', () => {
  it('boots App through a dynamic import, so the graph reaches past the document chunks', () => {
    expect(read('src/client/main.tsx')).toMatch(/await\s+Promise\.all\(\[\s*import\(\s*['"]\.\/app['"]/s)
  })

  it('renders the shell as soon as the session resolves, not on a user gesture', () => {
    const app = read('src/client/app.tsx')
    expect(lazilyMountedInFirstRender(app, 'AppShell')).toBe('./features/shell')
    expect(app).toContain("status === 'authed'")
  })

  it('renders the workspace from the first return of the shell itself', () => {
    const shell = read('src/client/features/shell/app-shell.tsx')
    expect(lazilyMountedInFirstRender(shell, 'Workspace')).toBe('../workspace')
  })

  it('declares exactly the roots the three facts above imply, in both directions', () => {
    const derived = [
      rootPrefixOf('./app'),
      rootPrefixOf(lazilyMountedInFirstRender(read('src/client/app.tsx'), 'AppShell') ?? ''),
      rootPrefixOf(lazilyMountedInFirstRender(read('src/client/features/shell/app-shell.tsx'), 'Workspace') ?? ''),
    ].filter(Boolean)
    expect([...FIRST_PAINT_ROOT_PREFIXES].sort()).toEqual([...new Set(derived)].sort())
  })
})
