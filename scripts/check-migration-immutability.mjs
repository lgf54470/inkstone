import { execSync } from 'node:child_process'
import fs from 'node:fs'

const MIGRATIONS_FILE = 'src/worker/db/schema/migrations.ts'

function checkImmutability() {
  if (!fs.existsSync(MIGRATIONS_FILE)) return

  let stagedFiles = ''
  try {
    stagedFiles = execSync('git diff --cached --name-only', { encoding: 'utf8' })
  } catch {
    return
  }

  if (!stagedFiles.split('\n').includes(MIGRATIONS_FILE)) {
    return
  }

  let diff = ''
  try {
    diff = execSync(`git diff --cached -U0 ${MIGRATIONS_FILE}`, { encoding: 'utf8' })
  } catch {
    return
  }

  if (!diff.trim()) return

  let headFile = ''
  try {
    headFile = execSync(`git show HEAD:${MIGRATIONS_FILE}`, { encoding: 'utf8' })
  } catch {
    return
  }

  const versionMatches = [...headFile.matchAll(/version:\s*(\d+)/g)]
  if (versionMatches.length === 0) return

  const committedVersions = versionMatches.map((m) => parseInt(m[1], 10))
  const maxCommittedVersion = Math.max(...committedVersions)

  const removedLines = diff
    .split('\n')
    .filter((line) => line.startsWith('-') && !line.startsWith('---'))

  for (const version of committedVersions) {
    const versionHeaderRe = new RegExp(`^-\\s*version:\\s*${version}\\b`)
    if (removedLines.some((l) => versionHeaderRe.test(l))) {
      console.error(
        `\n[migration-gate] Fatal error: cannot delete or modify already-committed migration version (${version})!`,
      )
      console.error(
        `Production databases already marked version ${version} as applied. Mutating it causes skipped migrations and 500 crashes!`,
      )
      console.error(`Rule: append a new monotonically incremented version (${maxCommittedVersion + 1}) instead.\n`)
      process.exit(1)
    }
  }

  const currentFile = fs.readFileSync(MIGRATIONS_FILE, 'utf8')
  for (const version of committedVersions) {
    const extractVersionBlock = (content, ver) => {
      const match = content.match(new RegExp(`{\\s*//[\\s\\S]*?version:\\s*${ver},[\\s\\S]*?statements:\\s*\\[([\\s\\S]*?)\\][\\s\\S]*?},`))
        || content.match(new RegExp(`{\\s*version:\\s*${ver},[\\s\\S]*?statements:\\s*\\[([\\s\\S]*?)\\][\\s\\S]*?},`))
      return match ? match[1]?.trim().replace(/\s+/g, ' ') : null
    }

    const headBlock = extractVersionBlock(headFile, version)
    const currentBlock = extractVersionBlock(currentFile, version)

    if (headBlock && currentBlock && headBlock !== currentBlock) {
      console.error(
        `\n[migration-gate] Fatal error: detected modification to committed migration version ${version}!`,
      )
      console.error(
        `Production databases already applied version ${version}. Directly modifying it will cause existing environments to skip these changes!`,
      )
      console.error(
        `Fix: revert version ${version} to its committed state, and append a new version (${maxCommittedVersion + 1}) at the end.\n`,
      )
      process.exit(1)
    }
  }

  console.log('migration immutability check passed: no historical migrations were modified')
}

checkImmutability()
