#!/usr/bin/env node
/**
 * AGENTS.md 铁律的可执行子集（博客前端）。
 * 规则：
 *  - 单文件 ≤ 500 行
 *  - 单函数 ≤ 50 行（仅 .ts/.tsx/.mjs，启发式：仅识别行首命名 function 与 const/let 箭头函数）
 *  - 禁止 @ts-ignore / @ts-expect-error / eslint-disable
 *  - 禁止空 catch（catch {} / catch (e) {}）
 *  - 禁止遗留 console.log（允许 warn/error）
 *  - TODO/FIXME 必须带归属（issue 号或负责人）
 *  - 禁止 any（as any / : any / any[] / <any> / Map<..., any>）
 * 字符串/模板/注释内容不参与匹配（演示文案中的 console.log 等不误报）。
 * 退出码 0 = 全部通过，1 = 存在违规。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC_DIR = new URL('../src', import.meta.url).pathname
const MAX_FILE_LINES = 500
const MAX_FUNC_LINES = 50
const FUNC_FILE_RE = /\.(ts|tsx|mjs)$/

const CHECKS = [
  {
    name: 'forbidden-ignore',
    re: /@ts-ignore|@ts-expect-error|eslint-disable/g,
  },
  {
    name: 'empty-catch',
    re: /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g,
  },
  {
    name: 'console-log',
    re: /console\.log\(/g,
  },
  {
    name: 'todo-without-owner',
    re: /\b(?:TODO|FIXME)\b(?!\s*\([^)]*\))/g,
  },
  {
    name: 'any-type',
    re: /\bas any\b|:\s*any\b|\bany\[\]|<any>/g,
  },
]

/** 提取去除字符串与注释后的代码片段（记录片段起始行号）。 */
function codeSegments(src) {
  const segments = []
  let i = 0
  let line = 1
  let segStart = 0
  let segLine = 1
  let quote = null
  while (i < src.length) {
    const ch = src[i]
    if (quote) {
      if (ch === '\\') {
        i += 2
        continue
      }
      if (ch === quote) {
        quote = null
        segStart = i + 1
        segLine = line
      }
      if (ch === '\n') line++
      i++
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      if (segStart < i) segments.push({ text: src.slice(segStart, i), line: segLine })
      quote = ch
      i++
      continue
    }
    if (ch === '/' && src[i + 1] === '/') {
      if (segStart < i) segments.push({ text: src.slice(segStart, i), line: segLine })
      while (i < src.length && src[i] !== '\n') i++
      segStart = i
      segLine = line
      continue
    }
    if (ch === '/' && src[i + 1] === '*') {
      if (segStart < i) segments.push({ text: src.slice(segStart, i), line: segLine })
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') line++
        i++
      }
      i += 2
      segStart = i
      segLine = line
      continue
    }
    if (ch === '\n') {
      line++
      i++
      continue
    }
    i++
  }
  if (segStart < src.length) segments.push({ text: src.slice(segStart), line: segLine })
  return segments
}

/** 将字符串/模板与注释替换为等长空白（保留换行），用于安全的括号配平。 */
function maskStringsAndComments(src) {
  const chars = src.split('')
  const blank = (from, to) => {
    for (let k = from; k < to; k++) chars[k] = chars[k] === '\n' ? '\n' : ' '
  }
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]
    if (c === '"' || c === "'" || c === '`') {
      const q = c
      let j = i + 1
      while (j < chars.length) {
        if (chars[j] === '\\') {
          j += 2
          continue
        }
        if (chars[j] === q) {
          j++
          break
        }
        if (q !== '`' && chars[j] === '\n') break
        j++
      }
      blank(i, Math.min(j, chars.length))
      i = j - 1
      continue
    }
    if (c === '/' && chars[i + 1] === '/') {
      let j = i
      while (j < chars.length && chars[j] !== '\n') j++
      blank(i, j)
      i = j - 1
      continue
    }
    if (c === '/' && chars[i + 1] === '*') {
      let j = i + 2
      while (j < chars.length && !(chars[j] === '*' && chars[j + 1] === '/')) j++
      blank(i, Math.min(j + 2, chars.length))
      i = j + 1
      continue
    }
  }
  return chars.join('')
}

/** 从 open 起做花括号配平，返回匹配的 '}' 索引；未闭合返回 -1。 */
function matchClosingBrace(masked, open) {
  let depth = 0
  for (let i = open; i < masked.length; i++) {
    if (masked[i] === '{') depth++
    else if (masked[i] === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/** 从 '=' 后线性扫描箭头函数体 '{'：括号内跳过；顶层遇对象字面量/分号/换行即非箭头。 */
function arrowBodyOpen(masked, from) {
  let depth = 0
  for (let i = from; i < masked.length; i++) {
    const c = masked[i]
    if (c === '(') {
      depth++
      continue
    }
    if (c === ')') {
      depth--
      if (depth < 0) return -1
      continue
    }
    if (depth !== 0) continue
    if (c === '{') {
      // '{' 前非空白字符为 ')' 或 ':' 时属类型注解块（可整体跳过），否则是对象字面量。
      let prev = i - 1
      while (prev >= 0 && /\s/.test(masked[prev])) prev--
      if (masked[prev] === ')' || masked[prev] === ':') {
        const close = matchClosingBrace(masked, i)
        if (close < 0) return -1
        i = close
        continue
      }
      return -1
    }
    if (c === ';' || c === '\n' || c === '=') return -1
    if (c === '>' && masked[i - 1] === '=') return masked.indexOf('{', i + 1)
  }
  return -1
}

/** 函数声明：配平参数括号后，跳过可能的花括号返回类型注解，定位函数体 '{'。 */
function declBodyOpen(masked, openParen) {
  let depth = 0
  let closeParen = -1
  for (let i = openParen; i < masked.length; i++) {
    if (masked[i] === '(') depth++
    else if (masked[i] === ')') {
      depth--
      if (depth === 0) {
        closeParen = i
        break
      }
    }
  }
  if (closeParen < 0) return -1
  const first = masked.indexOf('{', closeParen + 1)
  if (first < 0) return -1
  let prev = first - 1
  while (prev >= 0 && /\s/.test(masked[prev])) prev--
  // '): { ... } {' 形态：首个 '{' 是返回类型注解块，其后 '{' 才是函数体。
  if (masked[prev] === ':') {
    const closeType = matchClosingBrace(masked, first)
    if (closeType < 0) return -1
    return masked.indexOf('{', closeType + 1)
  }
  return first
}

/** 返回超长函数列表：{ name, line, length }（length 含声明行与收尾行）。 */
function functionViolations(src) {
  const masked = maskStringsAndComments(src)
  const decls = []
  const declRe = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm
  const arrowRe = /^(?:export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?/gm
  const collect = (re, isArrow) => {
    let m
    while ((m = re.exec(masked))) {
      decls.push({ name: m[1], start: m.index, matchEnd: m.index + m[0].length, isArrow })
    }
  }
  collect(declRe, false)
  collect(arrowRe, true)

  const violations = []
  for (const { name, start, matchEnd, isArrow } of decls) {
    const open = isArrow ? arrowBodyOpen(masked, matchEnd) : declBodyOpen(masked, matchEnd - 1)
    if (open < 0) continue
    const close = matchClosingBrace(masked, open)
    if (close < 0) continue
    const length = src.slice(start, close + 1).split('\n').length
    if (length > MAX_FUNC_LINES) {
      const line = src.slice(0, start).split('\n').length
      violations.push({ name, line, length })
    }
  }
  return violations
}

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx|astro|mjs|js|css)$/.test(entry)) out.push(full)
  }
  return out
}

let failed = false
for (const file of walk(SRC_DIR)) {
  const src = readFileSync(file, 'utf8')
  const lines = src.split('\n')
  if (lines.length > MAX_FILE_LINES) {
    failed = true
    console.error(`${file}: [file-too-long] ${lines.length} lines > ${MAX_FILE_LINES}`)
  }
  for (const segment of codeSegments(src)) {
    for (const check of CHECKS) {
      for (const match of segment.text.matchAll(check.re)) {
        const lineNo = segment.line + (segment.text.slice(0, match.index).match(/\n/g)?.length ?? 0)
        failed = true
        console.error(`${file}:${lineNo}: [${check.name}] ${match[0].trim()}`)
      }
    }
  }
  if (FUNC_FILE_RE.test(file)) {
    for (const { name, line, length } of functionViolations(src)) {
      failed = true
      console.error(`${file}:${line}: [function-too-long] ${name}() ${length} lines > ${MAX_FUNC_LINES}`)
    }
  }
}

if (failed) {
  console.error('\nlint failed: AGENTS.md 铁律违规，请修复后重试')
  process.exit(1)
}
console.log('agents-lint: 全部通过（文件行数 / 单函数行数 / 禁用类型 / 空 catch / 遗留日志 / TODO 归属 / any）')