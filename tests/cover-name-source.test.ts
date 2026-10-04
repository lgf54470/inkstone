import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * N-14: the cover's accessible name comes from the message resources, and no rendered-string
 * comparison can prove that in a test — under the test locale `t('workspace.presentation_blackout')`
 * answers with the very English word the source used to hardcode, so the assertion holds either way.
 * The rule therefore reads the source: the cover surface names itself with a message id, the same way
 * every other control in the module does.
 */
const COVER_SOURCE = 'src/client/features/presentation/presentation-stage.tsx'
const source = fs.readFileSync(COVER_SOURCE, 'utf8')

describe('the screen cover names itself from the resources', () => {
  it('reads the label through the message helper', () => {
    expect(source).toContain("aria-label={t(cover === 'black' ? 'workspace.presentation_blackout' : 'workspace.presentation_whiteout')}")
  })

  it('carries no hard-coded cover word to show a reader', () => {
    expect(source).not.toMatch(/aria-label=\{?[^}]*'[A-Z][a-z]+/)
    expect(source).not.toMatch(/'(?:Blackout|Whiteout)'/)
  })
})
