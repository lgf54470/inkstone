

export function InlineError(props: { error: string | null; className?: string }) {
  if (!props.error) return null
  return <p role="alert" className={`text-[length:var(--text-12)] text-[var(--danger)] ${props.className ?? ''}`}>{props.error}</p>
}

