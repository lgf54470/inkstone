import Prism from './prism-setup.ts'
import 'prismjs/components/prism-typescript.js'
import 'prismjs/components/prism-jsx.js'
import 'prismjs/components/prism-tsx.js'
import 'prismjs/components/prism-json.js'
import 'prismjs/components/prism-bash.js'
import 'prismjs/components/prism-python.js'
import 'prismjs/components/prism-markdown.js'
import 'prismjs/components/prism-yaml.js'
import 'prismjs/components/prism-sql.js'
import 'prismjs/components/prism-rust.js'
import 'prismjs/components/prism-go.js'

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
