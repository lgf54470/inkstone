import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(process.cwd(), 'src')
const LOCALES = join(ROOT, 'shared/locales')

function sourceFiles(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      sourceFiles(path, found)
    } else if (/\.(ts|tsx)$/.test(entry.name)) found.push(path)
  }
  return found
}

// Every key a locale carries is a promise that some surface speaks it. A key nothing reads is
// dead weight that also hides the controls which were designed and never wired up.
describe('music locale keys are all spoken', () => {
  it('leaves no music key unreferenced outside the locale files', () => {
    const keys = [...readFileSync(join(LOCALES, 'zh-CN/music.ts'), 'utf8')
      .matchAll(/^'(music\.[a-z0-9_]+)':/gm)].map((match) => match[1]!)
    expect(keys.length).toBeGreaterThan(200)

    const haystack = sourceFiles(ROOT)
      .filter((path) => !path.startsWith(LOCALES))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n')

    expect(keys.filter((key) => !haystack.includes(key))).toEqual([])
  })
})
