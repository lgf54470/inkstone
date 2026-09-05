import { useEffect, useRef } from 'react';
import { decorateCodeBlock } from '../../../lib/markdown/enhance';
import { highlightWithPrism } from '../../../lib/markdown/prism';

export function CodeViewer({ code, ext }: { code: string; ext: string }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    const block = root.querySelector<HTMLElement>('.code-block')
    const codeEl = block?.querySelector<HTMLElement>('code')
    if (!block || !codeEl) return

    codeEl.textContent = code
    codeEl.className = ''
    decorateCodeBlock(block)

    let isCancelled = false
    void (async () => {
      const highlighted = await highlightWithPrism(code, ext)
      if (isCancelled) return
      if (highlighted) {
        codeEl.innerHTML = highlighted.html
        codeEl.className = `language-${highlighted.language}`
        decorateCodeBlock(block)
      }
    })()
      .catch(() => {})

    return () => {
      isCancelled = true
    }
  }, [code, ext])

  return (
    <div ref={containerRef} className="ink-prose select-text w-full">
      <div
        className="code-block has-line-numbers rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-inset)] overflow-hidden"
        data-lang={ext}
        data-code-start="1"
        data-line-numbers="true"
      >
        <pre className="p-3 m-0 overflow-x-auto font-mono text-[length:var(--text-12\.5)] leading-relaxed">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  )
}

