import { useCallback, useMemo } from 'react';
import { Segmented, SettingRow, Slider, Switch, type SegmentedOption } from '../../components/form';
import { useSession } from '../../store/session';
import { t, useLocale } from "../../lib/i18n";

const TAB_SIZE_OPTIONS: SegmentedOption<string>[] = [
    { value: '2', label: '2' },
    { value: '4', label: '4' },
];

export function EditorSettings() {
    const editor = useSession((s) => s.settings.editor);
    const preview = useSession((s) => s.settings.preview);
    const update = useSession((s) => s.updateSettings);
    const locale = useLocale();

    const setFontFamily = useCallback((fontFamily: 'mono' | 'sans') => void update({ editor: { fontFamily } }), [update]);
    const setFontSize = useCallback((fontSize: number) => void update({ editor: { fontSize } }), [update]);
    const setLineNumbers = useCallback((lineNumbers: boolean) => void update({ editor: { lineNumbers } }), [update]);
    const setShowToolbar = useCallback((showToolbar: boolean) => void update({ editor: { showToolbar } }), [update]);
    const setSpellcheck = useCallback((spellcheck: boolean) => void update({ editor: { spellcheck } }), [update]);
    const setTypewriter = useCallback((typewriter: boolean) => void update({ editor: { typewriter } }), [update]);
    const setFocusMode = useCallback((focusMode: boolean) => void update({ editor: { focusMode } }), [update]);
    const setTabSize = useCallback((value: string) => void update({ editor: { tabSize: Number(value) } }), [update]);
    const setAutoSaveDelay = useCallback((autoSaveDelay: number) => void update({ editor: { autoSaveDelay } }), [update]);
    const setSyncScroll = useCallback((syncScroll: boolean) => void update({ preview: { syncScroll } }), [update]);
    const setMath = useCallback((math: boolean) => void update({ preview: { math } }), [update]);
    const setMermaid = useCallback((mermaid: boolean) => void update({ preview: { mermaid } }), [update]);
    const setCodeBlockCollapse = useCallback((codeBlockCollapse: boolean) => void update({ preview: { codeBlockCollapse } }), [update]);
    const setCodeBlockCollapseLines = useCallback((codeBlockCollapseLines: number) => void update({ preview: { codeBlockCollapseLines } }), [update]);
    const setShowToc = useCallback((showToc: boolean) => void update({ preview: { showToc } }), [update]);
    const setLinkHover = useCallback((linkHover: boolean) => void update({ preview: { linkHover } }), [update]);
    const setExternalImages = useCallback((externalImages: boolean) => void update({ preview: { externalImages } }), [update]);
    const setLinkHoverDelayMs = useCallback((linkHoverDelayMs: number) => void update({ preview: { linkHoverDelayMs } }), [update]);
    const setLinkPreviewLength = useCallback((linkPreviewLength: number) => void update({ preview: { linkPreviewLength } }), [update]);

    const fontFamilyOptions = useMemo(() => ([
        { value: 'mono' as const, label: t("settings.monospace") },
        { value: 'sans' as const, label: t("common.sans_serif") },
    ]), [locale]);

    return (<div className="space-y-6">
      <section>
        <SettingRow title={t("settings.editor_font")}>
          <Segmented<'mono' | 'sans'> label={t("settings.editor_font")} value={editor.fontFamily} onChange={setFontFamily} options={fontFamilyOptions}/>
        </SettingRow>

        <SettingRow title={t("settings.editor_font_size")}>
          <Slider label={t("settings.editor_font_size")} className="w-[200px]" value={editor.fontSize} min={12} max={22} onChange={setFontSize} suffix="px"/>
        </SettingRow>

        <SettingRow title={t("settings.show_line_numbers")}>
          <Switch checked={editor.lineNumbers} onChange={setLineNumbers} label={t("settings.show_line_numbers")}/>
        </SettingRow>

        <SettingRow title={t("settings.show_toolbar")}>
          <Switch checked={editor.showToolbar} onChange={setShowToolbar} label={t("settings.show_toolbar")}/>
        </SettingRow>

        <SettingRow title={t("settings.spellcheck")}>
          <Switch checked={editor.spellcheck} onChange={setSpellcheck} label={t("settings.spellcheck")}/>
        </SettingRow>
      </section>

      <section>
        <h3 className="mb-1 text-[length:var(--text-11)] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]">{t("settings.writing_mode")}</h3>

        <SettingRow title={t("settings.typewriter_mode")} description={t("settings.keep_the_cursor_line_centered_on_screen")}>
          <Switch checked={editor.typewriter} onChange={setTypewriter} label={t("settings.typewriter_mode")}/>
        </SettingRow>

        <SettingRow title={t("settings.focus_mode")} description={t("settings.fade_content_outside_the_current_paragraph")}>
          <Switch checked={editor.focusMode} onChange={setFocusMode} label={t("settings.focus_mode")}/>
        </SettingRow>
      </section>

      <section>
        <h3 className="mb-1 text-[length:var(--text-11)] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]">{t("common.preview")}</h3>

        <SettingRow title={t("settings.scroll_sync")} description={t("settings.keep_the_editor_and_preview_scrolled_together")}>
          <Switch checked={preview.syncScroll} onChange={setSyncScroll} label={t("settings.scroll_sync")}/>
        </SettingRow>

        <SettingRow title={t("settings.math")} description={t("settings.render_and_using_katex")}>
          <Switch checked={preview.math} onChange={setMath} label={t("settings.math")}/>
        </SettingRow>

        <SettingRow title={t("settings.diagram")} description={t("settings.render_mermaid_code_blocks_into_flowcharts")}>
          <Switch checked={preview.mermaid} onChange={setMermaid} label={t("settings.diagram")}/>
        </SettingRow>

        <SettingRow title={t("settings.collapse_long_code_blocks")} description={t("settings.collapse_long_code_blocks_description")}>
          <Switch checked={preview.codeBlockCollapse} onChange={setCodeBlockCollapse} label={t("settings.collapse_long_code_blocks")}/>
        </SettingRow>

        {preview.codeBlockCollapse && <SettingRow title={t("settings.code_block_collapse_after")}>
          <Slider label={t("settings.code_block_collapse_after")} className="w-[200px]" value={preview.codeBlockCollapseLines} min={8} max={100} step={1} onChange={setCodeBlockCollapseLines} suffix={t("settings.lines")}/>
        </SettingRow>}

        <SettingRow title={t("settings.show_outline_by_default")}>
          <Switch checked={preview.showToc} onChange={setShowToc} label={t("settings.show_outline_by_default")}/>
        </SettingRow>

        <SettingRow title={t("settings.link_hover_preview")} description={t("settings.link_hover_preview_description")}>
          <Switch checked={preview.linkHover} onChange={setLinkHover} label={t("settings.link_hover_preview")}/>
        </SettingRow>

        <SettingRow title={t("settings.external_images")} description={t("settings.external_images_description")}>
          <Switch checked={preview.externalImages} onChange={setExternalImages} label={t("settings.external_images")}/>
        </SettingRow>

        {preview.linkHover && <>
          <SettingRow title={t("settings.link_hover_delay")}>
            <Slider label={t("settings.link_hover_delay")} className="w-[200px]" value={preview.linkHoverDelayMs} min={150} max={1000} step={50} onChange={setLinkHoverDelayMs} suffix="ms"/>
          </SettingRow>

          <SettingRow title={t("settings.link_preview_length")}>
            <Slider label={t("settings.link_preview_length")} className="w-[200px]" value={preview.linkPreviewLength} min={300} max={8000} step={100} onChange={setLinkPreviewLength} suffix={t("settings.characters")}/>
          </SettingRow>
        </>}
      </section>

      <section>
        <SettingRow title={t("settings.autosave_delay")} description={t("settings.delay_before_uploading_after_you_stop_typing_shorter_makes_more_requests")}>
          <Slider label={t("settings.autosave_delay")} className="w-[200px]" value={editor.autoSaveDelay} min={200} max={3000} step={100} onChange={setAutoSaveDelay} suffix="ms"/>
        </SettingRow>

        <SettingRow title={t("settings.indent_width")}>
          <Segmented<string> label={t("settings.indent_width")} value={String(editor.tabSize)} onChange={setTabSize} options={TAB_SIZE_OPTIONS}/>
        </SettingRow>
      </section>
    </div>);
}