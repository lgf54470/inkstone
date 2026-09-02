import { execSync } from 'node:child_process'
import fs from 'node:fs'

const MIN_REDUCTION_PCT = 90
const MAX_SHELL_BURST_KEYS = 1
const MAX_SHELL_BURST_BYTES = 4 * 1024
// Generous headroom for shared CI runners; the point is catching an order-of-magnitude regression.
const MAX_CAL_COLD_BUILD_MS = 250

const MAX_CAL_COMMIT_AVG_MS = 60
const MAX_CAL_SHORTCUT_MS = 1

export function parseTyping(stdout) {
  const direct = /direct writes:\s+(\d+)/.exec(stdout)?.[1]
  const coalesced = /coalesced writes:\s+(\d+)/.exec(stdout)?.[1]
  const reduction = /reduction:\s*(\d+)%/.exec(stdout)?.[1]
  return { direct, coalesced, reduction }
}

export function parseShell(stdout) {
  const keysLine = /key writes per burst:\s+(.+)/.exec(stdout)?.[1]
  const bytesLine = /serialized bytes per burst:\s+(.+)/.exec(stdout)?.[1]
  const wholeVaultLine = /whole-vault value:\s*(.+)/.exec(stdout)?.[1]
  const burstKeys = keysLine
    ? keysLine.split(',').map((token) => Number.parseInt(token.trim(), 10))
    : []
  const burstBytes = bytesLine
    ? bytesLine.split(',').map((token) => {
        const match = /([\d.]+)\s*(B|KiB|MiB)/.exec(token.trim())
        if (!match) return 0
        const value = Number.parseFloat(match[1])
        return match[2] === 'B' ? value : match[2] === 'KiB' ? value * 1024 : value * 1024 * 1024
      })
    : []
  return {
    burstKeys,
    burstBytes,
    wholeVaultAbsent: wholeVaultLine !== undefined && wholeVaultLine.startsWith('not serialized'),
  }
}

export function parseCalendarProj(stdout) {
  const coldLine = /cold build ms:\s*([\d.]+)/.exec(stdout)?.[1]
  const commitLine = /per-commit average ms:\s*([\d.]+)/.exec(stdout)?.[1]
  const shortcutLine = /same-map shortcut ms:\s*([\d.]+)/.exec(stdout)?.[1]
  const identityLine = /same-day identity stable:\s*(yes|no)/.exec(stdout)?.[1]
  return {
    coldMs: coldLine ? Number.parseFloat(coldLine) : undefined,
    commitAvgMs: commitLine ? Number.parseFloat(commitLine) : undefined,
    shortcutMs: shortcutLine ? Number.parseFloat(shortcutLine) : undefined,
    identityStable: identityLine === 'yes',
  }
}

export function validateCalendarProj(cal) {
  const errors = []
  if (cal.coldMs === undefined) errors.push('calendar projection benchmark: missing cold-build metric')
  else if (cal.coldMs > MAX_CAL_COLD_BUILD_MS) {
    errors.push(`calendar projection benchmark regression: cold build ${cal.coldMs} ms exceeds ${MAX_CAL_COLD_BUILD_MS} ms`)
  }
  if (cal.commitAvgMs === undefined) errors.push('calendar projection benchmark: missing per-commit metric')
  else if (cal.commitAvgMs > MAX_CAL_COMMIT_AVG_MS) {
    errors.push(`calendar projection benchmark regression: incremental commit average ${cal.commitAvgMs} ms exceeds ${MAX_CAL_COMMIT_AVG_MS} ms (the three full-vault scans would cost ~60 ms)`)
  }
  if (cal.shortcutMs === undefined) errors.push('calendar projection benchmark: missing same-map shortcut metric')
  else if (cal.shortcutMs > MAX_CAL_SHORTCUT_MS) {
    errors.push(`calendar projection benchmark regression: same-map shortcut ${cal.shortcutMs} ms exceeds ${MAX_CAL_SHORTCUT_MS} ms (the identity fast path was lost)`)
  }
  if (!cal.identityStable) {
    errors.push('calendar projection benchmark regression: same-day edits no longer keep counts/title identities stable')
  }
  return errors
}

export function validateShell(shell) {
  const errors = []
  if (!shell.burstKeys.length) errors.push('shell benchmark: missing per-burst key-write metrics')
  else if (!shell.burstKeys.every((count) => count === MAX_SHELL_BURST_KEYS)) {
    errors.push(
      `shell benchmark regression: per-burst key writes ${shell.burstKeys.join(', ')} ` +
        `must all be ${MAX_SHELL_BURST_KEYS} (a single-note edit must not rewrite facets or the index)`,
    )
  }
  if (!shell.burstBytes.length) errors.push('shell benchmark: missing per-burst serialized-byte metrics')
  else if (!shell.burstBytes.every((bytes) => bytes < MAX_SHELL_BURST_BYTES)) {
    errors.push(
      `shell benchmark regression: per-burst serialized bytes exceed the ${MAX_SHELL_BURST_BYTES} B threshold`,
    )
  }
  if (!shell.wholeVaultAbsent) {
    errors.push('shell benchmark regression: the whole-vault value is still serialized on the flush path')
  }
  return errors
}

function main() {
  let stdout = ''
  try {
    stdout = execSync('npm run bench:typing --silent', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    })
  } catch (error) {
    const detail = error instanceof Error && 'stdout' in error
      ? String(error.stdout ?? '')
      : ''
    console.error('typing benchmark failed:')
    console.error(detail || String(error))
    process.exit(1)
  }

  const typing = parseTyping(stdout)
  const shell = parseShell(stdout)
  const shellErrors = validateShell(shell)
  const cal = parseCalendarProj(stdout)
  const calErrors = validateCalendarProj(cal)

  if (typing.direct === undefined || typing.coalesced === undefined || typing.reduction === undefined) {
    console.error('typing benchmark output did not contain the expected metrics:')
    console.error(stdout)
    process.exit(1)
  }

  const summary = [
    '## Typing persistence benchmark',
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| Direct writes (50 keystrokes) | ${typing.direct} |`,
    `| Coalesced writes | ${typing.coalesced} |`,
    `| Serialized-bytes reduction | ${typing.reduction}% (minimum ${MIN_REDUCTION_PCT}%) |`,
    '',
  ]
  if (shellErrors.length) {
    summary.push('## Shell cache benchmark — FAILED', '')
    for (const error of shellErrors) summary.push(`- ${error}`)
    summary.push('')
  }
  else {
    summary.push(
      '## Shell cache benchmark',
      '',
      '| Metric | Value |',
      '| --- | --- |',
      `| Per-burst key writes | ${shell.burstKeys.join(', ')} (maximum ${MAX_SHELL_BURST_KEYS}) |`,
      `| Per-burst serialized bytes | ${shell.burstBytes.join(', ')} (< ${MAX_SHELL_BURST_BYTES} B) |`,
      `| Whole-vault serialized on flush | ${shell.wholeVaultAbsent ? 'no' : 'yes — FAIL'} |`,
      '',
    )
  }
  if (calErrors.length) {
    summary.push('## Calendar projection benchmark — FAILED', '')
    for (const error of calErrors) summary.push(`- ${error}`)
    summary.push('')
  }
  else {
    summary.push(
      '## Calendar projection benchmark',
      '',
      '| Metric | Value |',
      '| --- | --- |',
      `| Cold build (19.8k vault) | ${cal.coldMs} ms (< ${MAX_CAL_COLD_BUILD_MS} ms) |`,
      `| Incremental commit average | ${cal.commitAvgMs} ms (< ${MAX_CAL_COMMIT_AVG_MS} ms) |`,
      `| Same-map shortcut | ${cal.shortcutMs} ms (< ${MAX_CAL_SHORTCUT_MS} ms) |`,
      `| Same-day identity stable | ${cal.identityStable ? 'yes' : 'no — FAIL'} |`,
      '',
    )
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.join('\n'))
  }

  const reductionValue = Number.parseInt(typing.reduction, 10)
  if (reductionValue < MIN_REDUCTION_PCT) {
    console.error(
      `typing benchmark regression: serialized-bytes reduction is ${typing.reduction}%, below the ${MIN_REDUCTION_PCT}% threshold`,
    )
    process.exit(1)
  }
  if (shellErrors.length) {
    console.error('shell cache benchmark failed:')
    for (const error of shellErrors) console.error(`  ${error}`)
    process.exit(1)
  }
  if (calErrors.length) {
    console.error('calendar projection benchmark failed:')
    for (const error of calErrors) console.error(`  ${error}`)
    process.exit(1)
  }

  console.log(`typing benchmark passed: ${typing.reduction}% reduction (threshold ${MIN_REDUCTION_PCT}%)`)
  console.log('shell cache benchmark passed: 1 key write per burst, no whole-vault serialization')
  console.log(`calendar projection benchmark passed: ${cal.commitAvgMs} ms per commit, cold build ${cal.coldMs} ms, identity stable`)
}

if (import.meta.main) main()
