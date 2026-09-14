import { useEffect, useState } from 'react'
import { cn } from '../lib/cn'
import { WikiLinkHoverCard } from '../features/preview'
import { useCodeEditor, type CodeEditorProps } from './use-code-editor'

export type { CodeEditorProps } from './use-code-editor'

export interface DeferredCodeEditorProps extends CodeEditorProps {
  visible: boolean
}

export function DeferredCodeEditor({ visible, ...props }: DeferredCodeEditorProps) {
  const [initialized, setInitialized] = useState(visible)
  useEffect(() => {
    if (visible) setInitialized(true)
  }, [visible])
  // Sticky mount: CodeMirror is built the first time its pane is shown and then
  // stays alive under the caller's hidden host, so layout flips keep undo
  // history instead of paying a full rebuild; `visible ||` covers the render
  // that happens before the effect flips `initialized`.
  return visible || initialized ? <CodeEditor {...props} /> : null
}

export function CodeEditor(props: CodeEditorProps) {
  const { hostRef, dark, card, hideNow, clearPendingHide, armHide, handlePin, handleHostContextMenu } = useCodeEditor(props)
  return (<div ref={hostRef} onContextMenu={handleHostContextMenu} className={cn('ink-editor', props.className)} data-family={props.settings.fontFamily} data-focus-mode={props.settings.focusMode} data-typewriter={props.settings.typewriter} data-live={props.live ? 'true' : undefined}>
    {card && (
    <WikiLinkHoverCard
      card={card}
      path={card.noteId ? [card.noteId] : []}
      depth={1}
      dark={dark}
      onClose={hideNow}
      onEnter={clearPendingHide}
      onLeave={armHide}
      onPin={handlePin}
    />
    )}
  </div>)
}
