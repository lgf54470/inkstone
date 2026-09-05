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
 * 退出码 0 = 全部通过，1 = 存在违规。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC_DIR = new URL('../src', import.meta.url).pathname
const MAX_FILE_LINES = 500

const CHECKS = [
  {
    name: 'file-too-long',
    re: null,
    test: (lines) => lines.length > MAX_FILE_LINES,
    msg: (lines) => `${lines.length} lines > ${MAX_FILE_LINES}`,
  },
  {
    name: 'forbidden-ignore',
    re: /@ts-ignore|@ts-expect-error|eslint-disable/,
  },
  {
    name: 'empty-catch',
    re: /catch\s*(?:\([^)]*\))?\s*\{\s*\}/,
  },
  {
    name: 'console-log',
    re: /console\.log\(/,
  },
  {
    name: 'todo-without-owner',
    re: /\b(?:TODO|FIXME)\b(?!\s*\([^)]*\))/,
  },
  {
    name: 'any-type',
    re: /\bas any\b|:\s*any\b|\bany\[\]|<any>/,
  },
]

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
  const lines = readFileSync(file, 'utf8').split('\n')
  for (const check of CHECKS) {
    if (check.re) {
      lines.forEach((line, idx) => {
        if (check.re.test(line)) {
          failed = true
          console.error(`${file}:${idx + 1}: [${check.name}] ${line.trim()}`)
        }
      })
    } else if (check.test(lines)) {
      failed = true
      console.error(`${file}: [${check.name}] ${check.msg(lines)}`)
    }
  }
}

if (failed) {
  console.error('\nlint failed: AGENTS.md 铁律违规，请修复后重试')
  process.exit(1)
}
console.log('agents-lint: 全部通过（文件行数 / 禁用类型 / 空 catch / 遗留日志 / TODO 归属 / any）')