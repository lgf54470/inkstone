#!/usr/bin/env node
import { parseArgs } from 'node:util'

const USAGE = `Ensure a local dev account exists by registering (or logging into) it.

Usage:
  node scripts/dev-account-setup.mjs [--base-url <url>]
  node scripts/dev-account-setup.mjs -u <username> -p <password>

Options:
  -u, --user       username (3-32 chars: a-z 0-9 _ -), default "admin"
  -p, --password   password (at least 8 chars), default "admin123"
      --base-url   dev server base URL, default BASE_URL or http://localhost:7712
  -h, --help       show this help

Dev tool only: never point it at a shared or production instance.`

const { values: args } = parseArgs({
  options: {
    user: { type: 'string', short: 'u', default: 'admin' },
    password: { type: 'string', short: 'p', default: 'admin123' },
    'base-url': { type: 'string', default: process.env.BASE_URL ?? 'http://localhost:7712' },
    help: { type: 'boolean', short: 'h' },
  },
})

if (args.help) {
  console.log(USAGE)
  process.exit(0)
}

const BASE = args['base-url'].replace(/\/+$/, '')
const USER = args.user.trim().toLowerCase()
const PASS = args.password

if (!/^[a-z0-9_-]{3,32}$/.test(USER)) {
  console.error(`[dev-account] invalid username "${args.user}": use 3-32 chars of a-z, 0-9, _, -`)
  process.exit(1)
}
if (PASS.length < 8) {
  console.error('[dev-account] invalid password: it must contain at least 8 characters')
  process.exit(1)
}

const HEADERS = { 'content-type': 'application/json', 'x-inkstone-client': '1' }

async function post(path) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ username: USER, password: PASS, locale: 'zh-CN' }),
    })
    return { status: res.status, body: await res.text().catch(() => '') }
  } catch (error) {
    console.error(`[dev-account] cannot reach the dev server at ${BASE}: ${error.cause?.code ?? error.message}`)
    console.error('Start it first, e.g. npm run dev:kv')
    process.exit(1)
  }
}

async function serverError(body) {
  try {
    return JSON.parse(body)?.error?.message ?? body
  } catch {
    return body
  }
}

const health = await fetch(`${BASE}/api/health`).catch(() => null)
if (!health?.ok) {
  console.error(`[dev-account] the dev server is not running at ${BASE}`)
  console.error('Start it first, e.g. npm run dev:kv')
  process.exit(1)
}

const register = await post('/api/auth/register')
if (register.status === 201) {
  const role = JSON.parse(register.body)?.user?.role ?? 'member'
  console.log(`[dev-account] registered ${USER} / ${PASS} (role: ${role})`)
} else {
  const login = await post('/api/auth/login')
  if (login.status === 200) {
    console.log(`[dev-account] ${USER} already exists and the given password works`)
  } else {
    console.error(`[dev-account] register failed (${register.status}): ${await serverError(register.body)}`)
    if (register.status === 403) {
      console.error('[dev-account] this instance already has accounts and registration is closed;')
      console.error('[dev-account] log in with an existing account, or enable registration in its settings first.')
    }
    if (register.status !== login.status || register.body !== login.body) {
      console.error(`[dev-account] login fallback failed (${login.status}): ${await serverError(login.body)}`)
    }
    process.exit(1)
  }
}
console.log(`[dev-account] ready: log in at ${BASE} as ${USER}`)
