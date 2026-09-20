import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * SH-34: the share UI drew English-only literals ('PV', 'CUSTOM', 'Untitled
 * note', machine fallback tokens) straight into the page, and the worker
 * baked 'Untitled note' into visit rows instead of reporting the missing
 * note to the client. Every user-visible string must go through i18n
 * message ids, so these banned substrings must not reappear.
 */
const CLIENT_SHARE_DIR = path.join('src', 'client', 'features', 'share')
const WORKER_SHARE_DIR = path.join('src', 'worker', 'routes', 'share')

const CLIENT_BANS = [
  "{'PV'}",
  "{'UV'}",
  "{'CUSTOM'}",
  "'TOP 10'",
  "'Untitled note'",
  "|| 'Bot'",
  "|| 'Unknown'",
  "|| 'Other'",
  "|| 'other'",
  "= 'zh-CN'",
]

// Worker aggregate buckets keep machine tokens on purpose (they are Map keys
// the client localizes via share-helpers); only the row-level title fallback
// is banned here.
const WORKER_BANS = ["'Untitled note'"]

// The public reader page renders without the app's i18n runtime; its title
// fallback is tracked outside SH-34.
const WORKER_ALLOWLIST = ['public.ts']

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

function scan(dir: string, bans: string[], skip: string[] = []): string[] {
  const violations: string[] = []
  for (const file of sourceFiles(dir)) {
    if (skip.some((name) => file.endsWith(name))) continue
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, index) => {
      const banned = bans.find((needle) => line.includes(needle))
      if (banned) violations.push(`${file}:${index + 1}: ${banned}`)
    })
  }
  return violations
}

describe('share draws no bare English literals (SH-34)', () => {
  it('scans a non-empty share source set on both sides', () => {
    expect(sourceFiles(CLIENT_SHARE_DIR).length).toBeGreaterThan(10)
    expect(sourceFiles(WORKER_SHARE_DIR).length).toBeGreaterThan(5)
  })

  it('keeps the client share feature free of hardcoded display strings', () => {
    expect(scan(CLIENT_SHARE_DIR, CLIENT_BANS)).toEqual([])
  })

  it('keeps worker share routes free of the baked-in title fallback', () => {
    expect(scan(WORKER_SHARE_DIR, WORKER_BANS, WORKER_ALLOWLIST)).toEqual([])
  })
})
