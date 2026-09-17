import { memo, useEffect, useState } from 'react'
import { highlightWithPrism } from '../../prism'
import { sanitizeCodeTokenHtml } from '../../sanitize'
import { codePaletteVars } from '../code-palette'
import type { CodeElement } from '../types'

interface HighlightedCode {
  html: string
  language: string
}

/**
 * A code element is text plus a language, and the language is what turns it into tokens a
 * deck can colour. Prism is loaded per language on demand, so this paints the plain text
 * first and swaps in the highlighted markup when the grammar arrives — a snippet is
 * readable either way, and a language nobody supports simply stays plain.
 *
 * The palette reaches the tokens as custom properties (see code-palette.ts): a deck may
 * recolour its code while the show is open, and the stylesheet names the variables once.
 */
export const SlideCodeBlock = memo(function SlideCodeBlock({
  el,
  palette,
}: {
  el: CodeElement
  palette?: Record<string, string>
}) {
  const [highlighted, setHighlighted] = useState<HighlightedCode | null>(null)

  useEffect(() => {
    let cancelled = false
    setHighlighted(null)
    void highlightWithPrism(el.code, el.lang || 'text').then((result) => {
      if (cancelled || !result) return
      setHighlighted({ html: sanitizeCodeTokenHtml(result.html), language: result.language })
    })
    return () => {
      cancelled = true
    }
  }, [el.code, el.lang])

  return (
    <div
      data-slide-code
      style={codePaletteVars(palette)}
      className='size-full overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-inset)] p-4 font-mono text-sm'
    >
      <div className='mb-2 flex items-center justify-between border-b border-[var(--border-subtle)] pb-1 text-xs text-[var(--text-tertiary)]'>
        <span>{highlighted?.language || el.lang || 'code'}</span>
      </div>
      <pre className='overflow-x-auto text-[var(--text-primary)]'>
        {highlighted ? (
          <code
            className='bento-slide-code'
            dangerouslySetInnerHTML={{ __html: highlighted.html }}
          />
        ) : (
          <code className='bento-slide-code'>{el.code}</code>
        )}
      </pre>
    </div>
  )
})
