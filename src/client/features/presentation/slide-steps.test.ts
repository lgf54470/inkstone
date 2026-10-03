import { describe, expect, it } from 'vitest'
import { takeStepDirective } from './slides'

// N-31: the author's other switch. A slide that says `<!-- steps -->` reveals its blocks one at a time
// instead of arriving whole, and the line is taken out of the slide the way the layout switch is — a
// comment left in the body would paint as a stray node on the projector.
describe('takeStepDirective', () => {
  it('reads the switch and takes its line out of the body', () => {
    expect(takeStepDirective('<!-- steps -->\n\n# A\n\nOne\n\nTwo')).toEqual({ body: '# A\n\nOne\n\nTwo', steps: true })
  })

  it('is the same switch spelled either way', () => {
    expect(takeStepDirective('<!--STEPS-->\n\n# A').steps).toBe(true)
  })

  it('leaves a slide that asked for nothing alone', () => {
    const source = '# A\n\nOne'
    expect(takeStepDirective(source)).toEqual({ body: source, steps: false })
  })

  it('does not read a switch demoed inside a fenced block', () => {
    const source = '# A\n\n```\n<!-- steps -->\n```'
    expect(takeStepDirective(source)).toEqual({ body: source, steps: false })
  })

  it('takes the switch from anywhere in the slide, blank line and all', () => {
    expect(takeStepDirective('# A\n\nOne\n\n<!-- steps -->\n\nTwo').body).toBe('# A\n\nOne\n\nTwo')
  })
})
