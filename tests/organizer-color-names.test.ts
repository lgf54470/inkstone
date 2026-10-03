import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ORGANIZER_COLORS } from '../src/shared/organizer-colors'
import { ORGANIZER_COLOR_MESSAGE_KEYS } from '../src/shared/organizer-colors'
import { EN_US_MESSAGES } from '../src/shared/locales/en-US'
import { ZH_CN_MESSAGES } from '../src/shared/locales/zh-CN'

/**
 * A colour swatch whose accessible name is `#dc2626` tells a screen-reader reader nothing: hex is how the
 * app stores a colour, not how anyone names it, and the same five rows of swatches are repeated across the
 * tag, folder and graph surfaces (G-46). The names live in the locale resources so both languages carry
 * them, and no call site is allowed to fall back to the raw value.
 */
function clientSources(directory = 'src/client', out: string[] = []): string[] {
  for (const entry of fs.readdirSync(path.resolve(directory), { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) clientSources(file, out)
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.')) out.push(file)
  }
  return out
}

describe('an organiser colour is named, not spelled out in hex (G-46)', () => {
  it('gives every palette colour a message key, in both languages', () => {
    expect(ORGANIZER_COLOR_MESSAGE_KEYS).toBeTruthy()
    for (const color of ORGANIZER_COLORS) {
      const key = ORGANIZER_COLOR_MESSAGE_KEYS[color as keyof typeof ORGANIZER_COLOR_MESSAGE_KEYS]
      expect(typeof key).toBe('string')
      expect(key in EN_US_MESSAGES).toBe(true)
      expect(key in ZH_CN_MESSAGES).toBe(true)
    }
  })

  it('names each colour differently, or a reader is told "red" twice', () => {
    const names = ORGANIZER_COLORS.map((color) => ORGANIZER_COLOR_MESSAGE_KEYS[color as keyof typeof ORGANIZER_COLOR_MESSAGE_KEYS])
    expect(new Set(names).size).toBe(ORGANIZER_COLORS.length)
  })

  it('names the swatch at every surface that draws the palette', () => {
    const named = clientSources().flatMap((file) => {
      const text = fs.readFileSync(path.resolve(file), 'utf8')
      return [...text.matchAll(/aria-label=\{(colorName|organizerColorLabel\(color, t\))\}/g)].map(() => path.relative(process.cwd(), file))
    })
    // Five surfaces draw these swatches today: the graph's colour rules, the tag row, the tag and folder
    // submenus, and the folder manager. A sixth that forgot to name itself, or one that stopped, is the bug.
    expect(named.length).toBeGreaterThanOrEqual(5)
    expect(new Set(named).size).toBe(5)
  })

  it('leaves no swatch labelled with its raw hex value', () => {
    // The idiom was `aria-label={color}` / `<Tooltip label={color}>` where `color` is the palette entry.
    const offenders = clientSources().filter((file) => {
      const text = fs.readFileSync(path.resolve(file), 'utf8')
      return /(aria-label|label|title)=\{color\}/.test(text)
    })
    expect(offenders).toEqual([])
  })
})
