import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The slide markup cache holds two different things under one key: the plain render a page gets
 * while it is being prepared, and the prepared page itself. Which of the two an entry is decides
 * whether a surface asks for the drawings again — so a writer that does not say which it wrote is
 * how a page ends up holding a diagram placeholder for the rest of a talk, with nothing left to
 * fill it in.
 *
 * `useSlideHtml` is the reader of that distinction (`slide-canvas.tsx` and the slide list render
 * whatever the cache holds), and this keeps a fourth writer from being added without one.
 */
const CLIENT_ROOT = path.resolve('src/client')
const PLAIN = 'slideMarkup('
const PREPARED = 'prepared: true'
// A re-serialising writer inherits the state of the entry it read rather than naming one: the
// preflight's capture may only carry `prepared` over, never claim it (L-1) — which is why both spread
// forms are the named states and a bare `{ html }` write would not pass.
const INHERITED = ['...staged', '...markup']

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.(ts|tsx)$/.test(entry.name)) return []
    return [full]
  })
}

function cacheWrites(): { file: string; line: string }[] {
  return sourceFiles(CLIENT_ROOT).flatMap((file) => {
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    return lines
      .filter((line) => line.includes('rememberSlideHtml(') && !line.trimStart().startsWith('export function') && !line.includes('import'))
      .map((line) => ({ file: path.relative(CLIENT_ROOT, file), line: line.trim() }))
  })
}

describe('slide markup cache writes', () => {
  it('sees every writer, so the check cannot pass by finding nothing', () => {
    const files = [...new Set(cacheWrites().map((write) => write.file))].sort()
    expect(files).toEqual([
      'features/presentation/slide-html.ts',
      'features/presentation/slide-preflight.tsx',
      'features/presentation/use-slide-html.ts',
    ])
    expect(cacheWrites()).toHaveLength(4)
  })

  it('names which of the two states each writer leaves under the key', () => {
    const silent = cacheWrites()
      .filter((write) => !write.line.includes(PLAIN) && !write.line.includes(PREPARED) && !INHERITED.some((form) => write.line.includes(form)))
      .map((write) => `${write.file}: ${write.line}`)
    expect(silent).toEqual([])
  })
})
