import { cn } from '../lib/cn';
import { WikiLinkHoverCard } from '../features/preview';
import { useCodeEditor, type CodeEditorProps } from './use-code-editor';

export type { CodeEditorProps } from './use-code-editor';

export function CodeEditor(props: CodeEditorProps) {
  const { hostRef, dark, card, hideNow, clearPendingHide, armHide, handlePin, handleHostContextMenu } = useCodeEditor(props);
  return (<div ref={hostRef} onContextMenu={handleHostContextMenu} className={cn('ink-editor', props.className)} data-family={props.settings.fontFamily} data-focus-mode={props.settings.focusMode} data-typewriter={props.settings.typewriter}>
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
  </div>);
}
