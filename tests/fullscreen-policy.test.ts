import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The browser's own full screen belongs to exactly one surface: the presentation
 * panel, which owns a stable element and tracks `fullscreenchange` itself.
 *
 * Everything else that offers "full screen" goes through an in-app overlay
 * instead. A widget cannot hold the browser's full screen in this app: the
 * preview re-renders the note's markup on every commit and re-parents (or
 * rebuilds) the widget's element, and the browser drops out of full screen the
 * moment its full screen element leaves the document — mid-edit, with the user
 * watching. The mind map library shipped exactly that button; it is disarmed and
 * routed to the overlay (lib/markdown/mindmap/view.ts `disarmNativeFullscreen`,
 * asserted in features/preview/mindmap-fullscreen.test.ts and in the visual
 * gate). This test keeps the next such button from being wired straight to the
 * browser API.
 */
const CLIENT_ROOT = path.resolve('src/client')
const NATIVE_API = /(requestFullscreen|webkitRequestFullscreen|mozRequestFullScreen|msRequestFullscreen)\(/
const NATIVE_FULLSCREEN_OWNERS = [path.join('features', 'presentation', 'presentation-overlay.tsx')]

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.(ts|tsx)$/.test(entry.name)) return []
    return [full]
  })
}

function nativeCallers(): string[] {
  return sourceFiles(CLIENT_ROOT)
    .filter((file) => NATIVE_API.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(CLIENT_ROOT, file))
}

describe('native full screen policy', () => {
  it('is requested only by the presentation surface', () => {
    const offenders = nativeCallers().filter((file) => !NATIVE_FULLSCREEN_OWNERS.includes(file))
    expect(offenders).toEqual([])
  })

  it('sees the one owner it lists, so the check cannot pass by finding nothing', () => {
    expect(nativeCallers()).toEqual(NATIVE_FULLSCREEN_OWNERS)
  })
})
