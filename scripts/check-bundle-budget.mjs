import fs from 'node:fs'
import path from 'node:path'

const ASSETS_DIR = path.resolve('dist/client/assets')

const BUDGETS = {
  SettingsPanel: 40_000,
  AccountSettings: 80_000,
  EditorSettings: 40_000,
  SyncSettings: 40_000,
  DataSettings: 60_000,
  AboutSettings: 40_000,
  BackupSettings: 60_000,
  McpSettings: 60_000,
}

const failures = []
const report = []

if (!fs.existsSync(ASSETS_DIR)) {
  console.error(`bundle budget check failed: ${ASSETS_DIR} does not exist; run the build first`)
  process.exit(1)
}

const files = fs.readdirSync(ASSETS_DIR).filter((file) => file.endsWith('.js'))

for (const [prefix, budget] of Object.entries(BUDGETS)) {
  const matches = files.filter((file) => file.startsWith(`${prefix}-`))
  if (matches.length === 0) {
    failures.push(`${prefix}: chunk not found (lazy split may have been reverted)`)
    continue
  }
  for (const file of matches) {
    const bytes = fs.statSync(path.join(ASSETS_DIR, file)).size
    const kib = (bytes / 1024).toFixed(1)
    report.push(`${prefix}: ${kib} KiB (budget ${(budget / 1024).toFixed(1)} KiB)`)
    if (bytes > budget) {
      failures.push(`${prefix}: ${file} is ${kib} KiB, exceeding the ${(budget / 1024).toFixed(1)} KiB budget`)
    }
  }
}

if (failures.length === 0) {
  console.log(`bundle budget check passed (${Object.keys(BUDGETS).length} chunks):`)
  report.forEach((line) => console.log(`  ${line}`))
  process.exit(0)
} else {
  console.error('bundle budget check failed:')
  failures.forEach((line) => console.error(`  ${line}`))
  process.exit(1)
}