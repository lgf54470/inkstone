// Reading for the merge inspection: revisions through `git`, and the files the merge leaves on
// disk. Nothing here judges what it reads (that is merge-preflight-analysis.mjs) and nothing writes.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { CONFIG_PATH, TEST_FILE_RE } from './merge-preflight-analysis.mjs'

// Where the alias tables live. Read as text rather than loaded, so the analysis stays free of the
// TypeScript compiler.
export const TS_CONFIG_PATH = ['tsconfig.json', 'tsconfig.client.json', 'tsconfig.node.json', 'tsconfig.worker.json']

export function git(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, LC_ALL: 'C' },
  }).trim()
}

export function gitOrEmpty(args, allowedExitCodes = []) {
  try {
    return git(args)
  } catch (error) {
    if (allowedExitCodes.includes(error.status)) return String(error.stdout ?? '').trim()
    throw error
  }
}

export function lines(text) {
  return text ? text.split('\n').filter(Boolean) : []
}

// The text of many paths at one revision, through a single `git cat-file --batch` rather than one
// `git show` each. The spawn is the cost, not the read: measured on 241 files, 0.84s against 0.04s,
// and the crossings' readers ask for hundreds. Answers pair with requests in order, which is how a
// path containing a colon cannot be misread, and `… missing` costs one line instead of a blob.
export function readBlobs(revision, files) {
  const wanted = [...new Set(files)]
  if (!wanted.length) return new Map()
  const output = execFileSync('git', ['cat-file', '--batch'], {
    input: `${wanted.map((file) => `${revision}:${file}`).join('\n')}\n`,
    maxBuffer: 512 * 1024 * 1024,
  })
  const texts = new Map()
  let at = 0
  for (const file of wanted) {
    const end = output.indexOf(0x0a, at)
    if (end < 0) break
    const header = output.toString('utf8', at, end)
    at = end + 1
    if (header.endsWith(' missing')) continue
    const size = Number(header.split(' ')[2])
    if (!Number.isFinite(size)) continue
    texts.set(file, output.toString('utf8', at, at + size))
    at += size + 1
  }
  return texts
}

export function testsInTree(treeish) {
  return lines(git(['ls-tree', '-r', '--name-only', treeish, '--', 'tests', 'src']))
    .filter((file) => TEST_FILE_RE.test(file))
    .sort()
}

export function configOf(treeish) {
  try {
    return git(['show', `${treeish}:${CONFIG_PATH}`])
  } catch {
    // A branch without the runner config is not a finding: the merge takes the other side's.
    return ''
  }
}

export function treeFile(tree, path) {
  if (!tree) return ''
  try {
    return git(['show', `${tree}:${path}`])
  } catch {
    return ''
  }
}

// The alias tables the resolution has to know about, as text: whatever the tree being judged
// declares. Missing files are simply not part of the table.
export function readConfig(root, file) {
  const full = path.join(root, file)
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : ''
}
