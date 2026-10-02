import { describe, expect, it } from 'vitest'
import { formatCode } from './code-formatter'

describe('formatCode - data formats', () => {
  it('formats JSON with proper indentation', () => {
    const raw = '{"a":1,"b":[2,3],"c":{"d":true}}'
    const formatted = formatCode(raw, 'json')
    expect(formatted).toBe('{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ],\n  "c": {\n    "d": true\n  }\n}')
  })

  it('formats YAML code preserving document structure', () => {
    const code = `name: inkstone
version: 1
features:
  - markdown
  - diagrams`
    const formatted = formatCode(code, 'yaml')
    expect(formatted).toContain('name: inkstone')
    expect(formatted).toContain('features:')
    expect(formatted).toContain('  - markdown')
  })

  it('formats TOML code with spaced key-value pairs', () => {
    const code = `[package]
name="inkstone"
version="0.8.0"`
    const formatted = formatCode(code, 'toml')
    expect(formatted).toBe(`[package]
name = "inkstone"
version = "0.8.0"`)
  })
})

describe('formatCode - markup and styles', () => {
  it('formats HTML with proper hierarchy', () => {
    const raw = '<div><p><span>Hello</span></p></div>'
    const formatted = formatCode(raw, 'html')
    expect(formatted).toBe('<div>\n  <p>\n    <span>\n      Hello\n    </span>\n  </p>\n</div>')
  })

  it('formats SQL with uppercase keywords and line breaks', () => {
    const raw = 'select id, name from users where age > 18 order by created_at desc'
    const formatted = formatCode(raw, 'sql')
    expect(formatted).toContain('SELECT id, name')
    expect(formatted).toContain('\nFROM users')
    expect(formatted).toContain('\nWHERE age > 18')
    expect(formatted).toContain('\nORDER BY created_at desc')
  })

  it('formats CSS with indented rules and spaced properties', () => {
    const code = `.box{
color:red;
background:#fff;
}`
    const formatted = formatCode(code, 'css')
    expect(formatted).toBe(`.box {
  color: red;
  background: #fff;
}`)
  })
})

describe('formatCode - declarations and corrupted paste', () => {
  it('formats corrupted single-line JavaScript/TypeScript from paste', () => {
    const compressed = `export function fuzzyMatch(text: string, query: string): FuzzyMatch | null { 
  if (!query) return { score: 0, ranges: [] }
  const haystack = text.toLowerCase() 
  const needle = query.toLowerCase().trim() 
  if (!needle) return { score: 0, ranges: [] }

  const direct = haystack.indexOf(needle) 
  if (direct >= 0) { 
    let score = 1000 - direct * 2 
    if (direct === 0) score += 300 
    else if (isBoundary(haystack, direct)) 
    score += 150 score += Math.max(0, 120 - text.length) return { score, ranges: [[direct, direct + needle.length]] 
  } 
}`

    const formatted = formatCode(compressed, 'javascript')
    expect(formatted).toContain('score += 150')
    expect(formatted).toContain('score += Math.max(0, 120 - text.length)')
    expect(formatted).toContain('return { score, ranges: [[direct, direct + needle.length]]')
    expect(formatted.includes('score += 150 score += Math.max')).toBe(false)
  })

  it('does not split const or let declarations onto separate lines in tsx/ts', () => {
    const code = `const name = 'Inkstone'
const age=45
console.log(\`Hello, \${name}!\`)`

    const formatted = formatCode(code, 'tsx')
    expect(formatted).toBe(`const name = 'Inkstone'
const age = 45
console.log(\`Hello, \${name}!\`)`)
  })

  it('formats code when language parameter includes fence attributes or colons', () => {
    const code = `const name = 'Inkstone'\nconst age=45\nconsole.log(\`Hello, \${name}!\`)`
    const formattedWithAttrs = formatCode(code, 'ts title="hello.ts" line-numbers {2}')
    expect(formattedWithAttrs).toContain('const age = 45')

    const formattedWithColon = formatCode(code, 'ts:hello.ts')
    expect(formattedWithColon).toContain('const age = 45')

    const formattedWithBrackets = formatCode(code, 'ts[hello.ts]')
    expect(formattedWithBrackets).toContain('const age = 45')

    const formattedWithDot = formatCode(code, '.ts')
    expect(formattedWithDot).toContain('const age = 45')
  })
})

describe('formatCode - tsx and systems code', () => {
  it('formats TSX elements and properties properly', () => {
    const code = `export function Card() {
return <div className="card"><span>Inkstone</span></div>
}`
    const formatted = formatCode(code, 'tsx')
    expect(formatted).toContain('export function Card() {')
    expect(formatted).toContain('return <div className="card"><span>Inkstone</span></div>')
    expect(formatted).toContain('}')
  })

  it('formats Go and Rust code with brace indentation', () => {
    const goCode = `package main

func main() {
fmt.Println("hello")
}`
    const formattedGo = formatCode(goCode, 'go')
    expect(formattedGo).toContain('func main() {')
    expect(formattedGo).toContain('  fmt.Println("hello")')

    const rustCode = `fn main() {
let mut count = 0;
count += 1;
}`
    const formattedRust = formatCode(rustCode, 'rust')
    expect(formattedRust).toContain('fn main() {')
    expect(formattedRust).toContain('  let mut count = 0;')
    expect(formattedRust).toContain('  count += 1;')
  })
})

describe('formatCode - python and shell scripts', () => {
  it('formats Python code with indentation and operator spacing', () => {
    const code = `def calculate(a,b):
if a>b:
return a
else:
return b`
    const formatted = formatCode(code, 'python')
    expect(formatted).toBe(`def calculate(a, b):
  if a > b:
    return a
  else:
    return b`)
  })

  it('formats Shell scripts with indented control flow', () => {
    const code = `if [ "$flag" = "true" ]; then
echo "enabled"
else
echo "disabled"
fi`
    const formatted = formatCode(code, 'bash')
    expect(formatted).toBe(`if [ "$flag" = "true" ]; then
  echo "enabled"
else
  echo "disabled"
fi`)
  })
})

describe('formatCode - lua and ruby scripts', () => {
  it('formats Lua functions and blocks', () => {
    const code = `function greet(name)
if name then
print("hi")
end
end`
    const formatted = formatCode(code, 'lua')
    expect(formatted).toBe(`function greet(name)
  if name then
    print("hi")
  end
end`)
  })

  it('formats Ruby definitions and blocks', () => {
    const code = `def greet(name)
if name
puts "hi"
end
end`
    const formatted = formatCode(code, 'ruby')
    expect(formatted).toBe(`def greet(name)
  if name
    puts "hi"
  end
end`)
  })
})

describe('formatCode - docker, diagrams and diffs', () => {
  it('formats Dockerfile instructions into uppercase', () => {
    const code = `from node:20-alpine
workdir /app
copy . .
run npm install`
    const formatted = formatCode(code, 'dockerfile')
    expect(formatted).toBe(`FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install`)
  })

  it('formats Mermaid diagrams with block indentation', () => {
    const code = `graph TD
subgraph Core
A --> B
end`
    const formatted = formatCode(code, 'mermaid')
    expect(formatted).toBe(`graph TD
  subgraph Core
    A --> B
  end`)
  })

  it('preserves unified diff markers without alteration', () => {
    const code = `--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,3 @@
-old line
+new line
 context`
    const formatted = formatCode(code, 'diff')
    expect(formatted).toBe(code)
  })

  it('handles empty or whitespace strings gracefully', () => {
    expect(formatCode('', 'typescript')).toBe('')
    expect(formatCode('   \n  \n  ', 'typescript')).toBe('   \n  \n  ')
  })
})

describe('formatCode - string literals and multiline preservation', () => {
  it('preserves spaces inside string literals in tsx/ts', () => {
    const code = 'const text = "Hello       world"'
    expect(formatCode(code, 'typescript')).toBe('const text = "Hello       world"')
  })

  it('preserves multiline template literals in tsx/ts', () => {
    const code = 'const query = `\n  SELECT *\n  FROM users\n  WHERE id = 1\n`'
    expect(formatCode(code, 'typescript')).toBe(code)
  })

  it('does not corrupt python multiline dictionaries', () => {
    const code = 'config = {\n    "host": "localhost",\n    "port": 8080\n}'
    const formatted = formatCode(code, 'python')
    expect(formatted).toContain('  "host": "localhost"')
    expect(formatted).toContain('  "port": 8080')
    const formatted4 = formatCode(code, 'python', 4)
    expect(formatted4).toContain('    "host": "localhost"')
    expect(formatted4).toContain('    "port": 8080')
  })

  it('does not increase shell indentation on echo "do"', () => {
    const code = 'echo "do"\necho "indented?"'
    const formatted = formatCode(code, 'bash')
    expect(formatted).toBe('echo "do"\necho "indented?"')
  })

  it('preserves inline html elements and does not break on script tags', () => {
    const code = '<p>Hello <b>world</b> and <i>everyone</i>!</p>'
    const formatted = formatCode(code, 'html')
    expect(formatted).toBe('<p>Hello <b>world</b> and <i>everyone</i>!</p>')

    const scriptCode = '<script>\n  if (a < b && c > d) {\n    console.log("yes")\n  }\n</script>'
    const formattedScript = formatCode(scriptCode, 'html')
    expect(formattedScript).toBe(scriptCode)
  })
})

describe('formatCode - language generics, sql and systems code', () => {
  it('formats TypeScript generics without breaking on angle brackets', () => {
    const code = 'const map = new Map<string, number>()\nconst isValid = a < b && c > d'
    const formatted = formatCode(code, 'typescript')
    expect(formatted).toContain('const map = new Map<string, number>()')
    expect(formatted).toContain('const isValid = a < b && c > d')
  })

  it('protects dotted identifiers and keywords in SQL', () => {
    const code = 'SELECT users.offset, users.set FROM users WHERE id = 1'
    const formatted = formatCode(code, 'sql')
    expect(formatted).toBe('SELECT users.offset, users.set\nFROM users\nWHERE id = 1')
  })

  it('formats C++ stream operators and namespace delimiters', () => {
    const code = 'std::cout << "hello" << std::endl;'
    const formatted = formatCode(code, 'cpp')
    expect(formatted).toContain('std::cout << "hello" << std::endl;')
  })

  it('formats mindmap and slides blocks gracefully', () => {
    const mindmapCode = '# Central Topic\n## Subtopic 1\n## Subtopic 2'
    const formattedMindmap = formatCode(mindmapCode, 'mindmap')
    expect(formattedMindmap).toBe(mindmapCode)

    const slidesCode = '# Slide 1\nContent 1\n---\n# Slide 2\nContent 2'
    const formattedSlides = formatCode(slidesCode, 'bento-slides')
    expect(formattedSlides).toBe(slidesCode)
  })
})


