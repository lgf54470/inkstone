import { execSync } from 'node:child_process'
import fs from 'node:fs'

const MIN_REDUCTION_PCT = 90

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

const direct = /direct writes:\s+(\d+)/.exec(stdout)?.[1]
const coalesced = /coalesced writes:\s+(\d+)/.exec(stdout)?.[1]
const reduction = /reduction:\s*(\d+)%/.exec(stdout)?.[1]

if (direct === undefined || coalesced === undefined || reduction === undefined) {
  console.error('typing benchmark output did not contain the expected metrics:')
  console.error(stdout)
  process.exit(1)
}

const summary = [
  '## Typing persistence benchmark',
  '',
  `| Metric | Value |`,
  `| --- | --- |`,
  `| Direct writes (50 keystrokes) | ${direct} |`,
  `| Coalesced writes | ${coalesced} |`,
  `| Serialized-bytes reduction | ${reduction}% (minimum ${MIN_REDUCTION_PCT}%) |`,
  '',
]

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.join('\n'))
}

const reductionValue = Number.parseInt(reduction, 10)
if (reductionValue < MIN_REDUCTION_PCT) {
  console.error(
    `typing benchmark regression: serialized-bytes reduction is ${reduction}%, below the ${MIN_REDUCTION_PCT}% threshold`,
  )
  process.exit(1)
}

console.log(`typing benchmark passed: ${reduction}% reduction (threshold ${MIN_REDUCTION_PCT}%)`)