import Prism from 'prismjs'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-tsx'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-markdown'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-rust'
import 'prismjs/components/prism-go'

export function highlightCode(code: string, rawLang: string): string {
  if (!rawLang) return ''
  const lang = rawLang.toLowerCase()

  const map: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    sh: 'bash',
    shell: 'bash',
    zsh: 'bash',
    py: 'python',
    md: 'markdown',
    yml: 'yaml',
    rs: 'rust',
    golang: 'go',
    html: 'markup',
    xml: 'markup',
    svg: 'markup',
  }

  const normalizedLang = map[lang] || lang
  const grammar = Prism.languages[normalizedLang]
  if (grammar) {
    try {
      return Prism.highlight(code, grammar, normalizedLang)
    } catch (e) {
      console.warn('Prism highlight error:', e)
    }
  }
  return ''
}
