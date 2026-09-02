#!/usr/bin/env node
// Seeds a dev:kv instance with a realistic multi-year vault for perf A/Bs.
//
// Usage:  node scripts/seed-dev-notes.mjs [count] [years]
//   count  notes to seed (default 19800)
//   years  calendar span to spread them over (default 2)
//
// Registers (or logs in as) the perf account, then calls the dev-only
// /api/dev/seed route on the locally running worker, which writes D1 directly
// so created_at/updated_at are spread across the window (the public API always
// stamps "now", yielding a degenerate single-day vault).
import { setTimeout as sleep } from 'node:timers/promises'

const BASE = process.env.BASE_URL ?? 'http://localhost:7712'
const USER = process.env.SEED_USER ?? 'perfadmin'
const PASS = process.env.SEED_PASS ?? 'perfadmin1234'
const count = Number(process.argv[2] ?? '19800')
const years = Number(process.argv[3] ?? '2')

const headers = { 'content-type': 'application/json', 'x-inkstone-client': '1' }
let cookie = ''

async function attempt(kind) {
  const path = kind === 'register' ? '/api/auth/register' : '/api/auth/login'
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ username: USER, password: PASS, locale: 'zh-CN' }),
  })
  const setCookies = res.headers.getSetCookie?.() ?? []
  if (setCookies.length === 0 && res.headers.get('set-cookie'))
    setCookies.push(res.headers.get('set-cookie'))
  cookie = setCookies.map((value) => value.split(';')[0]).join('; ')
  return { status: res.status, body: await res.text().catch(() => '') }
}

const register = await attempt('register')
if (!cookie || register.status !== 201) {
  const login = await attempt('login')
  if (!cookie || login.status !== 200) {
    console.error(`[seed] could not establish a session (register ${register.status}, login ${login.status})`)
    console.error(register.body || login.body)
    process.exit(1)
  }
  console.log(`[seed] logged in as ${USER}`)
} else {
  console.log(`[seed] registered fresh owner ${USER}`)
}

const res = await fetch(`${BASE}/api/dev/seed?count=${count}&years=${years}`, {
  headers: { cookie, 'x-inkstone-client': '1' },
})
if (!res.ok) {
  console.error(`[seed] /api/dev/seed failed: ${res.status} ${await res.text()}`)
  process.exit(1)
}
const info = await res.json()
console.log(`[seed] inserted ${info.inserted} notes over ${info.years} year(s), ${info.notesPerDay} per day`)
console.log(`[seed] first day ${new Date(info.firstDay).toISOString().slice(0, 10)}, last day ${new Date(info.lastDay).toISOString().slice(0, 10)}`)
console.log(`[seed] waiting 8s for the client to pull before benchmarking...`)
await sleep(8000)