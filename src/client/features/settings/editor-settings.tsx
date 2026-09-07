import { useCallback, useMemo } from 'react';
import { Segmented, SettingRow, Slider, Switch, type SegmentedOption } from '../../components/form';
import { useSession } from '../../store/session';
import { t, useLocale } from '../../lib/i18n';
import type { EditorSettings as SettingsEditor, PreviewSettings as SettingsPreview } from '@shared/types';

const TAB_SIZE_OPTIONS: SegmentedOption<string>[] = [
  { value: '2', label: '2' },
  { value: '4', label: '4' },
];

export function EditorSettings() {
  const editor = useSession((s) => s.settings.editor);
  const preview = useSession((s) => s.settings.preview);
  const setters = useEditorSetters();
  return (<div className='space-y-6'>
    <FontSection editor={editor} setters={setters}/>
    <WritingModeSection editor={editor} setters={setters}/>
    <PreviewSection preview={preview} setters={setters}/>
    <MiscSection editor={editor} setters={setters}/>
  </div>);
}

function useEditorSetters() {
  const update = useSession((s) => s.updateSettings);
  const locale = useLocale();
  const fontFamilyOptions = useMemo(() => ([
    { value: 'mono' as const, label: t('settings.monospace') },
    { value: 'sans' as const, label: t('common.sans_serif') },
  ]), [locale]);
  return {
    fontFamilyOptions,
    setFontFamily: useCallback((fontFamily: 'mono' | 'sans') => void update({ editor: { fontFamily } }), [update]),
    setFontSize: useCallback((fontSize: number) => void update({ editor: { fontSize } }), [update]),
    setLineNumbers: useCallback((lineNumbers: boolean) => void update({ editor: { lineNumbers } }), [update]),
    setShowToolbar: useCallback((showToolbar: boolean) => void update({ editor: { showToolbar } }), [update]),
    setSpellcheck: useCallback((spellcheck: boolean) => void update({ editor: { spellcheck } }), [update]),
    setTypewriter: useCallback((typewriter: boolean) => void update({ editor: { typewriter } }), [update]),
    setFocusMode: useCallback((focusMode: boolean) => void update({ editor: { focusMode } }), [update]),
    setTabSize: useCallback((value: string) => void update({ editor: { tabSize: Number(value) } }), [update]),
    setAutoSaveDelay: useCallback((autoSaveDelay: number) => void update({ editor: { autoSaveDelay } }), [update]),
    setSyncScroll: useCallback((syncScroll: boolean) => void update({ preview: { syncScroll } }), [update]),
    setMath: useCallback((math: boolean) => void update({ preview: { math } }), [update]),
    setMermaid: useCallback((mermaid: boolean) => void update({ preview: { mermaid } }), [update]),
    setCodeBlockCollapse: useCallback((codeBlockCollapse: boolean) => void update({ preview: { codeBlockCollapse } }), [update]),
    setCodeBlockCollapseLines: useCallback((codeBlockCollapseLines: number) => void update({ preview: { codeBlockCollapseLines } }), [update]),
    setShowToc: useCallback((showToc: boolean) => void update({ preview: { showToc } }), [update]),
    setLinkHover: useCallback((linkHover: boolean) => void update({ preview: { linkHover } }), [update]),
    setExternalImages: useCallback((externalImages: boolean) => void update({ preview: { externalImages } }), [update]),
    setLinkHoverDelayMs: useCallback((linkHoverDelayMs: number) => void update({ preview: { linkHoverDelayMs } }), [update]),
    setLinkPreviewLength: useCallback((linkPreviewLength: number) => void update({ preview: { linkPreviewLength } }), [update]),
  };
}

type EditorSetters = ReturnType<typeof useEditorSetters>;

function FontSection({ editor, setters }: { editor: SettingsEditor; setters: EditorSetters }) {
  return (
    <section>
      <SettingRow title={t('settings.editor_font')}>
      <Segmented<'mono' | 'sans'> label={t('settings.editor_font')} value={editor.fontFamily} onChange={setters.setFontFamily} options={setters.fontFamilyOptions}/>
      </SettingRow>
      <SettingRow title={t('settings.editor_font_size')}>
      <Slider label={t('settings.editor_font_size')} className='w-50' value={editor.fontSize} min={12} max={22} onChange={setters.setFontSize} suffix='px'/>
      </SettingRow>
      <SettingRow title={t('settings.show_line_numbers')}>
      <Switch checked={editor.lineNumbers} onChange={setters.setLineNumbers} label={t('settings.show_line_numbers')}/>
      </SettingRow>
      <SettingRow title={t('settings.show_toolbar')}>
      <Switch checked={editor.showToolbar} onChange={setters.setShowToolbar} label={t('settings.show_toolbar')}/>
      </SettingRow>
      <SettingRow title={t('settings.spellcheck')}>
      <Switch checked={editor.spellcheck} onChange={setters.setSpellcheck} label={t('settings.spellcheck')}/>
      </SettingRow>
    </section>
  );
}

function WritingModeSection({ editor, setters }: { editor: SettingsEditor; setters: EditorSetters }) {
  return (
    <section>
      <h3 className='mb-1 text-[length:var(--text-11)] font-semibold tracking-[var(--tracking-label)] text-[var(--text-quaternary)]'>{t('settings.writing_mode')}</h3>
      <SettingRow title={t('settings.typewriter_mode')} description={t('settings.keep_the_cursor_line_centered_on_screen')}>
      <Switch checked={editor.typewriter} onChange={setters.setTypewriter} label={t('settings.typewriter_mode')}/>
      </SettingRow>
      <SettingRow title={t('settings.focus_mode')} description={t('settings.fade_content_outside_the_current_paragraph')}>
      <Switch checked={editor.focusMode} onChange={setters.setFocusMode} label={t('settings.focus_mode')}/>
      </SettingRow>
    </section>
  );
}

function PreviewSection({ preview, setters }: { preview: SettingsPreview; setters: EditorSetters }) {
  return (
    <section>
      <h3 className='mb-1 text-[length:var(--text-11)] font-semibold tracking-[var(--tracking-label)] text-[var(--text-quaternary)]'>{t('common.preview')}</h3>
      <SettingRow title={t('settings.scroll_sync')} description={t('settings.keep_the_editor_and_preview_scrolled_together')}>
      <Switch checked={preview.syncScroll} onChange={setters.setSyncScroll} label={t('settings.scroll_sync')}/>
      </SettingRow>
      <SettingRow title={t('settings.math')} description={t('settings.render_and_using_katex')}>
      <Switch checked={preview.math} onChange={setters.setMath} label={t('settings.math')}/>
      </SettingRow>
      <SettingRow title={t('settings.diagram')} description={t('settings.render_mermaid_code_blocks_into_flowcharts')}>
      <Switch checked={preview.mermaid} onChange={setters.setMermaid} label={t('settings.diagram')}/>
      </SettingRow>
      <SettingRow title={t('settings.collapse_long_code_blocks')} description={t('settings.collapse_long_code_blocks_description')}>
      <Switch checked={preview.codeBlockCollapse} onChange={setters.setCodeBlockCollapse} label={t('settings.collapse_long_code_blocks')}/>
      </SettingRow>
      {preview.codeBlockCollapse && <SettingRow title={t('settings.code_block_collapse_after')}>
      <Slider label={t('settings.code_block_collapse_after')} className='w-50' value={preview.codeBlockCollapseLines} min={8} max={100} step={1} onChange={setters.setCodeBlockCollapseLines} suffix={t('settings.lines')}/>
      </SettingRow>}
      <SettingRow title={t('settings.show_outline_by_default')}>
      <Switch checked={preview.showToc} onChange={setters.setShowToc} label={t('settings.show_outline_by_default')}/>
      </SettingRow>
      <SettingRow title={t('settings.link_hover_preview')} description={t('settings.link_hover_preview_description')}>
      <Switch checked={preview.linkHover} onChange={setters.setLinkHover} label={t('settings.link_hover_preview')}/>
      </SettingRow>
      <SettingRow title={t('settings.external_images')} description={t('settings.external_images_description')}>
      <Switch checked={preview.externalImages} onChange={setters.setExternalImages} label={t('settings.external_images')}/>
      </SettingRow>
      {preview.linkHover && <>
      <SettingRow title={t('settings.link_hover_delay')}>
        <Slider label={t('settings.link_hover_delay')} className='w-50' value={preview.linkHoverDelayMs} min={150} max={1000} step={50} onChange={setters.setLinkHoverDelayMs} suffix='ms'/>
      </SettingRow>
      <SettingRow title={t('settings.link_preview_length')}>
        <Slider label={t('settings.link_preview_length')} className='w-50' value={preview.linkPreviewLength} min={300} max={8000} step={100} onChange={setters.setLinkPreviewLength} suffix={t('settings.characters')}/>
      </SettingRow>
      </>}
    </section>
  );
}

function MiscSection({ editor, setters }: { editor: SettingsEditor; setters: EditorSetters }) {
  return (
    <section>
      <SettingRow title={t('settings.autosave_delay')} description={t('settings.delay_before_uploading_after_you_stop_typing_shorter_makes_more_requests')}>
      <Slider label={t('settings.autosave_delay')} className='w-50' value={editor.autoSaveDelay} min={200} max={3000} step={100} onChange={setters.setAutoSaveDelay} suffix='ms'/>
      </SettingRow>
      <SettingRow title={t('settings.indent_width')}>
      <Segmented<string> label={t('settings.indent_width')} value={String(editor.tabSize)} onChange={setters.setTabSize} options={TAB_SIZE_OPTIONS}/>
      </SettingRow>
    </section>
  );
}