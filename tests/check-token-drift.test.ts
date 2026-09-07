import { describe, expect, it } from 'vitest'
import { driftProblems, normalizeName, normalizeValue, resolveVars, snapshotPayload, staleProblems, tokenEntries } from '../scripts/check-token-drift.mjs'

describe('token name/value extraction', () => {
  it('normalizes CSS-escaped token names', () => {
    expect(normalizeName(String.raw`--text-13\.5`)).toBe('--text-13.5')
    expect(normalizeName(String.raw`--sp-0\25`)).toBe('--sp-0%')
  })

  it('collapses whitespace in values', () => {
    expect(normalizeValue('  0 1px  2px,\n    oklch(0% 0 0 / 5%)  ')).toBe('0 1px 2px, oklch(0% 0 0 / 5%)')
  })

  it('extracts name/value pairs from declarations', () => {
    const entries = tokenEntries(String.raw`:root { --sp-0\.5: 2px; --tracking-label: 0.06em; }
--accent: var(--accent-cinnabar);`)
    expect(entries.get('--sp-0.5')).toBe('2px')
    expect(entries.get('--tracking-label')).toBe('0.06em')
    expect(entries.get('--accent')).toBe('var(--accent-cinnabar)')
  })

  it('resolves var() references against the same stylesheet', () => {
    const entries = new Map([['--alias', 'oklch(54% 0.15 30)']])
    expect(resolveVars('var(--alias)', entries)).toBe('oklch(54% 0.15 30)')
    expect(resolveVars('var(--unknown)', entries)).toBe('var(--unknown)')
    expect(resolveVars('var(--self)', new Map([['--self', 'var(--self)']]))).toBe('var(--self)')
  })

  it('resolves chained and cyclic var() references at extraction', () => {
    const entries = tokenEntries(':root { --c: 1px; --b: var(--c); --a: var(--b); --loop-x: var(--loop-y); --loop-y: var(--loop-x); }')
    expect(entries.get('--a')).toBe('1px')
    expect(entries.get('--loop-x')).toBe('var(--loop-y)')
  })
})

describe('snapshot payload', () => {
  it('intersects both trees and records per-side values', () => {
    const app = tokenEntries(':root { --a: 1px; --b: 2px; }')
    const blog = tokenEntries(':root { --a: 1px; --c: 3px; }')
    const payload = snapshotPayload(app, blog)
    expect(payload.tokens).toEqual(['--a'])
    expect(payload.values['--a']).toEqual({ app: '1px', blog: '1px' })
  })
})

describe('drift detection', () => {
  const app = tokenEntries(':root { --a: 1px; --b: 2px; --z: 30; }')
  const blog = tokenEntries(':root { --a: 1px; --b: 2px; --z: 1; }')
  const baseline = {
    tokens: ['--a', '--b', '--z'],
    values: {
      '--a': { app: '1px', blog: '1px' },
      '--b': { app: '2px', blog: '2px' },
      '--z': { app: '30', blog: '1' },
    },
  }

  it('passes when values match the baseline pair', () => {
    expect(driftProblems(app, blog, baseline)).toEqual([])
  })

  it('flags a token vanished from one tree', () => {
    const appMissing = tokenEntries(':root { --a: 1px; }')
    expect(driftProblems(appMissing, blog, baseline).some((p) => p.includes('--b missing'))).toBe(true)
  })

  it('flags a unilateral value change', () => {
    const appChanged = tokenEntries(':root { --a: 1px; --b: 9px; --z: 30; }')
    expect(driftProblems(appChanged, blog, baseline).some((p) => p.includes('--b value drifted'))).toBe(true)
  })

  it('treats a var()-alias spelling change as no drift', () => {
    const appSpelled = tokenEntries(':root { --alias: 1px; --a: var(--alias); --b: 2px; --z: 30; }')
    const blogSpelled = tokenEntries(':root { --a: 1px; --b: 2px; --z: 1; }')
    expect(driftProblems(appSpelled, blogSpelled, baseline)).toEqual([])
  })

  it('flags a value change on the other side', () => {
    const blogChanged = tokenEntries(':root { --a: 1px; --b: 2px; --z: 10; }')
    expect(driftProblems(app, blogChanged, baseline).some((p) => p.includes('--z value drifted'))).toBe(true)
  })

  it('flags an identical change to both sides against the snapshot', () => {
    const appBoth = tokenEntries(':root { --a: 1px; --b: 7px; --z: 30; }')
    const blogBoth = tokenEntries(':root { --a: 1px; --b: 7px; --z: 1; }')
    expect(driftProblems(appBoth, blogBoth, baseline).some((p) => p.includes('--b value drifted'))).toBe(true)
  })

  it('falls back to cross-tree comparison when the baseline has no values', () => {
    const legacy = { tokens: ['--z'] }
    expect(driftProblems(app, blog, legacy).some((p) => p.includes('--z value differs'))).toBe(true)
  })
})

describe('staleness detection', () => {
  const app = tokenEntries(':root { --a: 1px; --b: 2px; }')
  const blog = tokenEntries(':root { --a: 1px; --b: 2px; }')
  const baseline = {
    tokens: ['--a'],
    values: { '--a': { app: '1px', blog: '1px' } },
  }

  it('flags a token newly shared by both trees', () => {
    expect(staleProblems(app, blog, baseline).some((p) => p.includes('--b added to both trees'))).toBe(true)
  })

  it('passes when the baseline records every shared token', () => {
    const current = {
      tokens: ['--a', '--b'],
      values: {
        '--a': { app: '1px', blog: '1px' },
        '--b': { app: '2px', blog: '2px' },
      },
    }
    expect(staleProblems(app, blog, current)).toEqual([])
  })
})