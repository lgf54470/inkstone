import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '../primitives'
import { Input } from '../form'
import { t } from '../../lib/i18n'
import { Modal } from './modal'

const MODAL_WIDTH = 420

export interface PromptOptions {
  title: string
  description?: ReactNode
  placeholder?: string
  defaultValue?: string
  confirmLabel?: string
  cancelLabel?: string
}

interface PromptRequest {
  options: PromptOptions
  resolve: (value: string | null) => void
}

let enqueuePrompt: ((request: PromptRequest) => void) | null = null

export function prompt(options: PromptOptions): Promise<string | null> {
  if (!enqueuePrompt)
    return Promise.resolve(null)
  return new Promise((resolve) => {
    enqueuePrompt?.({ options, resolve })
  })
}

function usePromptQueue() {
  const [current, setCurrent] = useState<PromptRequest | null>(null)
  const currentRef = useRef<PromptRequest | null>(null)
  const queueRef = useRef<PromptRequest[]>([])

  useEffect(() => {
    enqueuePrompt = (request) => {
      if (currentRef.current) {
        queueRef.current.push(request)
        return
      }
      currentRef.current = request
      setCurrent(request)
    }
    return () => {
      enqueuePrompt = null
      currentRef.current?.resolve(null)
      for (const request of queueRef.current)
        request.resolve(null)
      currentRef.current = null
      queueRef.current = []
    }
  }, [])

  const finish = useCallback((result: string | null) => {
    const active = currentRef.current
    if (!active)
      return
    active.resolve(result)
    const next = queueRef.current.shift() ?? null
    currentRef.current = next
    setCurrent(next)
  }, [])

  return { current, finish }
}

function PromptDialog({ request, finish }: {
  request: PromptRequest
  finish: (result: string | null) => void
}) {
  const [value, setValue] = useState(request.options.defaultValue ?? '')
  const options = request.options
  const canSubmit = Boolean(value.trim())

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (canSubmit)
      finish(value.trim())
  }

  return (
    <Modal
      open
      onClose={() => finish(null)}
      title={options.title}
      description={options.description}
      width={MODAL_WIDTH}
      footer={
        <>
          <Button variant='ghost' onClick={() => finish(null)}>
            {options.cancelLabel ?? t('common.cancel')}
          </Button>
          <Button
            variant='primary'
            disabled={!canSubmit}
            onClick={() => finish(value.trim())}
            data-autofocus
          >
            {options.confirmLabel ?? t('overlay.confirm')}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className='mt-2'>
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={options.placeholder}
          onKeyDown={(e) => {
            if (e.key === 'Escape') finish(null)
          }}
        />
      </form>
    </Modal>
  )
}

export function PromptHost() {
  const { current, finish } = usePromptQueue()
  if (!current)
    return null
  return <PromptDialog request={current} finish={finish} />
}
