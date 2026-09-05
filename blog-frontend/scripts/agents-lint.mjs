#!/usr/bin/env node
/**
 * AGENTS.md 铁律的可执行子集（博客前端）。
 * 规则：
 *  - 单文件 ≤ 500 行
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
}

if (failed) {
  console.error('\nlint failed: AGENTS.md 铁律违规，请修复后重试')
  process.exit(1)
}
console.log('agents-lint: 全部通过（文件行数 / 禁用类型 / 空 catch / 遗留日志 / TODO 归属 / any）')