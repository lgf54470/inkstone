// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { showChartError, showMermaidError } from './interactive'

const INJECTED = '</div><img src=x onerror=alert(1)>'

describe('showMermaidError', () => {
  it('renders error message and raw source as text without executing markup', () => {
    const block = document.createElement('div')
    showMermaidError(block, new Error(INJECTED), INJECTED)

    expect(block.querySelector('img')).toBeNull()
    expect(block.querySelector('.mermaid-error-message')?.textContent).toBe(INJECTED)
    expect(block.querySelector('code')?.textContent).toBe(INJECTED)
  })

  it('marks the block as has-error and removes loading', () => {
    const block = document.createElement('div')
    block.classList.add('loading')
    showMermaidError(block, new Error('boom'), 'graph TD')

    expect(block.classList.contains('has-error')).toBe(true)
    expect(block.classList.contains('loading')).toBe(false)
    expect(block.querySelector('.mermaid-error')).not.toBeNull()
  })
})

describe('showChartError', () => {
  it('renders error message and raw source as text without executing markup', () => {
    const block = document.createElement('div')
    showChartError(block, new Error(INJECTED), INJECTED)

    expect(block.querySelector('img')).toBeNull()
    expect(block.querySelector('.chart-error-text')?.textContent).toContain(INJECTED)
    expect(block.querySelector('code')?.textContent).toBe(INJECTED)
  })

  it('marks the block as has-error and removes loading', () => {
    const block = document.createElement('div')
    block.classList.add('loading')
    showChartError(block, new Error('boom'), '{"type":"line"}')

    expect(block.classList.contains('has-error')).toBe(true)
    expect(block.classList.contains('loading')).toBe(false)
    expect(block.querySelector('.chart-error-banner')).not.toBeNull()
    expect(block.querySelector('pre')).not.toBeNull()
  })
})