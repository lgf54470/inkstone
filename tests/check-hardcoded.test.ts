import { describe, expect, it } from 'vitest'
import { arbitraryUnitProblems, problemsFor } from '../scripts/check-hardcoded.mjs'

describe('arbitrary-value unit scan', () => {
  it('flags raw px values in brackets', () => {
    expect(arbitraryUnitProblems('w-[240px]')).toEqual(['240px'])
  })

  it('flags .06em tracking', () => {
    expect(arbitraryUnitProblems('tracking-[.06em]')).toEqual(['.06em'])
  })

  it('flags raw values in arbitrary properties', () => {
    expect(arbitraryUnitProblems('[width:240px] [--scroll-offset:56px]')).toEqual(['240px', '56px'])
  })

  it('flags raw values in named-group parens', () => {
    expect(arbitraryUnitProblems('w-(240px)')).toEqual(['240px'])
  })

  it('exempts token references, math and color functions', () => {
    expect(arbitraryUnitProblems('w-[var(--w-side)] w-(--spacing-4) bg-(--brand/50) text-(length:--my-var)')).toEqual([])
    expect(arbitraryUnitProblems('w-[calc(100%-1rem)] min-h-[min(100vh,600px)]')).toEqual([])
    expect(arbitraryUnitProblems('bg-[oklch(50%_0.1_200)]')).toEqual([])
  })

  it('exempts canonical numbers like 1px', () => {
    expect(arbitraryUnitProblems('gap-[1px]')).toEqual([])
  })

  it('does not double-report units nested in exempt brackets', () => {
    expect(arbitraryUnitProblems('w-[calc(100%-1rem)]')).toEqual([])
  })

  it('flags every unit in a multi-class string', () => {
    expect(arbitraryUnitProblems('h-[13px] w-[86%]')).toEqual(['13px', '86%'])
  })
})

describe('class-string loopholes via problemsFor', () => {
  const rel = 'probe.tsx'

  it('flags ternary class strings inside cn()', () => {
    const problems = problemsFor(rel, `function Probe() { return <div className={cn(cond ? 'w-[2px]' : 'w-4')}/> }`)
    expect(problems.join('\n')).toContain('raw 2px')
  })

  it('flags class strings produced by a helper call', () => {
    const problems = problemsFor(rel, `function Probe() { return <div className={makeClass('w-[240px]')}/> }`)
    expect(problems.join('\n')).toContain('raw 240px')
  })

  it('exempts a direct const class table for one-off families', () => {
    const problems = problemsFor(rel, `const GRID = 'grid-cols-[140px_1fr_28px]'\nconst el = <div className={GRID}/>`)
    expect(problems).toEqual([])
  })

  it('closes the arrow-function loophole inside a named initializer', () => {
    const problems = problemsFor(rel, `const cls = cn((() => 'w-[2px]')())`)
    expect(problems.join('\n')).toContain('raw 2px')
  })

  it('exempts bare-variable paren groups in class names', () => {
    const problems = problemsFor(rel, `function Probe() { return <div className='w-(--spacing-4) bg-(--brand/50)'/> }`)
    expect(problems).toEqual([])
  })

  it('flags paren raw values in class names', () => {
    const problems = problemsFor(rel, `function Probe() { return <div className='w-(240px)'/> }`)
    expect(problems.join('\n')).toContain('raw 240px')
  })

  it('flags clsx conditional-object keys in cn()', () => {
    const problems = problemsFor(rel, `function Probe() { return <div className={cn({ 'w-[240px]': cond })}/> }`)
    expect(problems.join('\n')).toContain('raw 240px')
  })

  it('exempts token-referencing conditional-object keys', () => {
    const problems = problemsFor(rel, `function Probe() { return <div className={cn({ 'w-[var(--w-side)]': cond })}/> }`)
    expect(problems).toEqual([])
  })

  it('accepts the hoisted-const rewrite of conditional classes', () => {
    const problems = problemsFor(rel, `const GRID = 'grid-cols-[140px_1fr_28px]'\nfunction Probe() { return <div className={cn(cond && GRID)}/> }`)
    expect(problems).toEqual([])
  })
})

describe('tracking token family via problemsFor', () => {
  const rel = 'probe.tsx'

  it('flags a raw tracking value even inside a named constant table', () => {
    const problems = problemsFor(rel, `const T = 'tracking-[0.07em]'`)
    expect(problems.join('\n')).toContain('raw letter-spacing in tracking-[0.07em]')
  })

  it('accepts a token-referencing tracking constant', () => {
    const problems = problemsFor(rel, `const T = 'tracking-[var(--tracking-section)]'`)
    expect(problems).toEqual([])
  })

  it('flags inline raw tracking class names', () => {
    const problems = problemsFor(rel, `function Probe() { return <div className='tracking-[0.06em]'/> }`)
    expect(problems.join('\n')).toContain('raw letter-spacing in tracking-[0.06em]')
  })

  it('flags raw tracking keys in clsx conditional objects', () => {
    const problems = problemsFor(rel, `function Probe() { return <div className={cn({ 'tracking-[0.06em]': cond })}/> }`)
    expect(problems.join('\n')).toContain('raw letter-spacing in tracking-[0.06em]')
  })
})

describe('token-family rule (Part 4) via problemsFor', () => {
  const rel = 'probe.tsx'

  it('flags a raw font size even inside a named constant table', () => {
    const problems = problemsFor(rel, `const T = 'text-[13px]'`)
    expect(problems.join('\n')).toContain('raw font-size in text-[13px]')
  })

  it('flags raw spacing even inside a named constant table', () => {
    const problems = problemsFor(rel, `const W = 'w-[2.5px]'`)
    expect(problems.join('\n')).toContain('raw spacing in w-[2.5px]')
  })

  it('flags every family prefix in a multi-class constant', () => {
    const problems = problemsFor(rel, `const C = 'h-[13px] max-w-[290px] py-[4px]'`)
    const text = problems.join('\n')
    expect(text).toContain('raw spacing in h-[13px]')
    expect(text).toContain('raw spacing in max-w-[290px]')
    expect(text).toContain('raw spacing in py-[4px]')
  })

  it('flags rem values in the spacing family', () => {
    const problems = problemsFor(rel, `const R = 'w-[2.5rem]'`)
    expect(problems.join('\n')).toContain('raw spacing in w-[2.5rem]')
  })

  it('accepts token-referencing font-size constants', () => {
    expect(problemsFor(rel, `const T = 'text-[length:var(--text-13)]'`)).toEqual([])
    expect(problemsFor(rel, `const T = 'text-(--text-13)'`)).toEqual([])
  })

  it('accepts token-referencing spacing constants', () => {
    expect(problemsFor(rel, String.raw`const W = 'w-[var(--sp-0\\.625)]'`)).toEqual([])
    expect(problemsFor(rel, `const W = 'w-(--spacing-4)'`)).toEqual([])
  })

  it('accepts relative percentages in named constants', () => {
    expect(problemsFor(rel, `const W = 'max-w-[86%]'`)).toEqual([])
    expect(problemsFor(rel, `const H = 'top-[-22%]'`)).toEqual([])
  })

  it('accepts one-off class families in named constants', () => {
    expect(problemsFor(rel, `const G = 'grid-cols-[140px_1fr_28px]'`)).toEqual([])
    expect(problemsFor(rel, `const B = 'blur-[120px]'`)).toEqual([])
  })

  it('keeps the hairline exemption in named constants', () => {
    expect(problemsFor(rel, `const H = 'gap-[1px]'`)).toEqual([])
  })
})