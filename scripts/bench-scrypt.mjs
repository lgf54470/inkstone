#!/usr/bin/env node
/**
 * Measures scrypt cost with the production parameters
 * (SCRYPT_N = 2**14, r = 8, p = 5) so parameter and throttle-budget
 * decisions are grounded in measured numbers, not guesses.
 */
import { scryptSync, randomBytes } from 'node:crypto'

const N = 2 ** 14
const r = 8
const p = 5
const ITERATIONS = 5
const salt = randomBytes(16)

// p worker threads need ~128 * N * r * p bytes of memory
const maxmem = 128 * N * r * p * 2

const started = process.hrtime.bigint()
for (let index = 0; index < ITERATIONS; index++) {
  scryptSync('benchmark-password', salt, 32, { N, r, p, maxmem })
}
const perHashMs = Number(process.hrtime.bigint() - started) / 1e6 / ITERATIONS

const budgetSeconds = (10 * 60) / 8 // throttle: 8 attempts per 10 minutes
console.log(`scrypt N=${N} r=${r} p=${p}: ${perHashMs.toFixed(1)} ms per hash (avg of ${ITERATIONS})`)
console.log(`throttle worst-case budget per attempt: ${budgetSeconds.toFixed(0)} s`)
console.log(`headroom: ${Math.round((budgetSeconds * 1000) / perHashMs)}x`)